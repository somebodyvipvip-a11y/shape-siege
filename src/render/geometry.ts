import type Phaser from 'phaser';
import { ACTIVE, CONFIG, ENEMY_BEHAVIOR, EXPLOSION, SKILLS } from '../game/config';
import type { Effect, Enemy, GameState, Vec } from '../game/types';
import type { Settings } from '../storage';
import { weavePath } from '../game/weave';

export const PALETTE = { square: 0x65b8ff, circle: 0x63e2c3, triangle: 0xd0a2ff, diamond: 0xffd36a, pentagon: 0x76d4c8, hexagon: 0xffa568, enemy: 0xff7185, explosion: 0xffa568, xp: 0x91e8ff, gold: 0xffd36a };
type Graphics = Phaser.GameObjects.Graphics;
export function polygon(g: Graphics, x: number, y: number, radius: number, sides: number, angle = -Math.PI / 2, fill = true): void {
  const points = Array.from({ length: sides }, (_, i) => ({ x: x + Math.cos(angle + i * Math.PI * 2 / sides) * radius, y: y + Math.sin(angle + i * Math.PI * 2 / sides) * radius }));
  if (fill) g.fillPoints(points, true); g.strokePoints(points, true);
}
export function dashedCircle(g: Graphics, x: number, y: number, radius: number, parts = 24): void {
  for (let i = 0; i < parts; i++) { const angle = i * Math.PI * 2 / parts; g.beginPath(); g.arc(x, y, radius, angle, angle + Math.PI / parts); g.strokePath(); }
}
const DIGIT_SEGMENTS: Record<string, number[]> = {
  '0': [0, 1, 2, 3, 4, 5], '1': [1, 2], '2': [0, 1, 6, 4, 3], '3': [0, 1, 6, 2, 3], '4': [5, 6, 1, 2],
  '5': [0, 5, 6, 2, 3], '6': [0, 5, 6, 4, 2, 3], '7': [0, 1, 2], '8': [0, 1, 2, 3, 4, 5, 6], '9': [0, 1, 2, 3, 5, 6],
};
const SEGMENT_LINES: readonly [number, number, number, number][] = [[0, 0, 1, 0], [1, 0, 1, .5], [1, .5, 1, 1], [0, 1, 1, 1], [0, .5, 0, 1], [0, 0, 0, .5], [0, .5, 1, .5]];
// 用七段式矢量数字把生命值画在敌人身上，避免为每个敌人创建 Text 对象带来的开销。
export function drawNumber(g: Graphics, x: number, y: number, value: number, height: number): void {
  const text = String(Math.max(0, Math.ceil(value))), width = height * .58, gap = height * .5;
  let left = x - (text.length * width + (text.length - 1) * gap) / 2;
  const top = y - height / 2;
  g.lineStyle(Math.max(1, height * .17), 0xf2f5fa, .92);
  for (const character of text) {
    for (const segment of DIGIT_SEGMENTS[character] ?? []) {
      const [x1, y1, x2, y2] = SEGMENT_LINES[segment];
      g.lineBetween(left + x1 * width, top + y1 * height, left + x2 * width, top + y2 * height);
    }
    left += width + gap;
  }
}
function enemy(g: Graphics, e: Enemy, time: number, reduced: boolean): void {
  const color = e.kind === 'exploder' ? PALETTE.explosion : e.burn ? 0xffa568 : e.slowTime > 0 ? 0x91cfff : PALETTE.enemy;
  const pulse = e.kind === 'exploder' && e.explosionArmed && !reduced ? .65 + .35 * Math.cos(time * Math.PI * 3) : 1;
  g.fillStyle(0x311e35, 1); g.lineStyle(e.kind === 'boss' ? 3 : 2, color, pulse);
  if (e.kind === 'boss') {
    polygon(g, e.x, e.y, e.radius, 6, reduced ? 0 : time * .2);
    polygon(g, e.x, e.y, e.radius * .7, 6, reduced ? 0 : -time * .35, false);
    g.fillStyle(color, .8); polygon(g, e.x, e.y, e.radius * .26, 6);
  } else if (e.kind === 'exploder') {
    polygon(g, e.x, e.y, e.radius, 8); g.strokeCircle(e.x, e.y, e.radius * .45);
  } else if (e.kind === 'runner') {
    const points = [{ x: e.x, y: e.y - e.radius }, { x: e.x + e.radius * .46, y: e.y }, { x: e.x, y: e.y + e.radius }, { x: e.x - e.radius * .46, y: e.y }];
    g.fillPoints(points, true); g.strokePoints(points, true);
  } else if (e.kind === 'charger' || e.kind === 'elite-charger') {
    const angle = Math.atan2(e.attackDirection.y, e.attackDirection.x);
    polygon(g, e.x, e.y, e.radius, 3, e.state === 'chase' ? -Math.PI / 2 : angle);
    g.lineStyle(1.5, color, .75); polygon(g, e.x, e.y, e.radius * .48, 3, -Math.PI / 2, false);
  } else if (e.kind === 'tank' || e.kind === 'elite-tank') {
    polygon(g, e.x, e.y, e.radius, 6, Math.PI / 6); g.lineStyle(2, color, .6); polygon(g, e.x, e.y, e.radius * .62, 6, Math.PI / 6, false);
  } else if (e.kind === 'ranged') {
    polygon(g, e.x, e.y, e.radius, 4); g.lineStyle(2, color, 1); g.strokeCircle(e.x, e.y, e.radius * .35);
  } else {
    const half = e.radius / Math.SQRT2;
    const points = [{ x: e.x - half, y: e.y - half }, { x: e.x - half * .4, y: e.y - half }, { x: e.x, y: e.y - half * .4 }, { x: e.x + half * .4, y: e.y - half }, { x: e.x + half, y: e.y - half }, { x: e.x + half, y: e.y + half }, { x: e.x - half, y: e.y + half }];
    g.fillPoints(points, true); g.strokePoints(points, true);
  }
  if (e.kind.startsWith('elite') || e.kind === 'boss') {
    g.lineStyle(2, color, .8); dashedCircle(g, e.x, e.y, e.radius + 9, 12);
    g.fillStyle(0x080d18, 1); g.fillRect(e.x - e.radius, e.y - e.radius - 21, e.radius * 2, 5);
    g.fillStyle(color, 1); g.fillRect(e.x - e.radius, e.y - e.radius - 21, e.radius * 2 * Math.max(0, e.hp / e.maxHp), 5);
  }
  // 精英、首领常显血值；普通敌人只在掉血后显示，避免满屏数字。
  if (e.kind.startsWith('elite') || e.kind === 'boss' || e.hp < e.maxHp) drawNumber(g, e.x, e.y, e.hp, Math.min(20, Math.max(7, e.radius * .95)));
}
export function drawWorld(g: Graphics, danger: Graphics, state: GameState, settings: Settings): void {
  const p = state.player, color = PALETTE[p.characterId], width = state.viewport.x, height = state.viewport.y;
  const visible = (point: Vec, radius = 100): boolean => Math.abs(point.x - p.x) < width / 2 + radius && Math.abs(point.y - p.y) < height / 2 + radius;
  g.clear(); danger.clear();
  g.fillStyle(0x111a2e, 1); g.fillRect(0, 0, CONFIG.mapSize, CONFIG.mapSize);
  g.lineStyle(1, 0x293750, .26);
  const left = Math.max(0, p.x - width / 2), right = Math.min(CONFIG.mapSize, p.x + width / 2), top = Math.max(0, p.y - height / 2), bottom = Math.min(CONFIG.mapSize, p.y + height / 2);
  for (let x = Math.floor(left / 100) * 100; x < right; x += 100) g.lineBetween(x, top, x, bottom);
  for (let y = Math.floor(top / 100) * 100; y < bottom; y += 100) g.lineBetween(left, y, right, y);
  g.lineStyle(5, 0x4e607e, 1); g.strokeRect(0, 0, CONFIG.mapSize, CONFIG.mapSize);
  for (const obstacle of state.obstacles) {
    if (!visible({ x: obstacle.x + obstacle.width / 2, y: obstacle.y + obstacle.height / 2 }, Math.max(obstacle.width, obstacle.height))) continue;
    if (obstacle.vertices) {
      g.fillStyle(0x26344b, 1); g.lineStyle(2, 0x61738e, .85);
      g.fillPoints(obstacle.vertices, true); g.strokePoints(obstacle.vertices, true);
      continue;
    }
    const x = obstacle.x, y = obstacle.y;
    g.fillStyle(0x26344b, 1); g.lineStyle(2, 0x61738e, .85); g.fillRect(x, y, obstacle.width, obstacle.height); g.strokeRect(x, y, obstacle.width, obstacle.height);
    g.lineStyle(1, 0x8190a8, .2); g.lineBetween(x + 8, y + 8, x + obstacle.width - 8, y + 8);
    g.lineBetween(x + 8, y + 8, x + 8, y + obstacle.height - 8);
  }
  if (state.event && visible(state.event, CONFIG.eventRadius)) {
    const e = state.event;
    g.fillStyle(PALETTE.gold, .035); g.lineStyle(2, PALETTE.gold, .55); polygon(g, e.x, e.y, CONFIG.eventRadius, 6);
    g.lineStyle(2.5, PALETTE.gold, 1); polygon(g, e.x, e.y, 26, 6, -Math.PI / 2, false);
    if (e.kind === 'charge') { g.beginPath(); g.arc(e.x, e.y, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * e.progress / CONFIG.chargeRequired); g.strokePath(); }
    g.lineBetween(e.x - 8, e.y, e.x + 8, e.y); g.lineBetween(e.x, e.y - 8, e.x, e.y + 8);
  }
  for (const drop of state.pickups) {
    if (!visible(drop, 12)) continue;
    // 生命上限：金色偏心菱形，区别于补血的十字圆点与经验的多边形。
    if (drop.kind === 'maxhp') {
      g.fillStyle(PALETTE.gold, .85); g.lineStyle(1, PALETTE.gold, 1);
      polygon(g, drop.x, drop.y, 10, 4, Math.PI / 4);
      g.fillStyle(0x0b1020, .85); g.fillCircle(drop.x + 3, drop.y + 3, 2.6);
      continue;
    }
    const xp = drop.kind === 'xp', color = xp ? PALETTE.xp : 0x63e2c3;
    g.fillStyle(color, .75); g.lineStyle(1, color, 1);
    if (xp) polygon(g, drop.x, drop.y, Math.min(9, 4 + Math.sqrt(drop.value)), 4);
    else { g.fillCircle(drop.x, drop.y, 9); g.lineStyle(2, 0x0b1020, 1); g.lineBetween(drop.x - 4, drop.y, drop.x + 4, drop.y); g.lineBetween(drop.x, drop.y - 4, drop.x, drop.y + 4); }
  }
  for (const explosion of state.explosions) {
    if (!visible(explosion, explosion.radius)) continue;
    const pulse = settings.reducedMotion ? 1 : .65 + .35 * Math.cos(state.time * Math.PI * 3);
    g.fillStyle(PALETTE.explosion, .12 + .12 * pulse); g.lineStyle(2, PALETTE.explosion, .5 + .3 * pulse);
    polygon(g, explosion.x, explosion.y, explosion.ghost.radius, 8);
    g.strokeCircle(explosion.x, explosion.y, explosion.ghost.radius * .45);
    danger.fillStyle(PALETTE.explosion, .03 + .04 * pulse); danger.fillCircle(explosion.x, explosion.y, explosion.radius);
    danger.lineStyle(2, PALETTE.explosion, .55 + .35 * pulse); dashedCircle(danger, explosion.x, explosion.y, explosion.radius);
    danger.beginPath(); danger.arc(explosion.x, explosion.y, explosion.radius - 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, 1 - explosion.remaining / EXPLOSION.fuse)); danger.strokePath();
    drawNumber(danger, explosion.x, explosion.y - 26, explosion.remaining, 13);
  }
  // Friendly effects are intentionally low contrast and underneath enemies and warnings.
  const weave = weavePath(state);
  if (weave.closed) { g.fillStyle(PALETTE.pentagon, .035); g.fillPoints(weave.nodes, true); }
  const weaveWidth = weave.width;
  for (const [a, b] of weave.edges) {
    g.lineStyle(weaveWidth * 2, PALETTE.pentagon, .08); g.lineBetween(a.x, a.y, b.x, b.y);
    g.lineStyle(1.5, PALETTE.pentagon, .75); g.lineBetween(a.x, a.y, b.x, b.y);
  }
  for (const effect of state.effects) {
    if (effect.owner !== 'player' || !visible(effect, Math.max(effect.radius, effect.length ?? 0))) continue;
    if (drawHeroEffect(g, effect, color)) continue;
    const effectColor = effect.skillId === 'explosion' ? PALETTE.explosion : effect.skillId === 'lightning' ? PALETTE.gold : color;
    g.lineStyle(effect.kind === 'field' ? 2 : 1.5, effectColor, .5); g.fillStyle(effectColor, effect.kind === 'field' ? .04 : .075);
    g.fillCircle(effect.x, effect.y, effect.radius); g.strokeCircle(effect.x, effect.y, effect.radius);
    if (effect.kind === 'mine') { polygon(g, effect.x, effect.y, 12, 6, -Math.PI / 2, false); }
    if (effect.kind === 'warning') { g.lineBetween(effect.x - 7, effect.y, effect.x + 7, effect.y); g.lineBetween(effect.x, effect.y - 7, effect.x, effect.y + 7); }
  }
  const orbit = p.skills.find(skill => skill.id === 'base-circle');
  if (orbit) {
    const radius = p.skillDuration > 0 ? ACTIVE.circle.radius : SKILLS['base-circle'].range + (orbit.level - 1) * 4;
    const count = 2 + Math.floor((orbit.level - 1) / 3) + (orbit.enhanced ? 2 : 0);
    g.lineStyle(1, color, .15); g.strokeCircle(p.x, p.y, radius);
    for (let i = 0; i < count; i++) {
      const angle = state.time * 2.8 + i * Math.PI * 2 / count, x = p.x + Math.cos(angle) * radius, y = p.y + Math.sin(angle) * radius;
      g.lineStyle(1, color, .12); g.lineBetween(p.x, p.y, x, y);
      if (settings.quality !== 'low') { g.fillStyle(color, .08); g.fillCircle(x, y, 18); }
      g.fillStyle(color, .85); g.fillCircle(x, y, SKILLS['base-circle'].radius); g.lineStyle(1, 0xf2f5fa, .75); g.strokeCircle(x, y, 8);
      drawElements(g, x, y, SKILLS['base-circle'].radius + 2, orbit.elements);
    }
  }
  for (const shot of state.projectiles) {
    if (!visible(shot, 15)) continue;
    const shotColor = shot.owner === 'enemy' ? PALETTE.enemy : shot.skillId === 'homing' ? PALETTE.xp : color;
    g.fillStyle(shotColor, shot.owner === 'enemy' ? 1 : .75); g.lineStyle(1.5, shot.owner === 'enemy' ? 0xffcad0 : shotColor, 1);
    if (settings.quality !== 'low') { g.lineStyle(2, shotColor, .25); const length = Math.hypot(shot.vx, shot.vy) || 1; g.lineBetween(shot.x, shot.y, shot.x - shot.vx / length * 18, shot.y - shot.vy / length * 18); }
    g.lineStyle(1.5, shot.owner === 'enemy' ? 0xffcad0 : shotColor, 1);
    if (shot.skillId === 'base-triangle' || shot.mode === 'boomerang') polygon(g, shot.x, shot.y, shot.radius, 3, Math.atan2(shot.vy, shot.vx));
    else if (shot.owner === 'enemy') polygon(g, shot.x, shot.y, shot.radius, 4);
    else g.fillCircle(shot.x, shot.y, shot.radius);
    if (shot.owner === 'player') drawElements(g, shot.x, shot.y, shot.radius + 2, p.skills.find(skill => skill.id === shot.skillId)?.elements ?? []);
  }
  for (const e of state.enemies) if (e.hp > 0 && visible(e, e.radius + 30)) enemy(g, e, state.time, settings.reducedMotion);
  if (settings.quality !== 'low') { g.fillStyle(color, .075); g.fillCircle(p.x, p.y, 33); }
  g.lineStyle(1.5, color, .65); g.strokeCircle(p.x, p.y, p.radius + 9);
  if (p.shield > 0) { g.lineStyle(2.5, PALETTE.square, .8); g.strokeCircle(p.x, p.y, p.radius + 15); }
  g.fillStyle(p.invulnerable > .35 ? 0xf2f5fa : color, .9); g.lineStyle(2, 0xf2f5fa, 1);
  if (p.characterId === 'circle') { g.fillCircle(p.x, p.y, p.radius); g.strokeCircle(p.x, p.y, p.radius); }
  else {
    const sides = p.characterId === 'triangle' ? 3 : p.characterId === 'pentagon' ? 5 : p.characterId === 'hexagon' ? 6 : 4;
    const angle = p.characterId === 'triangle' ? Math.atan2(p.lastDirection.y, p.lastDirection.x) : p.characterId === 'diamond' ? 0 : p.characterId === 'square' ? Math.PI / 4 : -Math.PI / 2;
    polygon(g, p.x, p.y, p.radius, sides, angle);
    if (p.characterId === 'hexagon') { g.lineStyle(2, 0xf2f5fa, .9); g.strokeRect(p.x - 5, p.y - 7, 10, 6); g.lineBetween(p.x, p.y - 1, p.x, p.y + 8); }
  }
  const direction = p.lastDirection, tipX = p.x + direction.x * 33, tipY = p.y + direction.y * 33;
  g.fillStyle(0xf2f5fa, .95); g.lineStyle(1, color, 1); polygon(g, tipX, tipY, 4, 3, Math.atan2(direction.y, direction.x));
  // Draw danger last so any build remains readable under a boss telegraph.
  for (const effect of state.effects) {
    if (effect.owner !== 'enemy' || !visible(effect, effect.radius)) continue;
    danger.fillStyle(PALETTE.enemy, effect.delay > 0 ? .13 : .3); danger.fillCircle(effect.x, effect.y, effect.radius);
    danger.lineStyle(3, PALETTE.enemy, 1); dashedCircle(danger, effect.x, effect.y, effect.radius);
    danger.lineStyle(2, 0xffd5db, 1); danger.lineBetween(effect.x, effect.y - 10, effect.x, effect.y + 3); danger.fillStyle(0xffd5db, 1); danger.fillCircle(effect.x, effect.y + 10, 2);
  }
  for (const e of state.enemies) {
    if (e.state !== 'warning' || !visible(e, 500)) continue;
    const d = e.attackDirection;
    const boss = e.kind === 'boss';
    if (boss && e.bossPattern === 2) continue;
    danger.lineStyle(2.5, PALETTE.enemy, 1); danger.fillStyle(PALETTE.enemy, .1);
    if (boss && e.bossPattern === 0) {
      const angle = Math.atan2(d.y, d.x), radius = 450;
      const points = [{ x: e.x, y: e.y }, ...Array.from({ length: 13 }, (_, i) => ({ x: e.x + Math.cos(angle - .6 + i * .1) * radius, y: e.y + Math.sin(angle - .6 + i * .1) * radius }))];
      danger.fillPoints(points, true); danger.strokePoints(points, true);
    } else {
      const length = e.kind === 'ranged' ? 400 : boss ? ENEMY_BEHAVIOR.bossChargeSpeed * ENEMY_BEHAVIOR.bossChargeDuration : ENEMY_BEHAVIOR.chargeSpeed * ENEMY_BEHAVIOR.chargeDuration;
      const halfWidth = e.kind === 'ranged' ? 5 : e.radius + p.radius;
      const points = [{ x: e.x - d.y * halfWidth, y: e.y + d.x * halfWidth }, { x: e.x + d.x * length - d.y * halfWidth, y: e.y + d.y * length + d.x * halfWidth }, { x: e.x + d.x * length + d.y * halfWidth, y: e.y + d.y * length - d.x * halfWidth }, { x: e.x + d.y * halfWidth, y: e.y - d.x * halfWidth }];
      danger.fillPoints(points, true);
      for (let i = 0; i < 12; i++) { const t = i / 12, t2 = (i + .55) / 12; for (const sign of [-1, 1]) danger.lineBetween(e.x + d.x * length * t + d.y * halfWidth * sign, e.y + d.y * length * t - d.x * halfWidth * sign, e.x + d.x * length * t2 + d.y * halfWidth * sign, e.y + d.y * length * t2 - d.x * halfWidth * sign); }
      polygon(danger, e.x + d.x * length, e.y + d.y * length, 9, 3, Math.atan2(d.y, d.x), false);
    }
  }
}
function drawHeroEffect(g: Graphics, effect: Effect, color: number): boolean {
  if (!['beam', 'sweep', 'sigil', 'web', 'weave', 'decoy'].includes(effect.kind)) return false;
  if (effect.life <= 0) return true;
  const pending = effect.delay > 1e-8 && !effect.triggered;
  g.lineStyle(1.5, color, pending ? .7 : .8); g.fillStyle(color, pending ? .04 : .13);
  if (effect.kind === 'beam') {
    const d = effect.direction!, length = effect.length ?? 0, r = effect.radius;
    const points = [{ x: effect.x - d.y * r, y: effect.y + d.x * r }, { x: effect.x + d.x * length - d.y * r, y: effect.y + d.y * length + d.x * r }, { x: effect.x + d.x * length + d.y * r, y: effect.y + d.y * length - d.x * r }, { x: effect.x + d.y * r, y: effect.y - d.x * r }];
    g.fillPoints(points, true); g.strokePoints(points, true);
    if (!pending) { g.lineStyle(Math.max(2, r), color, .8); g.lineBetween(effect.x, effect.y, effect.x + d.x * length, effect.y + d.y * length); }
  } else if (effect.kind === 'sweep') {
    const angle = Math.atan2(effect.direction!.y, effect.direction!.x), half = (effect.angle ?? Math.PI) / 2;
    const points = [{ x: effect.x, y: effect.y }, ...Array.from({ length: 17 }, (_, i) => ({ x: effect.x + Math.cos(angle - half + i * half / 8) * effect.radius, y: effect.y + Math.sin(angle - half + i * half / 8) * effect.radius }))];
    g.fillPoints(points, true); g.strokePoints(points, true);
  } else if (effect.kind === 'sigil') {
    g.fillStyle(color, .18); g.lineStyle(1.5, color, .8); polygon(g, effect.x, effect.y, 10, 5);
    g.fillStyle(color, .8); g.fillCircle(effect.x, effect.y, 3);
  } else if (effect.kind === 'web') {
    const points = effect.points!;
    g.fillStyle(color, .06); g.fillPoints(points, true); g.lineStyle(2, color, .8); g.strokePoints(points, true);
    for (let i = 0; i < 5; i++) g.lineBetween(points[i].x, points[i].y, points[(i + 2) % 5].x, points[(i + 2) % 5].y);
    g.lineStyle(2, color, .5); g.beginPath(); g.arc(effect.x, effect.y, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, effect.delay / 3)); g.strokePath();
  } else if (effect.kind === 'weave') {
    const scale = Math.max(0, Math.min(1, effect.life / .3)), points = effect.points!;
    g.lineStyle(3, color, .9);
    for (let i = 0; i + 1 < points.length; i += 2) g.lineBetween(effect.x + (points[i].x - effect.x) * scale, effect.y + (points[i].y - effect.y) * scale,
      effect.x + (points[i + 1].x - effect.x) * scale, effect.y + (points[i + 1].y - effect.y) * scale);
  } else { g.fillStyle(color, .08); g.lineStyle(1.5, color, .5); polygon(g, effect.x, effect.y, effect.radius, 4, 0); }
  return true;
}
function drawElements(g: Graphics, x: number, y: number, radius: number, elements: ('fire' | 'ice' | 'lightning')[]): void {
  const colors = { fire: 0xffa568, ice: 0x91d8ff, lightning: 0xffd36a };
  elements.forEach((element, index) => {
    g.lineStyle(2, colors[element], .85); g.beginPath();
    g.arc(x, y, radius, index * Math.PI, index * Math.PI + Math.PI * .8); g.strokePath();
  });
}
