import { describe, expect, it } from 'vitest';
import { CHARACTERS, HERO_MECHANICS } from '../src/game/config';
import { activateSkill, activateUltimate, updateEffects, updateSkills, updateUltimate } from '../src/game/skills';
import { decoyTarget } from '../src/game/heroes';
import { blocked } from '../src/game/spatial';
import { weavePath } from '../src/game/weave';
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
  function nodes(world: GameWorld, points: [number, number][]) {
    world.state.obstacles = []; world.state.player.lastDirection = { x: 0, y: 0 };
    for (const [x, y] of points) {
      Object.assign(world.state.player, { x, y }); world.state.player.skills.forEach(s => s.cooldown = 0); updateSkills(world, .01);
    }
  }
  it('符点需移动才新增，上限滚动替换，强化增加容量，过期连线消失', () => {
    const world = new GameWorld('pentagon'); nodes(world, Array.from({ length: 20 }, () => [1500, 1500]));
    expect(weavePath(world.state).nodes).toHaveLength(1);
    nodes(world, Array.from({ length: 10 }, (_, i) => [1500 + i * 80, 1500]));
    expect(weavePath(world.state).nodes).toHaveLength(6); expect(weavePath(world.state).nodes[0].x).toBe(1820);
    world.state.player.skills[1].enhanced = true;
    nodes(world, [[2300, 1500], [2380, 1500]]); expect(weavePath(world.state).nodes).toHaveLength(8);
    updateEffects(world, 8); expect(weavePath(world.state).edges).toHaveLength(0);
  });
  it('连线命中并减速，同一敌人多线重合不叠伤，离线不受伤，墙壁断线', () => {
    const world = new GameWorld('pentagon'); nodes(world, [[1500, 1500], [1700, 1500], [1600, 1700]]);
    const crossing = target(world, 1500, 1500), outside = target(world, 1850, 1600);
    const edge = target(world, 1600, 1510); edge.radius = 1;
    updateEffects(world, .01); expect(crossing.hp).toBe(10000 - 32); expect(crossing.slowFactor).toBe(.3);
    updateEffects(world, .1); expect(crossing.hp).toBe(10000 - 32); expect(outside.hp).toBe(10000); expect(edge.hp).toBe(10000);
    world.state.player.skills[1].enhanced = true;
    updateEffects(world, .01); expect(edge.hp).toBe(9968); expect(weavePath(world.state).width).toBe(11);
    world.state.time = .66; updateEffects(world, .01); expect(crossing.hp).toBe(10000 - 64);
    const wall = new GameWorld('pentagon'); nodes(wall, [[1500, 1600], [1700, 1600]]);
    wall.state.obstacles = [{ x: 1590, y: 1550, width: 20, height: 100 }];
    const hidden = target(wall, 1650); updateEffects(wall, .01);
    expect(weavePath(wall.state).edges).toHaveLength(0); expect(hidden.hp).toBe(10000);
  });
  it('闭环收束命中阵内一次，消耗符点，开链不能伤到阵内空白处', () => {
    const world = new GameWorld('pentagon'); nodes(world, [[1500, 1500], [1700, 1500], [1600, 1700]]);
    expect(weavePath(world.state).closed).toBe(true);
    const inside = target(world, 1600, 1560), outside = target(world, 1850);
    activateSkill(world); expect(inside.hp).toBe(10000 - 120); expect(outside.hp).toBe(10000);
    expect(weavePath(world.state).nodes).toHaveLength(0); updateEffects(world, .01); expect(inside.hp).toBe(9880);
    const open = new GameWorld('pentagon'); nodes(open, [[1400, 1500], [1600, 1500], [1800, 1500]]);
    expect(weavePath(open.state).closed).toBe(false);
    const untouched = target(open, 1600, 1620); activateSkill(open); expect(untouched.hp).toBe(10000);
    const fallback = new GameWorld('pentagon'); activateSkill(fallback); expect(weavePath(fallback.state).nodes).toHaveLength(1);
  });
  it('交叉路径不闭环，超长连线断开，不误判整片阵内伤害', () => {
    const world = new GameWorld('pentagon'); nodes(world, [[1500,1500],[1700,1700],[1500,1700],[1700,1500]]);
    expect(weavePath(world.state).closed).toBe(false);
    nodes(world, [[2300,1500]]); expect(weavePath(world.state).edges).toHaveLength(3);
  });
  it('五芒阵固定位置，按五边形持续伤害和减速，结束爆发一次，首领减速减半', () => {
    const world = new GameWorld('pentagon'); world.state.obstacles = []; world.state.player.energy = 100;
    const enemy = target(world, 1600), outside = target(world, 1835); outside.radius = 1;
    const boss = world.spawnEnemy('boss', { x: 1600, y: 1650 })!;
    activateUltimate(world); world.state.player.x = 1200;
    expect(world.state.effects.find(e => e.kind === 'web')!.x).toBe(1600);
    updateEffects(world, .49); expect(enemy.hp).toBe(10000); expect(boss.slowFactor).toBe(.15);
    updateEffects(world, .01); expect(enemy.hp).toBe(10000 - 24); expect(enemy.slowFactor).toBe(.3); expect(outside.hp).toBe(10000);
    for (let i = 0; i < 5; i++) updateEffects(world, .5);
    expect(enemy.hp).toBe(10000 - 24 * 5 - 150); const hp = enemy.hp;
    updateEffects(world, .01); expect(enemy.hp).toBe(hp); expect(world.state.effects.some(e => e.kind === 'sigil')).toBe(false);
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
    world.setPaused(true); world.update(1); expect(trap.life).toBe(8);
    world.setPaused(false); const boss = world.spawnEnemy('boss', { x: 1800, y: 1600 })!; boss.hp = 0;
    world.update(1 / 60); expect(world.state.gift).toHaveLength(3); expect(world.state.effects).toHaveLength(0);
  });
});
