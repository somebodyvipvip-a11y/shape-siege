import { ACTIVE, CHARACTERS, CONFIG, HERO_MECHANICS, SKILLS, ULTIMATE } from './config';
import { activateHeroSkill, activateHeroUltimate, canCollapseWeave, fireHeroSkill, updateHeroEffect, updateHeroUltimate } from './heroes';
import { skillDamage } from './progression';
import { addFeedback } from './feedback';
import { blocked, direction, distanceSq } from './spatial';
import type { Enemy, Projectile, SkillId, SkillState, Vec, WorldAccess } from './types';

function nearest(world: WorldAccess, point: Vec, range: number): Enemy | undefined {
  let best: Enemy | undefined, distance = Infinity;
  for (const enemy of world.nearby(point, range)) {
    const next = distanceSq(point, enemy);
    if (next < distance) { distance = next; best = enemy; }
  }
  return best;
}
function push(world: WorldAccess, enemy: Enemy, origin: Vec, amount: number): void {
  if (enemy.kind === 'boss') return;
  const d = direction(origin, enemy);
  const factor = enemy.kind.startsWith('elite') ? .5 : 1;
  world.move(enemy, d.x * amount * factor, d.y * amount * factor);
}
function blast(world: WorldAccess, origin: Vec, radius: number, damage: number, id: SkillId | 'active' | 'ultimate', knockback = 0): void {
  const targets = [...world.nearby(origin, radius + 60)];
  for (const target of targets) if (distanceSq(origin, target) <= (radius + target.radius) ** 2) {
    world.damage(target, damage, id, id !== 'active' && id !== 'ultimate');
    if (knockback) push(world, target, origin, knockback);
  }
  world.addEffect({ x: origin.x, y: origin.y, kind: 'blast', skillId: id, radius, life: .22 });
}
export function canAutoActivate(world: WorldAccess): boolean {
  const p = world.state.player;
  if (p.characterId === 'pentagon') return canCollapseWeave(world);
  if (p.characterId === 'hexagon') return !!nearest(world, p, HERO_MECHANICS.hexagon.activeRadius);
  if (!nearest(world, p, 300)) return false;
  if (p.characterId !== 'triangle') return true;
  for (let distance = 20; distance <= ACTIVE.triangle.distance; distance += 20) {
    if (blocked({ x: p.x + p.lastDirection.x * distance, y: p.y + p.lastDirection.y * distance }, p.radius, world.state.obstacles)) return false;
  }
  return true;
}
export function activateSkill(world: WorldAccess): boolean {
  const p = world.state.player;
  if (p.skillCooldown > 0) return false;
  p.skillCooldown = CHARACTERS[p.characterId].skillCooldown * (1 - p.cooldownReduction);
  if (activateHeroSkill(world)) return true;
  if (p.characterId === 'square') {
    p.shield = ACTIVE.square.shield; p.shieldTime = ACTIVE.square.duration;
    for (const enemy of [...world.nearby(p, ACTIVE.square.radius + 60)]) if (distanceSq(p, enemy) <= (ACTIVE.square.radius + enemy.radius) ** 2) push(world, enemy, p, ACTIVE.square.knockback);
    world.addEffect({ x: p.x, y: p.y, kind: 'blast', skillId: 'active', radius: ACTIVE.square.radius, life: .3 });
  } else if (p.characterId === 'circle') p.skillDuration = ACTIVE.circle.duration;
  else {
    p.dashTime = ACTIVE.triangle.duration; p.dashRemaining = ACTIVE.triangle.distance;
    p.dashDirection = { ...p.lastDirection };
    world.addEffect({ x: p.x, y: p.y, kind: 'dash', skillId: 'active', damage: ACTIVE.triangle.damage * (1 + p.damageBonus), radius: p.radius + 8, life: ACTIVE.triangle.duration });
  }
  return true;
}
export function activateUltimate(world: WorldAccess): boolean {
  const p = world.state.player;
  if (p.energy < 100 || p.ultimateDuration > 0) return false;
  p.energy = 0; p.ultimateDuration = CHARACTERS[p.characterId].ultimateDuration; p.ultimateTick = 0;
  if (activateHeroUltimate(world)) return true;
  if (p.characterId === 'triangle') radialBlades(world);
  else world.addEffect({ x: p.x, y: p.y, kind: 'field', skillId: 'ultimate', radius: p.characterId === 'square' ? ULTIMATE.square.radius : ULTIMATE.circle.radius, life: p.ultimateDuration });
  return true;
}
function radialBlades(world: WorldAccess): void {
  const p = world.state.player;
  for (let i = 0; i < ULTIMATE.triangle.blades; i++) {
    const angle = i / ULTIMATE.triangle.blades * Math.PI * 2;
    world.addProjectile({ x: p.x, y: p.y, skillId: 'base-triangle', damage: ULTIMATE.triangle.damage * (1 + p.damageBonus), vx: Math.cos(angle) * 500, vy: Math.sin(angle) * 500, radius: 8, pierce: 3, life: 1.6, attackId: -1 });
  }
}
export function updateUltimate(world: WorldAccess, dt: number): void {
  const p = world.state.player;
  if (p.ultimateDuration <= 0) return;
  const previous = p.ultimateDuration;
  p.ultimateDuration = Math.max(0, p.ultimateDuration - dt);
  updateHeroUltimate(world, previous);
  if (['diamond', 'pentagon', 'hexagon'].includes(p.characterId)) return;
  p.ultimateTick += dt;
  if (p.characterId === 'square' && p.ultimateTick + 1e-8 >= 1) {
    p.ultimateTick -= 1;
    blast(world, p, ULTIMATE.square.radius, ULTIMATE.square.damage * (1 + p.damageBonus), 'ultimate');
  } else if (p.characterId === 'circle') {
    for (const enemy of [...world.nearby(p, ULTIMATE.circle.radius)]) {
      if (enemy.kind === 'boss') continue;
      const d = direction(enemy, p), amount = ULTIMATE.circle.pullSpeed * dt * (enemy.kind.startsWith('elite') ? .5 : 1);
      world.move(enemy, d.x * amount, d.y * amount);
    }
    if (p.ultimateDuration <= 1e-8) { p.ultimateDuration = 0; blast(world, p, ULTIMATE.circle.radius, ULTIMATE.circle.damage * (1 + p.damageBonus), 'ultimate'); }
  } else if (p.characterId === 'triangle' && p.ultimateTick + 1e-8 >= .4 && p.ultimateDuration > .01) {
    p.ultimateTick -= .4;
    radialBlades(world);
  }
}
export function updateSkills(world: WorldAccess, dt: number): void {
  const p = world.state.player;
  for (const skill of p.skills) {
    skill.cooldown = Math.max(0, skill.cooldown - dt);
    if (skill.id === 'base-circle') { updateOrbit(world, skill); continue; }
    if (skill.cooldown > 0) continue;
    if (fireSkill(world, skill)) {
      const cooldownGain = ['homing', 'shockwave', 'meteor'].includes(skill.id) ? 1 - (skill.level - 1) * .04 : 1;
      const overdrive = skill.id === 'base-hexagon' && p.ultimateDuration > 0 ? HERO_MECHANICS.hexagon.overdriveCooldown : 1;
      skill.cooldown = SKILLS[skill.id].cooldown * cooldownGain * overdrive * (1 - p.cooldownReduction);
    }
  }
}
function spokeDistanceSq(point: Vec, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.y - ay) * dy) / lengthSq)) : 0;
  return (point.x - (ax + t * dx)) ** 2 + (point.y - (ay + t * dy)) ** 2;
}
function updateOrbit(world: WorldAccess, skill: SkillState): void {
  const p = world.state.player;
  const radius = p.skillDuration > 0 ? ACTIVE.circle.radius : SKILLS[skill.id].range + (skill.level - 1) * 4;
  const ball = SKILLS[skill.id].radius;
  const count = 2 + Math.floor((skill.level - 1) / 3) + (skill.enhanced ? 2 : 0);
  for (let i = 0; i < count; i++) {
    const angle = world.state.time * 2.8 + i * Math.PI * 2 / count;
    const tipX = p.x + Math.cos(angle) * radius, tipY = p.y + Math.sin(angle) * radius;
    // 轨道球扫过的是一条从圆心到圆环的辐条，贴脸的敌人也会被碾到，而不是进入内圈后完全免疫。
    const targets = [...world.nearby(p, radius + ball + 60)];
    for (const enemy of targets) {
      if ((enemy.orbitHits.get(i) ?? 0) > world.state.time) continue;
      const reach = ball + enemy.radius;
      if (spokeDistanceSq(enemy, p.x, p.y, tipX, tipY) > reach * reach) continue;
      enemy.orbitHits.set(i, world.state.time + SKILLS[skill.id].cooldown);
      world.damage(enemy, skillDamage(world.state, skill.id), skill.id);
    }
  }
}
function projectile(world: WorldAccess, skill: SkillState, angle: number, extra: Partial<Projectile> = {}): void {
  const p = world.state.player, config = SKILLS[skill.id];
  world.addProjectile({ x: p.x, y: p.y, skillId: skill.id, damage: skillDamage(world.state, skill.id), vx: Math.cos(angle) * CONFIG.projectileSpeed, vy: Math.sin(angle) * CONFIG.projectileSpeed, radius: config.radius, range: config.range, life: config.range / CONFIG.projectileSpeed + 1, ...extra });
}
function fireSkill(world: WorldAccess, skill: SkillState): boolean {
  const heroResult = fireHeroSkill(world, skill);
  if (heroResult !== undefined) return heroResult;
  const p = world.state.player, config = SKILLS[skill.id], damage = skillDamage(world.state, skill.id);
  const target = nearest(world, p, config.range || config.radius);
  if (skill.id === 'base-square') {
    if (!target) return false;
    const count = skill.enhanced ? 8 : 4;
    for (let i = 0; i < count; i++) projectile(world, skill, i * Math.PI * 2 / count, { pierce: 1 + Math.floor((skill.level - 1) / 3) });
  } else if (skill.id === 'mine') {
    const count = 1 + Math.floor((skill.level - 1) / 4) + (skill.enhanced ? 2 : 0);
    for (let i = 0; i < count; i++) world.addEffect({ x: p.x + (i ? Math.cos(i * 2.4) * 55 : 0), y: p.y + (i ? Math.sin(i * 2.4) * 55 : 0), kind: 'mine', skillId: skill.id, radius: config.radius + (skill.level - 1) * 8, damage, life: 5 + (skill.level - 1) * .3 });
  } else if (skill.id === 'shockwave') {
    blast(world, p, config.radius + (skill.level - 1) * 12, damage, skill.id, 20 + (skill.enhanced ? 60 : 0));
  } else if (!target) return false;
  else if (skill.id === 'base-triangle') {
    const d = direction(p, target), angle = Math.atan2(d.y, d.x);
    for (const offset of skill.enhanced ? [-.18, 0, .18] : [0]) projectile(world, skill, angle + offset, { pierce: 3 + Math.floor((skill.level - 1) / 3) });
  } else if (skill.id === 'homing') {
    const d = direction(p, target), angle = Math.atan2(d.y, d.x);
    const count = 1 + Math.floor((skill.level - 1) / 2);
    for (let i = 0; i < count; i++) projectile(world, skill, angle + (i - (count - 1) / 2) * .12, { mode: 'homing', targetId: target.id, split: skill.enhanced });
  } else if (skill.id === 'boomerang') {
    const d = direction(p, target), angle = Math.atan2(d.y, d.x), count = 1 + Math.floor((skill.level - 1) / 3) + (skill.enhanced ? 1 : 0);
    for (let i = 0; i < count; i++) projectile(world, skill, angle + (i - (count - 1) / 2) * .22, { mode: 'boomerang', range: config.range + (skill.level - 1) * 20, radius: config.radius + (skill.level - 1) * 2, pierce: 999, life: 4 });
  } else if (skill.id === 'lightning') {
    const chain: Enemy[] = [target], count = 3 + Math.floor((skill.level - 1) / 2) + (skill.enhanced ? 2 : 0);
    let current = target;
    for (let i = 1; i < count; i++) {
      const candidates = [...world.nearby(current, config.radius + (skill.level - 1) * 15)].filter(e => !chain.includes(e));
      candidates.sort((a, b) => distanceSq(a, current) - distanceSq(b, current));
      if (!candidates.length) break;
      current = candidates[0]; chain.push(current);
    }
    let previous: Vec = p;
    for (const enemy of chain) {
      addFeedback(world.state, { kind: 'chain', x: previous.x, y: previous.y, radius: Math.sqrt(distanceSq(previous, enemy)),
        duration: .12, direction: { x: enemy.x - previous.x, y: enemy.y - previous.y } });
      world.damage(enemy, damage, skill.id);
      world.addEffect({ x: enemy.x, y: enemy.y, kind: 'blast', skillId: skill.id, radius: 18, life: .15 });
      previous = enemy;
    }
  } else if (skill.id === 'meteor') {
    const candidates = [...world.nearby(p, config.range)];
    let best = target, density = 0;
    const radius = config.radius + (skill.level - 1) * 8;
    const stride = Math.max(1, Math.floor(candidates.length / 64));
    for (let i = 0; i < candidates.length; i += stride) {
      const count = world.nearby(candidates[i], radius).length;
      if (count > density) { density = count; best = candidates[i]; }
    }
    const count = 1 + Math.floor((skill.level - 1) / 4) + (skill.enhanced ? 1 : 0);
    for (let i = 0; i < count; i++) world.addEffect({ x: best.x + i * 35, y: best.y + i * 20, kind: 'warning', skillId: skill.id, radius, damage, delay: .5 + i * .08, life: .8 + i * .08 });
  }
  return true;
}

