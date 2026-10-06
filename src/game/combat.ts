import { CONFIG, ELEMENT_CONFIG, ENEMIES, ULTIMATE } from './config';
import { stageScale } from './scaling';
import { distanceSq } from './spatial';
import type { Enemy, SkillId, WorldAccess } from './types';

export function damageEnemy(world: WorldAccess, enemy: Enemy, amount: number, skillId: SkillId | 'active' | 'ultimate', elements = true): void {
  if (enemy.hp <= 0 || amount <= 0) return;
  const p = world.state.player;
  // 暴击作用于全部玩家伤害，掷骰走模拟随机流以保持种子确定性；暴击率为 0 时不消耗随机数。
  if (p.critChance > 0 && world.random() < p.critChance) amount *= p.critMultiplier;
  const actual = Math.min(enemy.hp, amount);
  enemy.hp -= amount;
  world.state.damageBySkill[skillId] = (world.state.damageBySkill[skillId] ?? 0) + actual;
  if (elements && skillId !== 'active' && skillId !== 'ultimate') applyElements(world, enemy, amount, skillId);
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
  const xpScale = stageScale(s.stage).xp;
  let write = 0;
  for (const enemy of s.enemies) {
    if (enemy.hp > 0) { s.enemies[write++] = enemy; continue; }
    s.kills++;
    const config = ENEMIES[enemy.kind];
    s.player.energy = Math.min(100, s.player.energy + config.energy);
    if (enemy.kind === 'boss') s.bossDefeated = true;
    else {
      if (enemy.kind.startsWith('elite') && !enemy.eventEnemy) s.eliteKills++;
      const xp = config.xp * xpScale;
      const nearby = s.pickups.find(p => p.kind === 'xp' && distanceSq(p, enemy) < 64 ** 2);
      if (nearby) nearby.value += xp;
      else if (s.pickups.length < CONFIG.pickupLimit) s.pickups.push({ id: world.nextId(), x: enemy.x, y: enemy.y, kind: 'xp', value: xp, attracted: false });
      else {
        const merge = s.pickups.find(p => p.kind === 'xp');
        if (merge) merge.value += xp;
      }
      if (world.random() < .025 && s.pickups.length < CONFIG.pickupLimit) s.pickups.push({ id: world.nextId(), x: enemy.x, y: enemy.y, kind: 'heal', value: 15, attracted: false });
    }
    if (s.event?.enemyId === enemy.id) { world.rewardChoice(); s.event = null; }
  }
  s.enemies.length = write;
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
