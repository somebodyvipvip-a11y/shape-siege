// Diagnostic benchmark: real rules, legal upgrades, normal HP and lives. Not a human win rate.
import { it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { GameWorld } from '../src/game/world';
import { CHARACTER_IDS, CONFIG, ENEMIES } from '../src/game/config';
import { blocked, distanceSq } from '../src/game/spatial';
import { clearPath } from '../src/game/navigation';
import { SeededRandom } from '../src/game/random';
import type { CharacterId, Input, UpgradeChoice } from '../src/game/types';

function upgradeScore(c: UpgradeChoice): number {
  const priority: Record<string, number> = { lightning: 100, homing: 90, meteor: 80, shockwave: 75, boomerang: 60, mine: 50 };
  if (c.kind === 'new') return (priority[c.skillId!] ?? 40) + 100;
  if (c.kind === 'level') return (priority[c.skillId!] ?? 70) + 25;
  if (c.kind === 'fusion') return 150;
  if (c.kind === 'element') return c.element === 'lightning' ? 140 : 110;
  if (c.kind === 'behavior') return 130;
  if (c.id === 'rare:skillBoost') return 145;
  if (c.id === 'rare:lifesteal') return 100;
  if (c.id === 'stat:cooldown') return 90;
  if (c.id === 'stat:damage') return 60;
  return 40;
}

it('records deterministic normal-health first-stage play, including real timeout failures', () => {
  const results: any[] = [];
  if (process.env.BALANCE_BOSS_HP) ENEMIES.boss.hp = Number(process.env.BALANCE_BOSS_HP);
  const characters = process.env.BALANCE_CHARACTERS ? process.env.BALANCE_CHARACTERS.split(',') as CharacterId[] : CHARACTER_IDS;
  for (const character of characters) {
    for (const seed of (process.env.BALANCE_STAGES === '3' ? [73] : [20261006, 73, 991])) {
      const world = new GameWorld(character, seed);
      world.setAutoSkill(true);
      const s = world.state, p = s.player;
      const casualRandom = new SeededRandom(seed ^ 0xA11CE);
      let input: Input = { x: 0, y: 0, skill: false, ultimate: false };
      let maxEnemies = 0, maxVisible = 0, bossInitial = 0;
      const snapshots: any[] = []; const stageClears: any[] = [];
      const stages = process.env.BALANCE_STAGES === '3' ? 3 : 1;
      const started = performance.now();
      for (let frame = 0; frame < 301 * stages * 60 && !s.result && stageClears.length < stages; frame++) {
        if (s.gift.length) {
          stageClears.push({ stage: s.stage, time: Math.round(s.time), level: s.level, lives: s.lives });
          if (stageClears.length === stages) break;
          expect(world.chooseGift(s.gift.find(c => c.id === 'gift:heal')?.id ?? s.gift[0].id)).toBe(true);
          bossInitial = 0;
        }
        while (s.pendingUpgrades) {
          const score = (c: UpgradeChoice) => c.id === 'stat:heal' && p.hp / p.maxHp < .45 ? 250 : c.id === 'stat:health' && p.hp / p.maxHp < .4 ? 200 : upgradeScore(c);
          const ranked = process.env.BALANCE_POLICY === 'casual'
            ? [s.choices[Math.floor(casualRandom.next() * s.choices.length)]]
            : [...s.choices].sort((a, b) => score(b) - score(a));
          expect(world.chooseUpgrade(ranked[0].id)).toBe(true);
        }
        if (frame % 12 === 0) {
          const enemies = s.enemies.filter(e => distanceSq(e, p) < 600 ** 2);
          const pickups = [...s.pickups].sort((a, b) => distanceSq(a, p) - distanceSq(b, p)).slice(0, 8);
          const boss = s.enemies.find(e => e.kind === 'boss');
          let bestScore = -Infinity;
          for (let i = 0; i < 24; i++) {
            const a = i * Math.PI / 12, x = Math.cos(a), y = Math.sin(a);
            const point = { x: p.x + x * p.speed * .5, y: p.y + y * p.speed * .5 };
            if (blocked(point, p.radius + 3, s.obstacles) || !clearPath(p, point, p.radius + 1, s.obstacles)) continue;
            let score = 0, nearest = Infinity;
            for (const e of enemies) {
              const dist = Math.sqrt(distanceSq(point, e)) - e.radius - p.radius;
              nearest = Math.min(nearest, dist);
              if (dist < 35) score -= (35 - dist) * 35;
              else if (dist < (character === 'circle' || character === 'hexagon' ? 50 : 80)) score -= ((character === 'circle' || character === 'hexagon' ? 50 : 80) - dist) * 2;
              if (e.state === 'warning' && e.kind.includes('charger') && dist < 160) score -= 100;
            }
            if (pickups[0]) score -= Math.sqrt(distanceSq(point, pickups[0])) * .35;
            else if (Number.isFinite(nearest)) score -= Math.abs(nearest - (character === 'circle' ? 55 : character === 'hexagon' ? 95 : character === 'diamond' ? 320 : 100)) * .3;
            else score -= Math.hypot(point.x - 1600, point.y - 1600) * .1;
            if (boss) {
              score -= Math.abs(Math.sqrt(distanceSq(point, boss)) - (character === 'circle' ? 140 : character === 'hexagon' ? 110 : character === 'diamond' ? 400 : 250)) * .65;
              if (character === 'square') score -= Math.min(Math.abs(point.x - boss.x), Math.abs(point.y - boss.y)) * .1;
            }
            for (const effect of s.effects) if (effect.owner === 'enemy' && distanceSq(effect, point) < (effect.radius + 45) ** 2) score -= 600;
            for (const shot of s.projectiles) if (shot.owner === 'enemy' && distanceSq(shot, point) < 70 ** 2) score -= 300;
            score -= Math.max(0, 250 - point.x) * 3 + Math.max(0, point.x - 2950) * 3 + Math.max(0, 250 - point.y) * 3 + Math.max(0, point.y - 2950) * 3;
            if (score > bestScore) { bestScore = score; input = { x, y, skill: false, ultimate: false }; }
          }
        }
        input.ultimate = p.energy >= 100 && frame % 2 === 0;
        world.update(CONFIG.step, input);
        const visible = s.enemies.filter(e => Math.abs(e.x - p.x) < s.viewport.x / 2 && Math.abs(e.y - p.y) < s.viewport.y / 2).length;
        maxEnemies = Math.max(maxEnemies, s.enemies.length); maxVisible = Math.max(maxVisible, visible);
        const boss = s.enemies.find(e => e.kind === 'boss');
        if (boss && !bossInitial) bossInitial = boss.maxHp;
        if (snapshots.length < 4 && s.time >= [60, 120, 180, 240][snapshots.length]) snapshots.push({ time: Math.round(s.time), level: s.level, kills: s.kills, alive: s.enemies.length, visible, lives: s.lives, skills: p.skills.map(k => `${k.id}:${k.level}`) });
      }
      const boss = s.enemies.find(e => e.kind === 'boss');
      results.push({ character, seed, outcome: s.gift.length ? 'clear' : s.result, time: Math.round(s.time), level: s.level, kills: s.kills, lives: s.lives, hp: Math.round(p.hp), maxEnemies, maxVisible, bossInitial, bossRemaining: boss ? Math.round(boss.hp) : null, skills: p.skills.map(k => ({ id: k.id, level: k.level, elements: k.elements, enhanced: k.enhanced })), damageBySkill: s.damageBySkill, snapshots, stageClears, simulationMs: Math.round(performance.now() - started) });
      expect(s.result !== null || s.gift.length > 0).toBe(true);
    }
  }
  writeFileSync(new URL(process.env.BALANCE_OUTPUT ?? '../.superpowers/balance-results.json', import.meta.url), JSON.stringify(results, null, 2));
  console.log(results.map(r => ({ character: r.character, seed: r.seed, outcome: r.outcome, time: r.time, level: r.level, kills: r.kills, maxEnemies: r.maxEnemies, maxVisible: r.maxVisible, bossRemaining: r.bossRemaining })));
  // Diagnostic target: this policy should clear at least two seeds per character.
  // A failure measures this scripted policy, never proves human play impossible.
  for (const character of characters) expect(results.filter(r => r.character === character && r.outcome === 'clear').length, `${character} first-stage clears / 3`).toBeGreaterThanOrEqual(process.env.BALANCE_STAGES === '3' ? 1 : 2);
});
