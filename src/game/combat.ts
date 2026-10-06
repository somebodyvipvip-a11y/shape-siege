import { CONFIG, ELEMENT_CONFIG, ENEMIES, EXPLOSION, ULTIMATE } from './config';
import { stageScale } from './scaling';
import { blocked, distanceSq } from './spatial';
import type { Enemy, SkillId, WorldAccess } from './types';

export function damageEnemy(world: WorldAccess, enemy: Enemy, amount: number, skillId: SkillId | 'active' | 'ultimate' | 'explosion', elements = true): void {
  if (enemy.hp <= 0 || amount <= 0) return;
  const p = world.state.player;
  // 暴击作用于全部玩家伤害，掷骰走模拟随机流以保持种子确定性；暴击率为 0 时不消耗随机数。
  if (skillId !== 'explosion' && p.critChance > 0 && world.random() < p.critChance) amount *= p.critMultiplier;
  if (enemy.kind === 'exploder' && !enemy.explosionArmed && skillId !== 'explosion') {
    enemy.explosionArmed = true;
    const scale = stageScale(world.state.stage).damage;
    world.state.explosions.push({ sourceId: enemy.id, x: enemy.x, y: enemy.y, remaining: EXPLOSION.fuse,
      radius: EXPLOSION.radius, damage: EXPLOSION.damage * scale, playerDamage: EXPLOSION.playerDamage * scale });
  }
  const actual = Math.min(enemy.hp, amount);
  enemy.hp -= amount;
  world.state.damageBySkill[skillId] = (world.state.damageBySkill[skillId] ?? 0) + actual;
  if (elements && skillId !== 'active' && skillId !== 'ultimate' && skillId !== 'explosion') applyElements(world, enemy, amount, skillId);
}
function burn(enemy: Enemy, amount: number, skillId: SkillId): void {
  enemy.burn = { dps: Math.max(enemy.burn?.dps ?? 0, amount * ELEMENT_CONFIG.burnRatio), remaining: ELEMENT_CONFIG.duration,
    skillId: !enemy.burn || amount * ELEMENT_CONFIG.burnRatio >= enemy.burn.dps ? skillId : enemy.burn.skillId };
}
function slow(enemy: Enemy, factor: number): void {
  enemy.slowTime = ELEMENT_CONFIG.duration;
  enemy.slowFactor = Math.max(enemy.slowFactor, enemy.kind === 'boss' ? factor / 2 : factor);
}
function applyElements(world: WorldAccess, enemy: Enemy, amount: number, id: SkillId): void {
  const elements = world.state.player.skills.find(s => s.id === id)?.elements ?? [];
  if (!elements.length) return;
  const fire = elements.includes('fire'), ice = elements.includes('ice'), lightning = elements.includes('lightning');
  if (fire && ice) {
    const last = enemy.lastThermal.get(id) ?? -Infinity;
    if ((enemy.thermal.get(id) ?? 0) > 0 && world.state.time - last >= ELEMENT_CONFIG.thermalInterval) {
      enemy.lastThermal.set(id, world.state.time);
      const targets = [...world.nearby(enemy, ELEMENT_CONFIG.thermalRadius + 60)];
      for (const target of targets) if (distanceSq(target, enemy) <= (ELEMENT_CONFIG.thermalRadius + target.radius) ** 2) world.damage(target, amount * ELEMENT_CONFIG.thermalRatio, id, false);
      world.addEffect({ x: enemy.x, y: enemy.y, kind: 'blast', skillId: id, radius: ELEMENT_CONFIG.thermalRadius, life: .18 });
    }
    enemy.thermal.set(id, ELEMENT_CONFIG.duration);
    slow(enemy, ELEMENT_CONFIG.thermalSlow);
    return;
  }
  if (fire) burn(enemy, amount, id);
  if (ice) slow(enemy, ELEMENT_CONFIG.iceSlow);
  if (lightning) {
    const targets = [...world.nearby(enemy, ELEMENT_CONFIG.chainRadius)].filter(e => e.id !== enemy.id).sort((a, b) => distanceSq(a, enemy) - distanceSq(b, enemy)).slice(0, ELEMENT_CONFIG.chainCount);
    for (const target of targets) {
      const chainDamage = amount * ELEMENT_CONFIG.chainRatio;
      world.damage(target, chainDamage, id, false);
      if (fire) burn(target, chainDamage, id);
      if (ice) slow(target, ELEMENT_CONFIG.iceSlow);
    }
  }
}
/** 独立保存引信，死亡后仍爆炸，不受装饰特效容量影响。 */
export function updateExplosions(world: WorldAccess, dt: number): void {
  const s = world.state;
  let write = 0;
  for (const explosion of s.explosions) {
    const source = s.enemies.find(enemy => enemy.id === explosion.sourceId);
    if (source) { explosion.x = source.x; explosion.y = source.y; }
    explosion.remaining -= dt;
    if (explosion.remaining > 1e-8) { s.explosions[write++] = explosion; continue; }
    for (const enemy of [...world.nearby(explosion, explosion.radius + 60)]) {
      if (enemy.id !== explosion.sourceId && distanceSq(enemy, explosion) <= (explosion.radius + enemy.radius) ** 2)
        world.damage(enemy, explosion.damage, 'explosion', false);
    }
    if (source && source.hp > 0) world.damage(source, source.hp, 'explosion', false);
    if (distanceSq(s.player, explosion) <= (explosion.radius + s.player.radius) ** 2) world.damagePlayer(explosion.playerDamage);
    world.addEffect({ x: explosion.x, y: explosion.y, owner: 'player', skillId: 'explosion', kind: 'blast', radius: explosion.radius, life: .3 });
  }
  s.explosions.length = write;
}
export function damagePlayer(world: WorldAccess, amount: number, contact = false): void {
  const p = world.state.player;
  if (p.hp <= 0 || (contact && (p.invulnerable > 0 || p.dashTime > 0))) return;
  if (p.characterId === 'square' && p.ultimateDuration > 0) amount *= 1 - ULTIMATE.square.reduction;
  // 防御结算顺序：闪避（仅接触伤害）→ 护甲（全来源固定减免，至少保留 1 点）→ 护盾 → 生命。
  if (contact && p.dodge > 0) amount *= 1 - p.dodge;
  if (p.armor > 0) amount = Math.max(1, amount - p.armor);
  const shieldDamage = Math.min(p.shield, amount);
  p.shield -= shieldDamage;
  p.hp = Math.max(0, p.hp - (amount - shieldDamage));
  if (contact) p.invulnerable = CONFIG.contactProtection;
}
export function updateStatuses(world: WorldAccess, dt: number): void {
  for (const enemy of world.state.enemies) {
    if (enemy.hp <= 0) continue;
    if (enemy.burn) {
      world.damage(enemy, enemy.burn.dps * Math.min(dt, enemy.burn.remaining), enemy.burn.skillId, false);
      enemy.burn.remaining -= dt;
      if (enemy.burn.remaining <= 0) enemy.burn = null;
    }
    enemy.slowTime -= dt;
    if (enemy.slowTime <= 0) enemy.slowFactor = 0;
    for (const [id, time] of enemy.thermal) { if (time <= dt) enemy.thermal.delete(id); else enemy.thermal.set(id, time - dt); }
  }
}
export function collectDeaths(world: WorldAccess): void {
  const s = world.state;
  const xpScale = stageScale(s.stage).xp * CONFIG.xpMultiplier;
  let write = 0;
  for (const enemy of s.enemies) {
    if (enemy.hp > 0) { s.enemies[write++] = enemy; continue; }
    const explosion = s.explosions.find(pending => pending.sourceId === enemy.id);
    if (explosion) { explosion.x = enemy.x; explosion.y = enemy.y; }
    s.kills++;
    const config = ENEMIES[enemy.kind];
    s.player.energy = Math.min(100, s.player.energy + config.energy);
    // 生命汲取（稀有卡）：仅在存活时按击杀回复，避免复活倒计时期间被治疗打断。
    if (s.player.lifesteal > 0 && s.player.hp > 0) s.player.hp = Math.min(s.player.maxHp, s.player.hp + s.player.maxHp * s.player.lifesteal);
    if (enemy.kind === 'boss') s.bossDefeated = true;
    else {
      if (enemy.kind.startsWith('elite') && !enemy.eventEnemy) s.eliteKills++;
      dropXp(world, enemy, config.xp * xpScale, config.xpDrops);
      rollDrops(world, enemy.x, enemy.y);
    }
    if (s.event?.enemyId === enemy.id) { world.rewardChoice(); s.event = null; }
  }
  s.enemies.length = write;
}
/** 按怪物种类散落多颗经验；仅到达总掉落上限后才压缩，保留总收益。 */
function dropXp(world: WorldAccess, enemy: Enemy, total: number, count: number): void {
  if (total <= 0 || count <= 0) return;
  const s = world.state, unit = total / count;
  for (let i = 0; i < count; i++) {
    const value = i === count - 1 ? total - unit * (count - 1) : unit;
    if (s.pickups.length >= CONFIG.pickupLimit) {
      // 只在容量耗尽时合并最近的经验，不改变正常掉落的颗粒数。
      let nearest = s.pickups.find(drop => drop.kind === 'xp');
      for (const drop of s.pickups) if (drop.kind === 'xp' && nearest && distanceSq(drop, enemy) < distanceSq(nearest, enemy)) nearest = drop;
      if (nearest) nearest.value += value;
      else world.grantXp(value); // 全部容量被非经验物占用时，直接计入，避免损失经验。
      continue;
    }
    // 使用实体编号决定相位，不额外消耗战斗随机流。
    const angle = enemy.id * 2.399963229728653 + i * Math.PI * 2 / count;
    const radius = count === 1 ? 0 : enemy.radius + 10;
    const point = { x: enemy.x + Math.cos(angle) * radius, y: enemy.y + Math.sin(angle) * radius };
    if (blocked(point, 9, s.obstacles)) { point.x = enemy.x; point.y = enemy.y; }
    s.pickups.push({ id: world.nextId(), ...point, kind: 'xp', value, attracted: false });
  }
}
/** 掉落平衡：补血＝续航（受伤越重掉率越高，满血不产出），生命上限＝构筑（低概率永久收益）。 */
function rollDrops(world: WorldAccess, x: number, y: number): void {
  const s = world.state, p = s.player;
  const luck = 1 + .08 * p.luck;
  if (p.hp < p.maxHp && world.random() < (.04 + .04 * (1 - p.hp / p.maxHp)) * luck && s.pickups.length < CONFIG.pickupLimit)
    s.pickups.push({ id: world.nextId(), x, y, kind: 'heal', value: Math.max(10, p.maxHp * .12), attracted: false });
  if (world.random() < (.009 + .0015 * p.luck) * luck && s.pickups.length < CONFIG.pickupLimit)
    s.pickups.push({ id: world.nextId(), x, y, kind: 'maxhp', value: 6 + s.stage, attracted: false });
}
export function resolveResult(world: WorldAccess): void {
  const s = world.state;
  if (s.result) return;
  // 连续闯关：首领被击破时由 GameWorld 推进关卡，不再直接结算胜利；此处只处理失败结局。
  // 生命清零：还有剩余命数则扣 1 条命并进入复活等待，命数耗尽才判定死亡。
  if (s.player.hp <= 0 && s.reviveTimer <= 0) {
    if (s.lives > 1) { s.lives--; s.reviveTimer = CONFIG.reviveDelay; }
    else s.result = 'death';
  } else if (!s.bossDefeated && s.time >= CONFIG.timeout) s.result = 'timeout';
  if (s.result) {
    s.projectiles.length = 0;
    s.effects.length = 0;
    s.choices = [];
    s.pendingUpgrades = 0;
  }
}
