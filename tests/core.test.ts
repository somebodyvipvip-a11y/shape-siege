import { describe, expect, it } from 'vitest';
import { CONFIG, DIRECTOR, stageAt } from '../src/game/config';
import { Director, updateEnemies } from '../src/game/director';
import { clearPath } from '../src/game/navigation';
import { activateSkill, activateUltimate, updateEffects, updateProjectiles, updateSkills, updateUltimate } from '../src/game/skills';
import { blocked, distanceSq } from '../src/game/spatial';
import type { Element, Enemy, Input, SkillId } from '../src/game/types';
import { GameWorld } from '../src/game/world';

const idle: Input = { x: 0, y: 0, skill: false, ultimate: false };
function steps(world: GameWorld, count: number, input = idle): void { for (let i = 0; i < count; i++) world.update(CONFIG.step, input); }
function dummy(world: GameWorld, dx = 150, dy = 0): Enemy {
  const e = world.spawnEnemy('tank', { x: world.state.player.x + dx, y: world.state.player.y + dy })!;
  e.hp = 1000; e.maxHp = 1000; e.speed = 0; e.damage = 0;
  return e;
}
function addSkill(world: GameWorld, id: SkillId, elements: Element[] = [], level = 1): void {
  world.state.player.skills.push({ id, level, elements, enhanced: false, cooldown: 0 });
}

describe('经验、候选池和暂停', () => {
  it('一次经验跨多级，选择逐一生效，全部选择后恢复计时', () => {
    const world = new GameWorld('circle', 7);
    world.debug.addXp(60);
    expect(world.state).toMatchObject({ level: 4, xp: 15, xpRequired: 25, pendingUpgrades: 3 });
    expect(new Set(world.state.choices.map(c => c.id)).size).toBe(3);
    steps(world, 60);
    expect(world.state.time).toBe(0);
    for (let i = 0; i < 3; i++) {
      expect(world.chooseUpgrade(world.state.choices[0].id)).toBe(true);
      expect(world.state.pendingUpgrades).toBe(2 - i);
    }
    expect(world.chooseUpgrade('stat:health')).toBe(false);
    world.update(CONFIG.step, idle);
    expect(world.state.time).toBeCloseTo(CONFIG.step);
  });
  it('满槽、满级、行为强化和元素槽准确过滤，补充合法属性', () => {
    const world = new GameWorld('circle');
    for (const id of ['homing', 'lightning', 'mine'] as SkillId[]) addSkill(world, id, ['fire', 'ice'], 8);
    world.state.player.skills[0].level = 8;
    for (const skill of world.state.player.skills) skill.enhanced = true;
    world.state.player.speedBonus = .3;
    world.state.player.cooldownReduction = .4;
    const pool = world.debug.candidates();
    expect(pool.some(c => c.kind === 'new' || c.kind === 'level' || c.kind === 'behavior')).toBe(false);
    expect(pool.some(c => c.id === 'stat:speed' || c.id === 'stat:cooldown' || c.id === 'stat:heal')).toBe(false);
    expect(pool.some(c => c.id === 'stat:damage')).toBe(true);
    world.debug.addXp(10);
    for (let i = 0; i < 2; i++) expect(world.reroll()).toBe(true);
    expect(world.reroll()).toBe(false);
    expect(world.state.player.skills).toHaveLength(4);
    expect(new Set(world.state.choices.map(c => c.id)).size).toBe(3);
  });
  it('元素、行为与融合是额外选择，未选择不会自动赠送', () => {
    const world = new GameWorld('triangle');
    const skill = world.state.player.skills[0];
    skill.level = 7;
    const choices = world.debug.candidates();
    const element = choices.find(c => c.id === 'element:base-triangle:fire')!;
    world.state.pendingUpgrades = 1; world.state.choices = [element];
    world.chooseUpgrade(element.id);
    expect(skill.level).toBe(7); expect(skill.elements).toEqual(['fire']); expect(skill.enhanced).toBe(false);
    const fusion = world.debug.candidates().find(c => c.id === 'fusion:base-triangle:ice')!;
    world.state.pendingUpgrades = 1; world.state.choices = [fusion];
    world.chooseUpgrade(fusion.id);
    expect(skill.elements).toEqual(['fire', 'ice']); expect(skill.level).toBe(7);
    expect(world.debug.candidates().some(c => c.kind === 'fusion')).toBe(false);
  });
  it('暂停冻结敌人、冷却、持续时间、能量和随机状态', () => {
    const a = new GameWorld('square', 8), b = new GameWorld('square', 8);
    steps(a, 60); steps(b, 60);
    a.state.player.skillCooldown = b.state.player.skillCooldown = 5;
    a.setPaused(true);
    steps(a, 600, { ...idle, skill: true });
    expect(a.state.time).toBe(b.state.time);
    expect(a.state.player).toEqual(b.state.player);
    expect(a.state.enemies).toEqual(b.state.enemies);
    a.setPaused(false);
    expect(a.random()).toBe(b.random());
  });
  it('升级选项随机与战斗随机独立，暂停不会重新抽取', () => {
    const a = new GameWorld('circle', 15), b = new GameWorld('circle', 15);
    for (let i = 0; i < 100; i++) a.random();
    a.debug.addXp(10); b.debug.addXp(10);
    expect(a.state.choices).toEqual(b.state.choices);
    const snapshot = [...a.state.choices];
    steps(a, 200);
    expect(a.state.choices).toEqual(snapshot);
  });
  it('事件免费选择不增加等级和经验门槛', () => {
    const world = new GameWorld();
    world.rewardChoice();
    expect(world.state).toMatchObject({ level: 1, xp: 0, xpRequired: 10, pendingUpgrades: 1 });
    world.chooseUpgrade(world.state.choices[0].id);
    expect(world.state.level).toBe(1);
  });
});

