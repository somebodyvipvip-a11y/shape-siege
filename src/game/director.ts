import { CONFIG, DIRECTOR, ENEMY_BEHAVIOR as AI, stageAt, stageEnemyAt } from './config';
import { navigationDirection, prepareNavigation } from './navigation';
import { stageScale } from './scaling';
import { blocked, direction, distanceSq } from './spatial';
import type { Enemy, Vec, WorldAccess } from './types';

export class Director {
  private spawnTimer = 0;
  private elites = new Set<number>();
  private events = new Set<number>();
  /** 进入下一关时重置时间轴锚点，让精英与事件在新一关重新触发。 */
  reset(): void { this.spawnTimer = 0; this.elites.clear(); this.events.clear(); }
  update(world: WorldAccess, dt: number): void {
    const s = world.state;
    const stage = stageAt(s.time);
    s.phase = stage.name;
    if (s.time >= CONFIG.timeout - 30) s.warning = '剩余 30 秒：击败六边核心';
    for (const [i, at] of DIRECTOR.eliteTimes.entries()) if (s.time >= at && !this.elites.has(at)) {
      if (world.spawnEnemy(i === 0 ? 'elite-tank' : 'elite-charger')) this.elites.add(at);
    }
    if (s.time >= CONFIG.bossAt && !s.bossSpawned) {
      const boss = world.spawnEnemy('boss');
      if (boss) {
        s.bossSpawned = true;
        // 撤退直接移除，不触发击杀、经验、掉落或汲取；保留精英及其事件。
        s.enemies = s.enemies.filter(enemy => enemy.kind === 'boss' || enemy.kind.startsWith('elite'));
        s.projectiles = s.projectiles.filter(shot => shot.owner !== 'enemy');
        s.explosions.length = 0;
      }
    }
    for (const [i, at] of DIRECTOR.eventTimes.entries()) if (s.time >= at && !this.events.has(at)) {
      this.events.add(at);
      if (!s.event) this.openEvent(world, i === 0 ? 'elite' : 'charge');
    }
    this.updateEvent(world, dt);
    if (s.bossSpawned) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    const relief = DIRECTOR.eliteTimes.some(t => s.time >= t && s.time < t + 15) || (stage.periodicRelief && s.time % 50 > 42);
    const pressureMultiplier = s.time >= 150 ? 1.55 : s.time >= 60 ? 1.2 : 1.1;
    this.spawnTimer = (relief ? .8 : Math.max(.14, .7 - s.time / 800)) * stageScale(s.stage).spawn * pressureMultiplier;
    for (let i = 0; i < stage.batch; i++) world.spawnEnemy(stageEnemyAt(s.time, world.random()));
  }
  private openEvent(world: WorldAccess, kind: 'elite' | 'charge'): void {
    const p = world.state.player;
    for (let attempt = 0; attempt < 32; attempt++) {
      const angle = world.random() * Math.PI * 2, radius = 500 + world.random() * 400;
      const point = { x: p.x + Math.cos(angle) * radius, y: p.y + Math.sin(angle) * radius };
      if (blocked(point, 60, world.state.obstacles)) continue;
      const enemy = kind === 'elite' ? world.spawnEnemy('elite-tank', point, false, true) : null;
      if (kind === 'elite' && !enemy) continue;
      world.state.event = { ...point, kind, remaining: CONFIG.eventLifetime, progress: 0, enemyId: enemy?.id ?? null };
      return;
    }
  }
  private updateEvent(world: WorldAccess, dt: number): void {
    const event = world.state.event;
    if (!event) return;
    event.remaining -= dt;
    if (event.kind === 'charge' && distanceSq(event, world.state.player) <= CONFIG.eventRadius ** 2) event.progress += dt;
    if (event.progress >= CONFIG.chargeRequired) { world.rewardChoice(); world.state.event = null; }
    else if (event.remaining <= 0) {
      if (event.enemyId !== null) {
        const index = world.state.enemies.findIndex(e => e.id === event.enemyId);
        if (index >= 0) world.state.enemies.splice(index, 1);
      }
      world.state.event = null;
    }
  }
}