export function updateProjectiles(world: WorldAccess, dt: number): void {
  const p = world.state.player;
  const initialCount = world.state.projectiles.length;
  for (let i = 0; i < initialCount; i++) {
    const shot = world.state.projectiles[i];
    if (shot.life <= 0) continue;
    shot.life -= dt; shot.age += dt;
    if (shot.mode === 'homing') {
      let target = world.state.enemies.find(e => e.id === shot.targetId && e.hp > 0);
      if (!target) { target = nearest(world, shot, shot.range); shot.targetId = target?.id ?? null; }
      if (target) { const d = direction(shot, target); shot.vx = d.x * CONFIG.projectileSpeed; shot.vy = d.y * CONFIG.projectileSpeed; }
    } else if (shot.mode === 'boomerang') {
      if (!shot.returning && shot.traveled >= shot.range) { shot.returning = true; shot.hit.clear(); }
      if (shot.returning) {
        const d = direction(shot, p); shot.vx = d.x * CONFIG.projectileSpeed; shot.vy = d.y * CONFIG.projectileSpeed;
        if (distanceSq(shot, p) < (shot.radius + p.radius) ** 2) shot.life = 0;
      }
    }
    shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.traveled += Math.hypot(shot.vx, shot.vy) * dt;
    if (blocked(shot, shot.radius, world.state.obstacles)) { shot.life = 0; continue; }
    if (shot.owner === 'enemy') {
      if (distanceSq(shot, p) <= (shot.radius + p.radius) ** 2) { world.damagePlayer(shot.damage); shot.life = 0; }
    } else {
      for (const enemy of [...world.nearby(shot, shot.radius + 60)]) {
        if (shot.hit.has(enemy.id) || distanceSq(shot, enemy) > (shot.radius + enemy.radius) ** 2) continue;
        shot.hit.add(enemy.id);
        // Negative attack ID is reserved for ultimate blades; they never apply elements.
        const id = shot.attackId < 0 ? 'ultimate' : shot.skillId as SkillId;
        world.damage(enemy, shot.damage, id, shot.attackId >= 0);
        if (shot.split && shot.skillId === 'homing') {
          shot.split = false;
          const targets = [...world.nearby(enemy, 240)].filter(e => e.id !== enemy.id).slice(0, 2);
          for (const target of targets) {
            const d = direction(enemy, target);
            world.addProjectile({ x: enemy.x, y: enemy.y, skillId: 'homing', damage: shot.damage * .5, vx: d.x * CONFIG.projectileSpeed, vy: d.y * CONFIG.projectileSpeed, mode: 'homing', targetId: target.id, range: 240, life: 1.5, hit: new Set([enemy.id]) });
          }
        }
        shot.pierce--;
        if (shot.pierce <= 0) { shot.life = 0; break; }
      }
    }
  }
  compact(world.state.projectiles, shot => shot.life > 0);
}
export function updateEffects(world: WorldAccess, dt: number): void {
  const p = world.state.player;
  for (const effect of world.state.effects) {
    effect.life -= dt; effect.delay -= dt;
    if (updateHeroEffect(world, effect, dt)) continue;
    if (effect.kind === 'field' || effect.kind === 'dash') { effect.x = p.x; effect.y = p.y; }
    if (effect.kind === 'dash') {
      for (const enemy of [...world.nearby(effect, effect.radius + 60)]) {
        if (!effect.hit.has(enemy.id) && distanceSq(effect, enemy) <= (effect.radius + enemy.radius) ** 2) {
          effect.hit.add(enemy.id); world.damage(enemy, effect.damage, 'active', false);
        }
      }
    } else if (effect.kind === 'mine' && !effect.triggered) {
      if (world.nearby(effect, 30).length) {
        effect.triggered = true; effect.life = .22;
        blast(world, effect, effect.radius, effect.damage, effect.skillId as SkillId);
      }
    } else if (effect.kind === 'warning' && effect.delay <= 1e-8 && !effect.triggered) {
      effect.triggered = true;
      if (effect.owner === 'enemy') {
        if (!effect.hit.has(0) && distanceSq(effect, p) <= (effect.radius + p.radius) ** 2) { world.damagePlayer(effect.damage); effect.hit.add(0); }
      } else blast(world, effect, effect.radius, effect.damage, effect.skillId as SkillId);
    }
  }
  compact(world.state.effects, effect => effect.life > 0);
}
function compact<T>(array: T[], keep: (item: T) => boolean): void {
  let write = 0;
  for (const value of array) if (keep(value)) array[write++] = value;
  array.length = write;
}