describe('运动和命中规则', () => {
  it('斜向归一化，同时保留摇杆小幅输入速度', () => {
    const straight = new GameWorld(), diagonal = new GameWorld(), half = new GameWorld();
    steps(straight, 60, { ...idle, x: 1 });
    steps(diagonal, 60, { ...idle, x: 1, y: 1 });
    steps(half, 60, { ...idle, x: .5 });
    const origin = { x: 1600, y: 1600 };
    expect(Math.sqrt(distanceSq(diagonal.state.player, origin))).toBeCloseTo(Math.sqrt(distanceSq(straight.state.player, origin)));
    expect(half.state.player.x - 1600).toBeCloseTo(105);
  });
  it('冲刺遇障碍停下、不会穿墙，途中改输入不转向', () => {
    const world = new GameWorld('triangle');
    world.state.obstacles = [{ x: 1660, y: 1550, width: 30, height: 100 }];
    world.update(CONFIG.step, { ...idle, x: 1, skill: true });
    steps(world, 15, { ...idle, y: 1 });
    expect(world.state.player.x).toBeLessThanOrEqual(1644);
    expect(blocked(world.state.player, 16, world.state.obstacles)).toBe(false);
    const open = new GameWorld('triangle');
    open.update(CONFIG.step, { ...idle, x: 1, skill: true });
    steps(open, 10, { ...idle, y: 1 });
    expect(open.state.player.y).toBe(1600);
    expect(open.state.player.x).toBeGreaterThan(1700);
  });
  it('长按技能不会在冷却结束重复施放，超长帧最多追赶五步', () => {
    const world = new GameWorld('circle');
    world.state.player.skills = [];
    world.state.player.hp = 10000;
    steps(world, 12 * 60, { ...idle, skill: true });
    expect(world.state.player.skillDuration).toBe(0);
    expect(world.state.player.skillCooldown).toBe(0);
    const before = world.state.time;
    world.update(10, idle);
    expect(world.state.time - before).toBeCloseTo(5 / 60);
  });
  it('同次穿透攻击不会重复命中，回旋刃出程回程各一次', () => {
    const world = new GameWorld();
    const enemy = dummy(world, 50);
    const projectile = world.addProjectile({ x: enemy.x, y: enemy.y, skillId: 'base-triangle', damage: 24, pierce: 3, life: 1 })!;
    updateProjectiles(world, CONFIG.step); updateProjectiles(world, CONFIG.step);
    expect(enemy.hp).toBe(976); expect(projectile.hit.has(enemy.id)).toBe(true);
    const blade = world.addProjectile({ x: enemy.x, y: enemy.y, skillId: 'boomerang', mode: 'boomerang', range: 30, damage: 18, pierce: 999, life: 2 })!;
    updateProjectiles(world, CONFIG.step);
    blade.traveled = 31;
    updateProjectiles(world, CONFIG.step); updateProjectiles(world, CONFIG.step);
    expect(enemy.hp).toBe(940);
  });
  it('接触保护阻止一帧多次扣血，敌方弹丸命中后消失', () => {
    const world = new GameWorld('circle');
    world.damagePlayer(10, true); world.damagePlayer(10, true);
    expect(world.state.player.hp).toBe(100);
    const p = world.state.player;
    world.addProjectile({ x: p.x, y: p.y, owner: 'enemy', skillId: 'enemy', damage: 12 });
    updateProjectiles(world, CONFIG.step);
    expect(p.hp).toBe(88); expect(world.state.projectiles).toHaveLength(0);
  });
  it('普通和首领冲锋越过锁定位置后继续沿同一方向，只命中一次', () => {
    for (const kind of ['charger', 'boss'] as const) {
      const world = new GameWorld();
      const enemy = world.spawnEnemy(kind, { x: 1500, y: 1600 })!;
      enemy.state = 'attack'; enemy.timer = .7; enemy.attackDirection = { x: 1, y: 0 }; enemy.target = { x: 1510, y: 1600 };
      enemy.bossPattern = 1; enemy.radius = 16;
      world.state.player.invulnerable = CONFIG.contactProtection;
      for (let i = 0; i < 30; i++) updateEnemies(world, CONFIG.step);
      expect(enemy.x).toBeGreaterThan(1700);
      expect(world.state.player.hp).toBe(110 - enemy.damage);
    }
  });
  it('追击怪绕过挡路障碍，可以再次接近玩家', () => {
    const world = new GameWorld();
    world.state.player.x = 1950;
    world.state.obstacles = [{ x: 1660, y: 1500, width: 180, height: 200 }];
    const enemy = world.spawnEnemy('chaser', { x: 1600, y: 1600 })!;
    for (let i = 0; i < 12 * 60; i++) updateEnemies(world, CONFIG.step);
    expect(enemy.x).toBeGreaterThan(1840);
    expect(distanceSq(enemy, world.state.player)).toBeLessThan(80 ** 2);
    expect(blocked(enemy, enemy.radius, world.state.obstacles)).toBe(false);
  });
  it('默认地图的长距离追击不会永久在障碍角落振荡', () => {
    const finalPositions = [];
    for (const side of [-1, 1]) {
      const world = new GameWorld();
      Object.assign(world.state.player, { x: 842.9008634, y: 131.5168725 });
      const enemy = world.spawnEnemy('chaser', { x: 2894.1033717, y: 834.6706369 })!;
      enemy.avoidSide = side;
      for (let i = 0; i < 60 * 60; i++) updateEnemies(world, CONFIG.step);
      expect(distanceSq(enemy, world.state.player), `avoidSide=${side}`).toBeLessThan(80 ** 2);
      expect(blocked(enemy, enemy.radius, world.state.obstacles)).toBe(false);
      finalPositions.push({ x: enemy.x, y: enemy.y });
    }
    expect(finalPositions[0]).toEqual(finalPositions[1]);
  });
  it('不同体型可以绕障接近贴墙玩家，目标移动后共享路径会更新', () => {
    for (const radius of [11, 23, 38, 60]) {
      const world = new GameWorld();
      Object.assign(world.state.player, { x: 842.9008634, y: 131.5168725 });
      const enemy = world.spawnEnemy('chaser', { x: 2894.1033717, y: 834.6706369 })!;
      enemy.radius = radius;
      for (let i = 0; i < 30 * 60; i++) {
        if (i === 10 * 60) Object.assign(world.state.player, { x: 1950, y: 1940 });
        updateEnemies(world, CONFIG.step);
        expect(blocked(enemy, radius, world.state.obstacles)).toBe(false);
      }
      expect(distanceSq(enemy, world.state.player)).toBeLessThan((radius + world.state.player.radius) ** 2);
    }
  });
  it('导航检查完整扫掠圆体，不能穿过薄墙或擦过矩形角', () => {
    const obstacles = [{ x: 1000, y: 1000, width: 180, height: 180 }];
    expect(clearPath({ x: 800, y: 1100 }, { x: 1400, y: 1100 }, 14, [{ x: 1000, y: 1000, width: 1, height: 180 }])).toBe(false);
    expect(clearPath({ x: 900, y: 1080 }, { x: 1080, y: 900 }, 16, obstacles)).toBe(false);
    expect(clearPath({ x: 900, y: 980 }, { x: 1200, y: 980 }, 16, obstacles)).toBe(true);
  });
  it('首领扇形和爆破的身体接触遵守保护间隔，不消费冲锋命中记录', () => {
    for (const pattern of [0, 2]) {
      const world = new GameWorld();
      const p = world.state.player;
      const boss = world.spawnEnemy('boss', { x: p.x, y: p.y })!;
      Object.assign(boss, { state: 'attack', timer: 1, bossPattern: pattern });
      p.invulnerable = .2;
      updateEnemies(world, CONFIG.step);
      expect(p.hp).toBe(110);
      expect(boss.hitPlayer).toBe(false);
      p.invulnerable = 0;
      updateEnemies(world, CONFIG.step);
      expect(p.hp).toBe(80);
      expect(p.invulnerable).toBe(CONFIG.contactProtection);
      updateEnemies(world, CONFIG.step);
      expect(p.hp).toBe(80);
      p.invulnerable = 0;
      updateEnemies(world, CONFIG.step);
      expect(p.hp).toBe(50);
      expect(boss.hitPlayer).toBe(false);
    }
  });
  it('自动三角冲刺避开无合法完整路径，手动仍可使用', () => {
    const world = new GameWorld('triangle');
    world.state.obstacles = [{ x: 1580, y: 1500, width: 40, height: 20 }];
    dummy(world, 100);
    world.setAutoSkill(true);
    world.update(CONFIG.step, idle);
    expect(world.state.player.skillCooldown).toBe(0);
    world.update(CONFIG.step, { ...idle, skill: true });
    expect(world.state.player.skillCooldown).toBeGreaterThan(0);
  });
});