function steering(world: WorldAccess, enemy: Enemy, target: Vec, speed: number, dt: number): void {
  const d = navigationDirection(world, enemy, target, speed * dt);
  let separationX = 0, separationY = 0;
  for (const neighbor of world.nearby(enemy, enemy.radius * 2 + 25)) {
    if (neighbor.id === enemy.id) continue;
    const distance = Math.sqrt(distanceSq(enemy, neighbor));
    const gap = enemy.radius + neighbor.radius;
    if (distance > 0 && distance < gap) {
      separationX += (enemy.x - neighbor.x) / distance * (gap - distance) * 2;
      separationY += (enemy.y - neighbor.y) / distance * (gap - distance) * 2;
    }
  }
  world.move(enemy, (d.x * speed + separationX) * dt, (d.y * speed + separationY) * dt);
}
function warning(world: WorldAccess, enemy: Enemy, seconds: number): void {
  enemy.state = 'warning'; enemy.timer = seconds; enemy.target = { x: world.state.player.x, y: world.state.player.y };
  enemy.attackDirection = direction(enemy, enemy.target);
  enemy.attackId = world.nextId(); enemy.hitPlayer = false;
}
export function updateEnemies(world: WorldAccess, dt: number): void {
  prepareNavigation(world, dt);
  const p = world.state.player;
  // 并发锁定上限：统计本帧已处于「预警锁定」的指向性敌人，超过 AI.aimCap 时不再新增锁定，
  // 避免后期大量远程/冲刺敌人同时把攻击指向玩家。未获得槽位的敌人继续追击，槽位释放后自然补位。
  let aimers = 0;
  for (const enemy of world.state.enemies) if (enemy.hp > 0 && enemy.state === 'warning') aimers++;
  for (const enemy of world.state.enemies) {
    if (enemy.hp <= 0) continue;
    enemy.timer -= dt;
    const speed = enemy.speed * (1 - enemy.slowFactor);
    if (enemy.kind === 'boss') updateBoss(world, enemy, dt);
    else if (enemy.kind === 'charger' || enemy.kind === 'elite-charger') {
      if (enemy.state === 'warning' && enemy.timer <= 0) { enemy.state = 'attack'; enemy.timer = AI.chargeDuration; }
      else if (enemy.state === 'attack') {
        const d = enemy.attackDirection;
        world.move(enemy, d.x * AI.chargeSpeed * dt, d.y * AI.chargeSpeed * dt);
        if (enemy.timer <= 0) { enemy.state = 'rest'; enemy.timer = AI.chargeRest; }
      } else if (enemy.state !== 'warning') {
        if (enemy.timer <= 0 && distanceSq(enemy, p) < AI.chargeRange ** 2 && aimers < AI.aimCap) { warning(world, enemy, DIRECTOR.chargeWarning); aimers++; }
        else steering(world, enemy, p, speed, dt);
      }
    } else if (enemy.kind === 'ranged') {
      if (enemy.state === 'warning' && enemy.timer <= 0) {
        const d = direction(enemy, enemy.target);
        world.addProjectile({ x: enemy.x, y: enemy.y, owner: 'enemy', skillId: 'enemy', damage: enemy.damage, vx: d.x * AI.rangedShotSpeed, vy: d.y * AI.rangedShotSpeed, life: 5, radius: 7 });
        enemy.state = 'rest'; enemy.timer = AI.rangedRest;
      } else if (enemy.state !== 'warning') {
        if (distanceSq(enemy, p) > AI.rangedRange ** 2) steering(world, enemy, p, speed, dt);
        else if (enemy.timer <= 0 && aimers < AI.aimCap) { warning(world, enemy, AI.rangedWarning); aimers++; }
      }
    } else steering(world, enemy, p, speed, dt);
    if (distanceSq(enemy, p) <= (enemy.radius + p.radius) ** 2) {
      if (enemy.state === 'attack' && (enemy.kind.includes('charger') || (enemy.kind === 'boss' && enemy.bossPattern === 1))) {
        if (!enemy.hitPlayer && p.dashTime <= 0) { world.damagePlayer(enemy.damage); enemy.hitPlayer = true; }
      } else world.damagePlayer(enemy.damage, true);
    }
  }
}
function updateBoss(world: WorldAccess, boss: Enemy, dt: number): void {
  const p = world.state.player;
  boss.summonTimer -= dt;
  if (boss.summonTimer <= 0) {
    boss.summonTimer = DIRECTOR.summonInterval;
    const alive = world.state.enemies.filter(e => e.summoned && e.hp > 0).length;
    for (let i = 0; i < Math.min(DIRECTOR.summonCount, DIRECTOR.summonCap - alive); i++) world.spawnEnemy('chaser', undefined, true);
  }
  if (boss.state === 'warning') {
    if (boss.timer > 0) return;
    boss.state = 'attack';
    boss.timer = boss.bossPattern === 1 ? AI.bossChargeDuration : .25;
    if (boss.bossPattern === 0) {
      const d = direction(boss, boss.target), angle = Math.atan2(d.y, d.x);
      for (let i = -3; i <= 3; i++) world.addProjectile({ x: boss.x, y: boss.y, owner: 'enemy', skillId: 'enemy', radius: 9, damage: boss.damage, vx: Math.cos(angle + i * AI.bossShotSpread) * AI.bossShotSpeed, vy: Math.sin(angle + i * AI.bossShotSpread) * AI.bossShotSpeed, life: 6 });
    }
  } else if (boss.state === 'attack') {
    if (boss.bossPattern === 1) {
      const d = boss.attackDirection;
      world.move(boss, d.x * AI.bossChargeSpeed * dt, d.y * AI.bossChargeSpeed * dt);
    }
    if (boss.timer <= 0) { boss.state = 'rest'; boss.timer = boss.hp < boss.maxHp * .5 ? AI.bossEnragedRest : AI.bossRest; boss.bossPattern = (boss.bossPattern + 1) % 3; }
  } else if (boss.timer <= 0) {
    warning(world, boss, boss.bossPattern === 1 ? DIRECTOR.bossChargeWarning : boss.bossPattern === 2 ? DIRECTOR.blastWarning : .8);
    if (boss.bossPattern === 2) {
      // Three spaced disks with broad gaps leave safe routes in every round.
      for (const offset of [{ x: 0, y: 0 }, { x: -240, y: 160 }, { x: 240, y: 160 }]) {
        world.addEffect({ x: p.x + offset.x, y: p.y + offset.y, kind: 'warning', owner: 'enemy', skillId: 'enemy', radius: AI.bossBlastRadius, damage: boss.damage, delay: DIRECTOR.blastWarning, life: DIRECTOR.blastWarning + .25 });
      }
    }
  } else steering(world, boss, p, boss.speed * (1 - boss.slowFactor), dt);
}
