import { describe, expect, it } from 'vitest';
import { CHARACTERS, HERO_MECHANICS } from '../src/game/config';
import { activateSkill, activateUltimate, updateEffects, updateSkills, updateUltimate } from '../src/game/skills';
import { decoyTarget } from '../src/game/heroes';
import { blocked } from '../src/game/spatial';
import { GameWorld } from '../src/game/world';
import { SAVE_KEY, SaveStore } from '../src/storage';

function target(world: GameWorld, x: number, y = 1600) {
  const enemy = world.spawnEnemy('tank', { x, y })!;
  enemy.hp = enemy.maxHp = 10000; enemy.speed = 0; enemy.damage = 0;
  return enemy;
}
describe('三个新英雄', () => {
  it('起手技能互不相同，旧存档获得新角色但保留成绩与已有解锁', () => {
    const raw = JSON.stringify({ schemaVersion: 1, unlocked: ['circle', 'square'], best: { kills: 42 }, stats: { runs: 3 } });
    const store = new SaveStore({ getItem: key => key === SAVE_KEY ? raw : null, setItem: () => {} });
    expect(store.warning).toBe(''); expect(store.data.best.kills).toBe(42);
    expect(store.data.unlocked).toEqual(['circle', 'square', 'diamond', 'pentagon', 'hexagon']);
    for (const id of ['diamond', 'pentagon', 'hexagon'] as const) {
      const p = new GameWorld(id).state.player;
      expect(p.hp).toBe(CHARACTERS[id].hp);
      expect(p.skills.map(s => s.id)).toEqual([CHARACTERS[id].base, CHARACTERS[id].startingAoe]);
    }
  });
  it('菱形射线优先首领，折射由命中触发，墙壁挡住射线', () => {
    const world = new GameWorld('diamond'); world.state.player.critChance = 0;
    const normal = target(world, 1800), boss = world.spawnEnemy('boss', { x: 1600, y: 2050 })!;
    updateSkills(world, .01); updateEffects(world, .01);
    expect(boss.hp).toBeLessThan(boss.maxHp); expect(normal.hp).toBe(normal.maxHp);
    const split = new GameWorld('diamond'); split.state.player.critChance = 0;
    target(split, 1750); const side = target(split, 1750, 1690);
    updateSkills(split, .01); updateEffects(split, .01);
    expect(side.hp).toBeLessThan(side.maxHp); expect(split.state.damageBySkill.refraction).toBeGreaterThan(0);
    const walled = new GameWorld('diamond'); walled.state.obstacles = [{ x: 1680, y: 1550, width: 40, height: 100 }];
    const hidden = target(walled, 1800);
    updateSkills(walled, .01); updateEffects(walled, .01);
    expect(hidden.hp).toBe(hidden.maxHp);
  });
  it('菱形闪现不穿墙，镜像只吸引普通怪；大招预警后才伤害', () => {
    const world = new GameWorld('diamond'); world.state.player.lastDirection = { x: 1, y: 0 };
    world.state.obstacles = [{ x: 1680, y: 1500, width: 40, height: 200 }];
    activateSkill(world);
    expect(world.state.player.x).toBeLessThan(1680); expect(blocked(world.state.player, 16, world.state.obstacles)).toBe(false);
    const ordinary = target(world, 1800), boss = world.spawnEnemy('boss', { x: 1850, y: 1600 })!;
    expect(decoyTarget(world, ordinary)).not.toBe(world.state.player); expect(decoyTarget(world, boss)).toBe(world.state.player);
    const beam = new GameWorld('diamond'); beam.state.player.energy = 100;
    const enemy = target(beam, 1850);
    activateUltimate(beam); updateEffects(beam, .59); expect(enemy.hp).toBe(enemy.maxHp);
    updateEffects(beam, .01); expect(enemy.hp).toBeLessThan(enemy.maxHp);
  });
  it('五边形法阵有上限，触发后延迟爆炸并减速，可手动引爆且不重复伤害', () => {
    const world = new GameWorld('pentagon');
    for (let i = 0; i < 20; i++) { world.state.player.skills.forEach(s => s.cooldown = 0); updateSkills(world, .01); }
    expect(world.state.effects.filter(e => e.kind === 'sigil')).toHaveLength(HERO_MECHANICS.pentagon.sigilLimit);
    const victim = target(world, 1600, 1646);
    updateEffects(world, .01); expect(victim.hp).toBe(victim.maxHp);
    updateEffects(world, .44); expect(victim.hp).toBe(victim.maxHp);
    updateEffects(world, .01); expect(victim.hp).toBeLessThan(victim.maxHp); expect(victim.slowFactor).toBe(.3);
    const hp = victim.hp; updateEffects(world, .01); expect(victim.hp).toBe(hp);
    const manual = new GameWorld('pentagon'); updateSkills(manual, .01);
    const nearby = target(manual, 1600, 1554); activateSkill(manual); expect(nearby.hp).toBeLessThan(nearby.maxHp);
    const once = nearby.hp; updateEffects(manual, .01); expect(nearby.hp).toBe(once);
    const fallback = new GameWorld('pentagon'); activateSkill(fallback);
    expect(fallback.state.effects.filter(e => e.kind === 'sigil')).toHaveLength(1);
  });
  it('五边形大招固定阵地、持续减速，结束时五个法阵爆炸', () => {
    const world = new GameWorld('pentagon'); world.state.player.energy = 100;
    const enemy = target(world, 1700); activateUltimate(world);
    world.state.player.x = 1400;
    updateEffects(world, .01); expect(enemy.hp).toBe(enemy.maxHp); expect(enemy.slowFactor).toBe(.3);
    expect(world.state.effects.find(e => e.kind === 'web')!.x).toBe(1600);
    updateEffects(world, 2.99); expect(enemy.hp).toBeLessThan(enemy.maxHp);
    expect(world.state.effects.filter(e => e.kind === 'sigil')).toHaveLength(0);
  });
  it('六边形横扫按扇形命中，蓄力期间减伤，大招提高频率并在结束时震地', () => {
    const world = new GameWorld('hexagon');
    const front = target(world, 1680), behind = target(world, 1500);
    world.state.player.skills.find(s => s.id === 'fissure')!.cooldown = 100;
    updateSkills(world, .01); updateEffects(world, .01);
    expect(front.hp).toBeLessThan(front.maxHp); expect(behind.hp).toBe(behind.maxHp);
    const hp = front.hp; behind.hp = 0; activateSkill(world); world.damagePlayer(20);
    expect(world.state.player.hp).toBe(CHARACTERS.hexagon.hp - 13); // 25% 减伤后再扣 2 护甲。
    updateEffects(world, .39); expect(front.hp).toBe(hp);
    updateEffects(world, .01); expect(front.hp).toBeLessThan(hp);
    world.state.player.energy = 100; activateUltimate(world);
    const base = world.state.player.skills[0]; base.cooldown = 0; updateSkills(world, .01);
    expect(base.cooldown).toBeCloseTo(1.1 * HERO_MECHANICS.hexagon.overdriveCooldown);
    const before = front.hp; updateUltimate(world, 5);
    expect(front.hp).toBeLessThan(before); const after = front.hp; updateUltimate(world, 1); expect(front.hp).toBe(after);
  });
  it('暂停冻结新技能预警与法阵，首领通关清场移除特效', () => {
    const world = new GameWorld('pentagon'); updateSkills(world, .01);
    const trap = world.state.effects.find(e => e.kind === 'sigil')!;
    world.setPaused(true); world.update(1); expect(trap.life).toBe(7);
    world.setPaused(false); const boss = world.spawnEnemy('boss', { x: 1800, y: 1600 })!; boss.hp = 0;
    world.update(1 / 60); expect(world.state.gift).toHaveLength(3); expect(world.state.effects).toHaveLength(0);
  });
});