describe('元素、技能与大招', () => {
  it('雷链与融合副伤害不递归，伤害统计仅计实际扣血', () => {
    const world = new GameWorld();
    addSkill(world, 'homing', ['lightning']);
    const a = dummy(world, 100), b = dummy(world, 150), c = dummy(world, 200), d = dummy(world, 250);
    world.damage(a, 100, 'homing');
    expect([a.hp, b.hp, c.hp, d.hp]).toEqual([900, 970, 970, 1000]);
    expect(world.state.damageBySkill.homing).toBe(160);
    a.hp = 1;
    world.damage(a, 1000, 'active', false);
    expect(world.state.damageBySkill.active).toBe(1);
  });
  it('燃烧不叠加，刷新保留更强伤害；冰对首领减速减半', () => {
    const world = new GameWorld();
    addSkill(world, 'homing', ['fire']);
    const enemy = dummy(world, 100);
    world.damage(enemy, 100, 'homing'); world.damage(enemy, 20, 'homing');
    expect(enemy.burn).toMatchObject({ dps: 15, remaining: 2 });
    addSkill(world, 'lightning', ['ice']);
    const boss = world.spawnEnemy('boss', { x: 1700, y: 1700 })!;
    world.damage(boss, 1, 'lightning');
    expect(boss.slowFactor).toBe(.125);
  });
  it('热冲击第二次命中才爆炸，每技能每目标至少隔0.5秒，融合顺序无关', () => {
    for (const elements of [['fire', 'ice'], ['ice', 'fire']] as Element[][]) {
      const world = new GameWorld(); addSkill(world, 'homing', elements, 7);
      const enemy = dummy(world, 100), neighbor = dummy(world, 130);
      world.damage(enemy, 100, 'homing');
      expect(neighbor.hp).toBe(1000); expect(enemy.burn).toBeNull();
      world.state.time = .1; world.damage(enemy, 100, 'homing');
      expect(neighbor.hp).toBe(960);
      world.state.time = .2; world.damage(enemy, 100, 'homing');
      expect(neighbor.hp).toBe(960);
      world.state.time = .6; world.damage(enemy, 100, 'homing');
      expect(neighbor.hp).toBe(920);
    }
  });
  it('电燃和冰链将基础状态传给副目标，并替代独立元素效果', () => {
    for (const elements of [['fire', 'lightning'], ['ice', 'lightning']] as Element[][]) {
      const world = new GameWorld(); addSkill(world, 'homing', elements, 7);
      const enemy = dummy(world, 100), target = dummy(world, 150);
      world.damage(enemy, 100, 'homing');
      expect(target.hp).toBe(970);
      if (elements[0] === 'fire') expect(target.burn?.dps).toBe(4.5);
      else expect(target.slowFactor).toBe(.25);
    }
  });
  it('每个通用技能可实际造成伤害，行为强化有实际影响', () => {
    for (const id of ['homing', 'lightning', 'boomerang', 'mine', 'shockwave', 'meteor'] as SkillId[]) {
      const world = new GameWorld('circle'); world.state.player.skills = [];
      addSkill(world, id, [], 5);
      world.state.player.skills[0].enhanced = true;
      const enemy = dummy(world, id === 'mine' ? 20 : 100);
      updateSkills(world, CONFIG.step);
      for (let i = 0; i < 90; i++) { updateProjectiles(world, CONFIG.step); updateEffects(world, CONFIG.step); }
      expect(enemy.hp, id).toBeLessThan(1000);
      expect(world.state.damageBySkill[id], id).toBeGreaterThan(0);
    }
  });
  it('星环轨道球在贴脸距离也能造成伤害', () => {
    for (const offset of [20, 30, 40]) {
      const world = new GameWorld('circle', 1);
      const target = dummy(world, offset);
      steps(world, 240);
      expect(target.hp, `offset=${offset}`).toBeLessThan(1000);
    }
  });
  it('三角色普通技能和大招遵循护盾、引力、五轮飞刃与能量规则', () => {
    const square = new GameWorld('square');
    activateSkill(square); expect(square.state.player.shield).toBe(35);
    square.state.player.energy = 100; activateUltimate(square);
    square.damagePlayer(50); expect(square.state.player.shield).toBe(5); expect(square.state.player.hp).toBe(140);
    const enemy = dummy(square, 100);
    for (let i = 0; i < 60; i++) updateUltimate(square, CONFIG.step);
    expect(enemy.hp).toBe(965);
    const circle = new GameWorld(); const boss = circle.spawnEnemy('boss', { x: 1750, y: 1600 })!;
    const target = dummy(circle, 100);
    circle.state.player.energy = 100; activateUltimate(circle);
    for (let i = 0; i < 180; i++) updateUltimate(circle, CONFIG.step);
    expect(circle.state.player.energy).toBe(0); expect(boss.x).toBe(1750); expect(target.x).toBeLessThan(1700);
    expect(boss.hp).toBe(8850);
    const triangle = new GameWorld('triangle'); triangle.state.player.energy = 100; activateUltimate(triangle);
    for (let i = 0; i < 120; i++) updateUltimate(triangle, CONFIG.step);
    expect(triangle.state.projectiles).toHaveLength(40);
  });
});

