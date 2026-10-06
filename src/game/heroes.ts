import { CHARACTERS, HERO_MECHANICS as HERO, SKILLS } from './config';
import { skillDamage } from './progression';
import { blocked, direction, distanceSq } from './spatial';
import type { Effect, Enemy, SkillState, Vec, WorldAccess } from './types';

function priorityTarget(world: WorldAccess, range: number): Enemy | undefined {
  const p = world.state.player;
  return [...world.nearby(p, range)].filter(e => e.hp > 0).sort((a, b) => {
    const rank = (e: Enemy): number => e.kind === 'boss' ? 2 : e.kind.startsWith('elite') ? 1 : 0;
    return rank(b) - rank(a) || distanceSq(a, p) - distanceSq(b, p);
  })[0];
}
function hitArea(world: WorldAccess, effect: Pick<Effect, 'x' | 'y' | 'radius' | 'damage' | 'skillId' | 'slow'>): void {
  for (const enemy of [...world.nearby(effect, effect.radius + 60)]) {
    if (enemy.hp <= 0 || distanceSq(enemy, effect) > (effect.radius + enemy.radius) ** 2) continue;
    world.damage(enemy, effect.damage, effect.skillId === 'enemy' ? 'active' : effect.skillId);
    if (effect.slow) { enemy.slowTime = Math.max(enemy.slowTime, 2); enemy.slowFactor = Math.max(enemy.slowFactor, effect.slow * (enemy.kind === 'boss' ? .5 : 1)); }
  }
  world.addEffect({ x: effect.x, y: effect.y, owner: 'player', skillId: effect.skillId, kind: 'blast', radius: effect.radius, life: .25 });
}
function beam(world: WorldAccess, origin: Vec, aim: Vec, length: number, radius: number, damage: number, skillId: Effect['skillId'], delay = 0, knockback = 0): void {
  let reach = 0;
  // 与弹体同样受地形阻挡，预警和实际命中共用截断后的长度。
  for (let step = 12; reach < length; step += 12) {
    const next = Math.min(step, length);
    if (blocked({ x: origin.x + aim.x * next, y: origin.y + aim.y * next }, radius, world.state.obstacles)) break;
    reach = next;
  }
  world.addEffect({ ...origin, kind: 'beam', owner: 'player', skillId, radius, length: reach, direction: { ...aim }, damage, delay, knockback, life: delay + .22 });
}
function sigil(world: WorldAccess, position: Vec, skill: SkillState, ultimate = false): Effect | null {
  const p = world.state.player;
  const point = blocked(position, 12, world.state.obstacles) ? p : position;
  return world.addEffect({ x: point.x, y: point.y, kind: 'sigil', skillId: ultimate ? 'ultimate' : 'sigil', owner: 'player',
    radius: SKILLS.sigil.radius + (skill.level - 1) * 8 + (skill.enhanced ? 25 : 0),
    damage: ultimate ? HERO.pentagon.webDamage * (1 + p.damageBonus) : skillDamage(world.state, 'sigil'),
    life: ultimate ? CHARACTERS.pentagon.ultimateDuration + .25 : HERO.pentagon.sigilLife,
    delay: ultimate ? CHARACTERS.pentagon.ultimateDuration : 0, armed: ultimate, slow: HERO.pentagon.slow });
}
function sweep(world: WorldAccess, aim: Vec, radius: number, damage: number, skillId: Effect['skillId'], angle: number, delay = 0): void {
  const p = world.state.player;
  world.addEffect({ x: p.x, y: p.y, kind: 'sweep', owner: 'player', skillId, direction: { ...aim }, radius, damage, angle, delay, life: delay + .22, knockback: 25 });
}