describe('导演、地图事件与结算', () => {
  it('阶段名称、刷怪组合和批次保持原边界，事件精英与首领使用统一时刻', () => {
    const mixed = ['chaser', 'runner', 'tank', 'charger', 'ranged'];
    const boundaries = [
      [0, '初始围攻', 1, ['chaser']],
      [30, '初始围攻', 1, ['chaser', 'chaser', 'runner']],
      [60, '重甲来袭', 2, ['chaser', 'runner', 'tank']],
      [120, '精英围攻', 2, mixed],
      [150, '高压混战', 3, mixed],
      [240, '六边核心', 3, mixed],
    ] as const;
    for (const [index, [at, name, batch, enemies]] of boundaries.entries()) {
      expect(stageAt(at)).toMatchObject({ name, batch, enemies });
      if (index > 0) expect(stageAt(at - CONFIG.step)).toBe(stageAt(boundaries[index - 1][0]));
      const world = new GameWorld('circle', 9);
      world.state.time = at;
      new Director().update(world, CONFIG.step);
      expect(world.state.phase).toBe(name);
      if (at < CONFIG.bossAt) {
        const ordinary = world.state.enemies.filter(e => !e.kind.startsWith('elite'));
        expect(ordinary).toHaveLength(batch);
        for (const enemy of ordinary) expect(enemies).toContain(enemy.kind);
      } else expect(world.state.bossSpawned).toBe(true);
    }
    expect(DIRECTOR.eliteTimes).toEqual([120, 210]);
    expect(DIRECTOR.eventTimes).toEqual([90, 180]);
    expect(CONFIG.bossAt).toBe(240);
  });
  it('刷怪保持真实视野外的净距，出生区畅通且上限不积压补发', () => {
    const world = new GameWorld('circle', 9);
    world.setViewport(1200, 600);
    for (let i = 0; i < 250; i++) world.spawnEnemy('chaser');
    expect(world.state.enemies).toHaveLength(250);
    for (const e of world.state.enemies) {
      const dx = Math.abs(e.x - 1600), dy = Math.abs(e.y - 1600);
      expect(dx >= 600 + 120 || dy >= 300 + 120).toBe(true);
      expect(blocked(e, e.radius, world.state.obstacles)).toBe(false);
    }
    expect(world.spawnEnemy('runner')).toBeNull();
    expect(world.spawnEnemy('elite-tank')).not.toBeNull();
    for (const obstacle of world.state.obstacles) expect(blocked({ x: 1600, y: 1600 }, 300, [obstacle])).toBe(false);
  });
  it('停留累计不倒扣，完成奖励不影响经验，超时事件精英无击杀奖励', () => {
    const world = new GameWorld();
    world.state.event = { x: 1600, y: 1600, kind: 'charge', remaining: 90, progress: 19.9, enemyId: null };
    steps(world, 3);
    const progress = world.state.event!.progress;
    world.state.event!.x = 2000;
    steps(world, 3);
    expect(world.state.event!.progress).toBe(progress);
    world.state.event!.x = 1600;
    steps(world, 10);
    expect(world.state.event).toBeNull(); expect(world.state.pendingUpgrades).toBe(1); expect(world.state.level).toBe(1);
    const timed = new GameWorld();
    const e = timed.spawnEnemy('elite-tank', { x: 1800, y: 1600 }, false, true)!;
    timed.state.event = { x: 1800, y: 1600, kind: 'elite', remaining: .01, progress: 0, enemyId: e.id };
    timed.update(CONFIG.step, idle);
    expect(timed.state.enemies.some(en => en.id === e.id)).toBe(false);
    expect(timed.state.kills).toBe(0); expect(timed.state.pendingUpgrades).toBe(0);
  });
  it('事件精英击杀给予免费选择，阶段精英统计排除事件精英', () => {
    const world = new GameWorld();
    const e = world.spawnEnemy('elite-tank', { x: 1800, y: 1600 }, false, true)!;
    world.state.event = { x: e.x, y: e.y, kind: 'elite', remaining: 90, progress: 0, enemyId: e.id };
    world.damage(e, 5000, 'active'); world.debug.resolveResult();
    expect(world.state.pendingUpgrades).toBe(1); expect(world.state.eliteKills).toBe(0); expect(world.state.player.energy).toBe(20);
    expect(world.state.pickups[0].value).toBe(40);
  });
  it('玩家死亡优先于超时，首领被击破不再直接结算而交给关卡推进', () => {
    const dead = new GameWorld();
    dead.state.time = CONFIG.timeout; dead.state.player.hp = 0; dead.state.lives = 1;
    dead.addProjectile({ x: 1800, y: 1600, owner: 'enemy', damage: 30 });
    dead.addEffect({ x: 1600, y: 1600, owner: 'enemy', kind: 'warning', damage: 30, delay: 1 });
    dead.debug.resolveResult();
    expect(dead.state.result).toBe('death');
    expect(dead.state.projectiles).toHaveLength(0); expect(dead.state.effects).toHaveLength(0);
    const timed = new GameWorld(); timed.state.time = CONFIG.timeout; timed.debug.resolveResult(); expect(timed.state.result).toBe('timeout');
    const cleared = new GameWorld();
    const boss = cleared.spawnEnemy('boss', { x: 1900, y: 1600 })!;
    boss.hp = 0; cleared.state.time = CONFIG.timeout;
    cleared.debug.resolveResult();
    expect(cleared.state.result).toBeNull();
  });
  it('同一模拟步伤害结算后判定玩家死亡与首领死亡', () => {
    const world = new GameWorld('square'); const p = world.state.player;
    const boss = world.spawnEnemy('boss', { x: p.x + 30, y: p.y })!;
    p.hp = 1; boss.hp = 1; world.state.lives = 1;
    world.addProjectile({ x: boss.x, y: boss.y, damage: 10, skillId: 'base-square' });
    world.addProjectile({ x: p.x, y: p.y, owner: 'enemy', damage: 10 });
    world.update(CONFIG.step, idle);
    expect(world.state.result).toBe('death');
  });
  it('种子模拟持续覆盖早期、两种阶段精英和首领召唤', () => {
    const world = new GameWorld('circle', 991);
    world.state.player.hp = 1e9; world.state.player.maxHp = 1e9;
    const seen = new Set<string>();
    let firstEvent = false, secondEvent = false, bossSeen = false;
    const summonedIds = new Set<number>();
    for (let frame = 0; frame < 600 * 60 && !world.state.result; frame++) {
      while (world.state.pendingUpgrades) {
        const choice = world.state.choices.find(c => c.kind === 'new') ?? world.state.choices.find(c => c.kind === 'level') ?? world.state.choices[0];
        world.chooseUpgrade(choice.id);
      }
      if (world.state.gift.length) world.chooseGift(world.state.gift[0].id);
      world.update(CONFIG.step, idle);
      for (const e of world.state.enemies) { seen.add(e.kind); if (e.kind === 'boss') bossSeen = true; if (e.summoned) { seen.add('summoned'); summonedIds.add(e.id); } }
      if (world.state.event?.kind === 'elite') firstEvent = true;
      if (world.state.event?.kind === 'charge') secondEvent = true;
    }
    expect(firstEvent).toBe(true); expect(secondEvent).toBe(true);
    expect([...seen]).toEqual(expect.arrayContaining(['chaser', 'runner', 'tank', 'charger', 'ranged', 'elite-tank', 'elite-charger', 'boss', 'summoned']));
    expect(bossSeen).toBe(true);
    expect(summonedIds.size).toBeGreaterThanOrEqual(10);
    expect(world.state.enemies.filter(e => e.summoned).length).toBeLessThanOrEqual(30);
    expect(world.state.enemies.length).toBeLessThanOrEqual(253);
    expect(world.state.pickups.length).toBeLessThanOrEqual(CONFIG.pickupLimit);
  }, 30000);
});

describe('连续闯关与难度缩放', () => {
  it('击破首领会清场并给出大礼包，选择后进入下一关并保留成长', () => {
    const world = new GameWorld('circle', 12);
    world.debug.addXp(30);
    while (world.state.pendingUpgrades) world.chooseUpgrade(world.state.choices[0].id);
    const level = world.state.level, skills = world.state.player.skills.map(s => s.id);
    const boss = world.spawnEnemy('boss', { x: world.state.player.x + 300, y: world.state.player.y })!;
    boss.hp = 0;
    world.update(CONFIG.step, idle);
    expect(world.state.bossDefeated).toBe(true);
    expect(world.state.enemies).toHaveLength(0);
    expect(world.state.gift).toHaveLength(3);
    expect(new Set(world.state.gift.map(c => c.id)).size).toBe(3);
    expect(world.state.stage).toBe(1);
    expect(world.chooseGift(world.state.gift[0].id)).toBe(true);
    expect(world.state.stage).toBe(2);
    expect(world.state.time).toBe(0);
    expect(world.state.bossDefeated).toBe(false);
    expect(world.state.gift).toHaveLength(0);
    expect(world.state.level).toBe(level);
    expect(world.state.player.skills.map(s => s.id)).toEqual(skills);
  });
  it('第 2 关敌人生命与伤害更高，第 1 关倍率为 1', () => {
    const first = new GameWorld('circle', 5);
    const basic = first.spawnEnemy('chaser', { x: 1000, y: 1000 })!;
    expect(basic.maxHp).toBe(30); expect(basic.damage).toBe(10); expect(basic.speed).toBe(90);
    const second = new GameWorld('circle', 5);
    second.state.stage = 2;
    const stronger = second.spawnEnemy('chaser', { x: 1000, y: 1000 })!;
    expect(stronger.maxHp).toBeCloseTo(30 * 1.35); expect(stronger.damage).toBeCloseTo(10 * 1.15); expect(stronger.speed).toBeCloseTo(90 * 1.04);
    const boss = second.spawnEnemy('boss', { x: 1900, y: 1600 })!;
    expect(boss.maxHp).toBeCloseTo(9000 * 1.5);
  });
});