export function activateHeroSkill(world: WorldAccess): boolean {
  const p = world.state.player;
  if (p.characterId === 'diamond') {
    const origin = { x: p.x, y: p.y };
    for (let moved = 0; moved < HERO.diamond.blinkDistance; moved += 10) {
      const before = { x: p.x, y: p.y };
      world.move(p, p.lastDirection.x * 10, p.lastDirection.y * 10);
      if (distanceSq(before, p) < 90) break;
    }
    world.addEffect({ ...origin, kind: 'decoy', owner: 'player', skillId: 'active', radius: p.radius, life: HERO.diamond.decoyDuration });
    return true;
  }
  if (p.characterId === 'pentagon') {
    const traps = world.state.effects.filter(e => e.kind === 'sigil' && e.skillId === 'sigil' && !e.triggered && e.life > 0);
    if (traps.length) for (const trap of traps) { hitArea(world, trap); trap.triggered = true; trap.life = 0; }
    else sigil(world, p, p.skills.find(s => s.id === 'sigil')!);
    return true;
  }
  if (p.characterId === 'hexagon') {
    const target = priorityTarget(world, HERO.hexagon.activeRadius);
    p.skillDuration = HERO.hexagon.windup;
    sweep(world, target ? direction(p, target) : p.lastDirection, HERO.hexagon.activeRadius, HERO.hexagon.activeDamage * (1 + p.damageBonus), 'active', Math.PI * 2 / 3, HERO.hexagon.windup);
    return true;
  }
  return false;
}
export function activateHeroUltimate(world: WorldAccess): boolean {
  const p = world.state.player;
  if (p.characterId === 'diamond') {
    const target = priorityTarget(world, HERO.diamond.beamLength);
    beam(world, p, target ? direction(p, target) : p.lastDirection, HERO.diamond.beamLength, HERO.diamond.beamWidth, HERO.diamond.ultimateDamage * (1 + p.damageBonus), 'ultimate', CHARACTERS.diamond.ultimateDuration);
    return true;
  }
  if (p.characterId === 'pentagon') {
    // 同时最多一组大招法阵，通用特效上限仍由 world.addEffect 管理。
    const skill = p.skills.find(s => s.id === 'sigil')!;
    for (let i = 0; i < 5; i++) {
      const angle = -Math.PI / 2 + i * Math.PI * 2 / 5;
      sigil(world, { x: p.x + Math.cos(angle) * 130, y: p.y + Math.sin(angle) * 130 }, skill, true);
    }
    world.addEffect({ x: p.x, y: p.y, kind: 'web', owner: 'player', skillId: 'ultimate', radius: HERO.pentagon.webRadius, slow: HERO.pentagon.slow, life: CHARACTERS.pentagon.ultimateDuration });
    return true;
  }
  return p.characterId === 'hexagon';
}
export function updateHeroUltimate(world: WorldAccess, previous: number): void {
  const p = world.state.player;
  if (p.characterId === 'hexagon' && previous > 0 && p.ultimateDuration <= 0) {
    hitArea(world, { x: p.x, y: p.y, radius: HERO.hexagon.finaleRadius, damage: HERO.hexagon.finaleDamage * (1 + p.damageBonus), skillId: 'ultimate' });
  }
}
export function fireHeroSkill(world: WorldAccess, skill: SkillState): boolean | undefined {
  const p = world.state.player, config = SKILLS[skill.id];
  const damage = skillDamage(world.state, skill.id);
  if (skill.id === 'refraction') return false; // 由聚焦射线命中触发，不独立空放。
  if (skill.id === 'sigil') {
    const count = world.state.effects.filter(e => e.kind === 'sigil' && e.skillId === 'sigil' && !e.triggered && e.life > 0).length;
    if (count >= HERO.pentagon.sigilLimit + (skill.enhanced ? 2 : 0)) return false;
    sigil(world, { x: p.x - p.lastDirection.x * 46, y: p.y - p.lastDirection.y * 46 }, skill);
    return true;
  }
  if (!['base-diamond', 'base-pentagon', 'base-hexagon', 'fissure'].includes(skill.id)) return undefined;
  const range = config.range + (skill.id === 'base-hexagon' && p.ultimateDuration > 0 ? HERO.hexagon.overdriveRange : 0);
  const target = priorityTarget(world, range);
  if (!target) return false;
  const aim = direction(p, target);
  if (skill.id === 'base-diamond') beam(world, p, aim, range, config.radius + (skill.enhanced ? 5 : 0), damage, skill.id);
  else if (skill.id === 'base-pentagon') {
    for (let i = 0; i < (skill.enhanced ? 2 : 1); i++) world.addProjectile({ x: p.x, y: p.y, skillId: skill.id, damage, vx: aim.x * 400, vy: aim.y * 400, mode: 'homing', targetId: target.id, range, radius: config.radius, life: 2.5 });
  } else if (skill.id === 'base-hexagon') sweep(world, aim, range, damage, skill.id, HERO.hexagon.sweepAngle + (skill.enhanced ? Math.PI * 2 / 9 : 0));
  else beam(world, p, aim, range, config.radius + (skill.enhanced ? 12 : 0), damage, skill.id, 0, 70 + (skill.enhanced ? 30 : 0));
  return true;
}
function refract(world: WorldAccess, origin: Enemy): void {
  const skill = world.state.player.skills.find(s => s.id === 'refraction');
  if (!skill || skill.cooldown > 0) return;
  const targets = [...world.nearby(origin, SKILLS.refraction.range)].filter(e => e.id !== origin.id && e.hp > 0)
    .sort((a, b) => distanceSq(a, origin) - distanceSq(b, origin)).slice(0, skill.enhanced ? 4 : 2);
  if (!targets.length) return;
  skill.cooldown = SKILLS.refraction.cooldown * (1 - world.state.player.cooldownReduction);
  for (const target of targets) beam(world, origin, direction(origin, target), Math.sqrt(distanceSq(origin, target)), SKILLS.refraction.radius, skillDamage(world.state, 'refraction'), 'refraction');
}
/** 返回 true 表示已处理该类特效，通用技能不再重复结算。 */
export function updateHeroEffect(world: WorldAccess, effect: Effect): boolean {
  if (!['beam', 'sweep', 'sigil', 'web', 'decoy'].includes(effect.kind)) return false;
  if (effect.life <= 0) return true;
  if (effect.kind === 'decoy') return true;
  if (effect.kind === 'web') {
    for (const enemy of world.nearby(effect, effect.radius + 60)) if (enemy.hp > 0 && distanceSq(enemy, effect) <= (effect.radius + enemy.radius) ** 2) {
      enemy.slowTime = Math.max(enemy.slowTime, .2); enemy.slowFactor = Math.max(enemy.slowFactor, (effect.slow ?? .3) * (enemy.kind === 'boss' ? .5 : 1));
    }
    return true;
  }
  if (effect.kind === 'sigil') {
    if (effect.triggered) return true;
    if (!effect.armed && world.nearby(effect, HERO.pentagon.triggerRadius + 60).some(e => e.hp > 0 && distanceSq(e, effect) <= (HERO.pentagon.triggerRadius + e.radius) ** 2)) { effect.armed = true; effect.delay = HERO.pentagon.delay; }
    if (effect.armed && effect.delay <= 1e-8) { effect.triggered = true; hitArea(world, effect); effect.life = 0; }
    return true;
  }
  if (effect.delay > 1e-8 || effect.triggered) return true;
  effect.triggered = true;
  const aim = effect.direction!, length = effect.length ?? effect.radius;
  let first: Enemy | undefined;
  for (const enemy of [...world.nearby(effect, length + effect.radius + 60)]) {
    if (enemy.hp <= 0) continue;
    const dx = enemy.x - effect.x, dy = enemy.y - effect.y;
    const forward = dx * aim.x + dy * aim.y;
    const side = Math.abs(dx * aim.y - dy * aim.x);
    const inShape = effect.kind === 'beam'
      ? forward >= 0 && forward <= length + enemy.radius && side <= effect.radius + enemy.radius
      : Math.hypot(dx, dy) <= effect.radius + enemy.radius && Math.abs(Math.atan2(side, forward)) <= (effect.angle ?? Math.PI) / 2 + Math.asin(Math.min(1, enemy.radius / Math.max(1, Math.hypot(dx, dy))));
    if (!inShape || effect.hit.has(enemy.id)) continue;
    effect.hit.add(enemy.id); first ??= enemy;
    world.damage(enemy, effect.damage, effect.skillId === 'enemy' ? 'active' : effect.skillId);
    if (effect.knockback && enemy.kind !== 'boss') { const d = direction(effect, enemy); world.move(enemy, d.x * effect.knockback, d.y * effect.knockback); }
  }
  if (first && effect.skillId === 'base-diamond') refract(world, first);
  return true;
}
export function decoyTarget(world: WorldAccess, enemy: Enemy): Vec {
  if (enemy.kind === 'boss' || enemy.kind.startsWith('elite')) return world.state.player;
  const decoy = world.state.effects.find(e => e.kind === 'decoy' && e.life > 0 && distanceSq(e, enemy) <= HERO.diamond.decoyRange ** 2);
  return decoy ?? world.state.player;
}