describe('命数与复活', () => {
  it('首次死亡扣 1 条命并倒计时满血复活，命数耗尽才判定死亡', () => {
    const world = new GameWorld('circle', 30);
    const p = world.state.player, start = { x: p.x, y: p.y };
    expect(world.state.lives).toBe(3);
    p.hp = 0;
    world.update(CONFIG.step, idle);
    expect(world.state.result).toBeNull();
    expect(world.state.lives).toBe(2);
    expect(world.state.reviveTimer).toBe(CONFIG.reviveDelay);
    // 复活等待期间：玩家原地不动、生命保持 0，世界照常推进。
    steps(world, 90, { ...idle, x: 1 });
    expect(p.hp).toBe(0);
    expect(p.x).toBe(start.x);
    expect(world.state.time).toBeGreaterThan(1);
    steps(world, 120);
    expect(world.state.reviveTimer).toBe(0);
    expect(p.hp).toBe(p.maxHp);
    expect(p.invulnerable).toBeGreaterThan(0);
    // 命数耗尽后再次归零直接结算死亡。
    world.state.lives = 1; p.hp = 0;
    world.update(CONFIG.step, idle);
    expect(world.state.result).toBe('death');
  });
  it('复活只清除半径内普通敌人，精英与远处敌人保留且不给经验', () => {
    const world = new GameWorld('circle', 31);
    const p = world.state.player;
    const near = world.spawnEnemy('chaser', { x: p.x + 60, y: p.y })!;
    const far = world.spawnEnemy('chaser', { x: p.x + 500, y: p.y })!;
    const elite = world.spawnEnemy('elite-tank', { x: p.x + 60, y: p.y + 40 })!;
    p.hp = 0; world.state.lives = 2; world.state.reviveTimer = CONFIG.step;
    world.update(CONFIG.step, idle);
    expect(p.hp).toBe(p.maxHp);
    expect(p.invulnerable).toBe(CONFIG.reviveInvulnerable);
    expect(world.state.enemies).not.toContain(near);
    expect(world.state.enemies).toContain(far);
    expect(world.state.enemies).toContain(elite);
    expect(world.state.kills).toBe(0);
    expect(world.state.pickups).toHaveLength(0);
  });
  it('大礼包在命数低于上限时提供「生命 +1」并提升命数', () => {
    const world = new GameWorld('circle', 32);
    expect(world.debug.giftCandidates().some(c => c.id === 'gift:life')).toBe(true);
    world.state.lives = CONFIG.livesCap;
    expect(world.debug.giftCandidates().some(c => c.id === 'gift:life')).toBe(false);
    world.state.lives = 2;
    world.state.gift = [{ id: 'gift:life', kind: 'stat', name: '生命 +1', description: '' }];
    expect(world.chooseGift('gift:life')).toBe(true);
    expect(world.state.lives).toBe(3);
  });
});

describe('掉落平衡', () => {
  const harvest = (ratio: number, rounds = 1): { heal: number; maxhp: number } => {
    const world = new GameWorld('circle', 41);
    const p = world.state.player;
    p.hp = p.maxHp * ratio;
    let heal = 0, maxhp = 0;
    for (let round = 0; round < rounds; round++) {
      // 出生区（距地图中心 300 内）无遮挡，保证每次刷怪都成功。
      for (let i = 0; i < 240; i++) world.spawnEnemy('chaser', { x: 1505 + (i % 20) * 10, y: 1600 + round * 20 })!.hp = 0;
      world.debug.resolveResult();
      heal += world.state.pickups.filter(d => d.kind === 'heal').length;
      maxhp += world.state.pickups.filter(d => d.kind === 'maxhp').length;
      world.state.pickups.length = 0; world.state.enemies.length = 0; world.debug.rebuildGrid();
    }
    return { heal, maxhp };
  };
  it('满血不产出补血，生命上限以低概率持续产出', () => {
    const full = harvest(1, 5);
    expect(full.heal).toBe(0);
    expect(full.maxhp).toBeGreaterThan(0);
    expect(full.maxhp).toBeLessThan(30);
  });
  it('受伤越重补血掉率越高，产出落在设计区间内', () => {
    const wounded = harvest(.05);
    // 240 次击杀、血量 5%：补血期望 ≈ 0.078 × 240 ≈ 19。
    expect(wounded.heal).toBeGreaterThan(5);
    expect(wounded.heal).toBeLessThan(40);
  });
  it('拾取生命上限同时提升最大生命与当前生命', () => {
    const world = new GameWorld('circle', 42);
    const p = world.state.player;
    p.hp = 40; p.maxHp = 100;
    world.state.pickups.push({ id: 1, x: p.x, y: p.y, kind: 'maxhp', value: 7, attracted: true });
    world.update(CONFIG.step, idle);
    expect(p.maxHp).toBe(107); expect(p.hp).toBe(47);
  });
});

describe('暴击、闪避与护甲', () => {
  it('暴击率 100% 时按暴击倍率放大玩家伤害', () => {
    const world = new GameWorld('circle', 3);
    const enemy = dummy(world, 100);
    world.state.player.critChance = 1; world.state.player.critMultiplier = 2;
    world.damage(enemy, 50, 'homing', false);
    expect(enemy.hp).toBe(900);
  });
  it('暴击率为 0 时不消耗模拟随机数，种子流保持一致', () => {
    const a = new GameWorld('circle', 21), b = new GameWorld('circle', 21);
    dummy(a, 100); dummy(b, 100);
    a.damage(a.state.enemies[0], 10, 'homing', false);
    expect(a.random()).toBe(b.random());
  });
  it('护甲全来源固定减伤且有 1 点下限，闪避只作用于接触伤害', () => {
    const world = new GameWorld('circle', 4);
    const p = world.state.player;
    p.armor = 8;
    world.damagePlayer(30);
    expect(p.hp).toBe(88);
    world.damagePlayer(5);
    expect(p.hp).toBe(87);
    p.hp = 110; p.dodge = .5;
    world.damagePlayer(20);
    expect(p.hp).toBe(98);
    p.invulnerable = 0;
    world.damagePlayer(20, true);
    expect(p.hp).toBe(96);
  });
  it('升级卡可获得暴击、暴击伤害、闪避与护甲并受上限约束', () => {
    const world = new GameWorld('circle', 6);
    const p = world.state.player;
    const pool = world.debug.candidates();
    for (const id of ['stat:crit', 'stat:critDamage', 'stat:dodge', 'stat:armor']) expect(pool.some(c => c.id === id), id).toBe(true);
    const pick = (id: string): void => {
      world.state.pendingUpgrades = 1;
      world.state.choices = [{ id, kind: 'stat', name: id, description: '' }];
      expect(world.chooseUpgrade(id)).toBe(true);
    };
    pick('stat:crit'); pick('stat:critDamage'); pick('stat:dodge'); pick('stat:armor');
    expect(p.critChance).toBeCloseTo(.08);
    expect(p.critMultiplier).toBeCloseTo(1.6);
    expect(p.dodge).toBeCloseTo(.05);
    expect(p.armor).toBe(2);
    p.critChance = CONFIG.critCap; p.armor = CONFIG.armorCap;
    const capped = world.debug.candidates();
    expect(capped.some(c => c.id === 'stat:crit' || c.id === 'stat:armor')).toBe(false);
  });
});
