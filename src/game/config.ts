import type { CharacterId, EnemyKind, SkillId } from './types';

// 单关 5:00 = 300 秒；节点即各阶段切换时刻，见 docs/tasks/gameplay-brief.md 第二节。
export const STAGE_TIMES = { runners: 30, armor: 60, firstEvent: 90, firstElite: 120, pressure: 150, secondEvent: 180, secondElite: 210, boss: 240 } as const;
interface Stage { at: number; name: string; batch: number; enemies: readonly EnemyKind[]; periodicRelief: boolean }
const mixedEnemies: readonly EnemyKind[] = ['chaser', 'runner', 'tank', 'charger', 'ranged', 'exploder'];
export const STAGES: readonly Stage[] = [
  { at: 0, name: '初始围攻', batch: 1, enemies: ['chaser'], periodicRelief: false },
  { at: STAGE_TIMES.runners, name: '初始围攻', batch: 1, enemies: ['chaser', 'chaser', 'runner'], periodicRelief: false },
  { at: STAGE_TIMES.armor, name: '重甲来袭', batch: 2, enemies: ['chaser', 'runner', 'tank', 'exploder'], periodicRelief: false },
  { at: STAGE_TIMES.firstElite, name: '精英围攻', batch: 2, enemies: mixedEnemies, periodicRelief: false },
  { at: STAGE_TIMES.pressure, name: '高压混战', batch: 3, enemies: mixedEnemies, periodicRelief: true },
  { at: STAGE_TIMES.boss, name: '六边核心', batch: 3, enemies: mixedEnemies, periodicRelief: true },
];
export function stageAt(time: number): Stage { return STAGES.reduce((stage, next) => time >= next.at ? next : stage, STAGES[0]); }
/** 爆炸怪低权重混入正常怪池，保持总生成量和随机调用次数不变。 */
export function stageEnemyAt(time: number, roll: number): EnemyKind {
  const pool = stageAt(time).enemies;
  const weight = (kind: EnemyKind): number => kind === 'exploder' ? EXPLOSION.spawnWeight : 1;
  let remaining = roll * pool.reduce((sum, kind) => sum + weight(kind), 0);
  for (const kind of pool) { remaining -= weight(kind); if (remaining < 0) return kind; }
  return pool[pool.length - 1];
}

export const CONFIG = {
  step: 1 / 60, maxCatchup: 5, mapSize: 3200, playerRadius: 16, spawnClearance: 120,
  enemyLimit: 140, playerProjectileLimit: 400, enemyProjectileLimit: 150, effectLimit: 300, pickupLimit: 300,
  gridSize: 128, bossAt: STAGE_TIMES.boss, timeout: 300, contactProtection: .5, xpRadius: 80,
  lives: 3, livesCap: 5, reviveDelay: 3, reviveInvulnerable: 2.5, reviveClearRadius: 150,
  skillMaxLevel: 8, autoSlots: 4, slotCap: 6, maxRerolls: 2, speedBonusCap: .3, cooldownCap: .4,
  critCap: .6, critMultBase: 1.5, critMultCap: 2.5, dodgeCap: .4, armorCap: 20,
  luckCap: 10, rareWeightLuck: .25, luckPerReroll: 2, lifestealStep: .006, lifestealCap: .05,
  chargeRequired: 20, eventLifetime: 90, eventRadius: 150,
  projectileSpeed: 400, pickupSpeed: 500, baseDamageGrowth: .16, damageUpgrade: .06, xpMultiplier: 1.25,
} as const;
/** 英雄先天属性加成：均为「在默认值之上的增量」，默认 0，因此不填写的英雄与旧行为一致。 */
export interface CharacterAttributes {
  critChance?: number; critMultiplier?: number; dodge?: number; armor?: number; luck?: number;
  lifesteal?: number; speedBonus?: number; cooldownReduction?: number; damageBonus?: number; pickupRadius?: number;
}
export const CHARACTERS: Record<CharacterId, { name: string; hp: number; speed: number; base: SkillId; startingAoe: SkillId; skillCooldown: number; ultimateDuration: number; attributes: CharacterAttributes }> = {
  // 堡垒：血最厚、移速最慢，用护甲与冷却缩减强化「扛线 + 频繁开盾」的重装定位。
  square: { name: '正方形·堡垒', hp: 190, speed: 180, base: 'base-square', startingAoe: 'lightning', skillCooldown: 10, ultimateDuration: 6, attributes: { armor: 3, cooldownReduction: .05 } },
  // 星环：能力均衡，用幸运与拾取范围强化「运营养成」，走稳定的滚雪球路线。
  circle: { name: '圆形·星环', hp: 150, speed: 210, base: 'base-circle', startingAoe: 'shockwave', skillCooldown: 9, ultimateDuration: 3, attributes: { luck: 1, pickupRadius: 20 } },
  // 锋刃：血最薄、移速最快，用暴击与闪避走「高风险高回报」的爆发定位。
  triangle: { name: '三角形·锋刃', hp: 115, speed: 245, base: 'base-triangle', startingAoe: 'boomerang', skillCooldown: 8, ultimateDuration: 2, attributes: { critChance: .1, critMultiplier: .25, dodge: .08 } },
  diamond: { name: '菱形·棱镜', hp: 100, speed: 225, base: 'base-diamond', startingAoe: 'refraction', skillCooldown: 11, ultimateDuration: .6, attributes: { critChance: .15 } },
  pentagon: { name: '五边形·织阵', hp: 140, speed: 200, base: 'base-pentagon', startingAoe: 'sigil', skillCooldown: 8, ultimateDuration: 3, attributes: { cooldownReduction: .08, luck: 1 } },
  hexagon: { name: '六边形·重锤', hp: 210, speed: 165, base: 'base-hexagon', startingAoe: 'fissure', skillCooldown: 9, ultimateDuration: 5, attributes: { armor: 2, damageBonus: .08 } },
};
export const CHARACTER_IDS: readonly CharacterId[] = ['circle', 'square', 'triangle', 'diamond', 'pentagon', 'hexagon'];
export const STARTING_CHARACTERS: readonly CharacterId[] = ['circle', 'diamond', 'pentagon', 'hexagon'];
export const SKILLS: Record<SkillId, { name: string; damage: number; cooldown: number; range: number; radius: number; behavior: string }> = {
  'base-square': { name: '四向冲击', damage: 24, cooldown: .9, range: 600, radius: 7, behavior: '增加斜向冲击弹' },
  'base-circle': { name: '星环轨道', damage: 20, cooldown: .5, range: 80, radius: 12, behavior: '增加两颗轨道球' },
  'base-triangle': { name: '穿透飞刃', damage: 30, cooldown: .65, range: 650, radius: 8, behavior: '增加两枚侧翼飞刃' },
  'base-diamond': { name: '聚焦射线', damage: 58, cooldown: 1.05, range: 720, radius: 7, behavior: '射线宽度增加 5' },
  refraction: { name: '折射碎光', damage: 28, cooldown: 1.8, range: 240, radius: 5, behavior: '折射目标增加 2' },
  'base-pentagon': { name: '符点追击', damage: 28, cooldown: .8, range: 600, radius: 7, behavior: '额外发射一枚符点' },
  sigil: { name: '延时法阵', damage: 75, cooldown: 1.6, range: 0, radius: 135, behavior: '法阵上限增加 2，爆炸范围增加 25' },
  'base-hexagon': { name: '重锤横扫', damage: 64, cooldown: 1.1, range: 135, radius: 135, behavior: '横扫角度扩大 40 度' },
  fissure: { name: '震地裂纹', damage: 48, cooldown: 2.2, range: 290, radius: 28, behavior: '裂纹宽度增加 12，击退距离增加 30' },
  homing: { name: '追踪弹', damage: 24, cooldown: 1.2, range: 600, radius: 7, behavior: '命中后分裂两枚飞弹' },
  lightning: { name: '连锁闪电', damage: 30, cooldown: 1.8, range: 600, radius: 180, behavior: '传导目标数增加 2' },
  boomerang: { name: '回旋刃', damage: 24, cooldown: 1.8, range: 300, radius: 14, behavior: '额外发射一枚回旋刃' },
  mine: { name: '地面雷区', damage: 45, cooldown: 2, range: 0, radius: 120, behavior: '额外放置两枚雷区' },
  shockwave: { name: '震荡波', damage: 36, cooldown: 2.1, range: 170, radius: 170, behavior: '冲击波击退距离增加 60' },
  meteor: { name: '落星', damage: 52, cooldown: 2.4, range: 600, radius: 120, behavior: '每轮额外落下一颗星' },
};
export const GENERIC_SKILLS: SkillId[] = ['homing', 'lightning', 'boomerang', 'mine', 'shockwave', 'meteor'];
export const ELEMENT_NAMES = { fire: '火', ice: '冰', lightning: '雷' } as const;
export const ENEMIES: Record<EnemyKind, { hp: number; speed: number; radius: number; damage: number; xp: number; xpDrops: number; energy: number }> = {
  chaser: { hp: 30, speed: 80, radius: 14, damage: 10, xp: 2, xpDrops: 1, energy: 1 },
  runner: { hp: 20, speed: 128, radius: 11, damage: 8, xp: 2, xpDrops: 1, energy: 1 },
  tank: { hp: 90, speed: 50, radius: 23, damage: 18, xp: 4, xpDrops: 3, energy: 1 },
  charger: { hp: 50, speed: 76, radius: 16, damage: 16, xp: 2, xpDrops: 2, energy: 1 },
  ranged: { hp: 40, speed: 68, radius: 16, damage: 12, xp: 2, xpDrops: 2, energy: 1 },
  exploder: { hp: 1, speed: 72, radius: 16, damage: 8, xp: 2, xpDrops: 2, energy: 1 },
  'elite-tank': { hp: 800, speed: 50, radius: 38, damage: 28, xp: 40, xpDrops: 10, energy: 20 },
  'elite-charger': { hp: 1000, speed: 95, radius: 32, damage: 26, xp: 40, xpDrops: 10, energy: 20 },
  // 首领需在 4:00–5:00 的 60 秒窗口内击破：基础生命 3000，与清退普通怪和降低召唤量共同保证输出窗口。
  boss: { hp: 3000, speed: 55, radius: 60, damage: 30, xp: 0, xpDrops: 0, energy: 0 },
};
export const ACTIVE = {
  square: { radius: 180, shield: 35, duration: 4, knockback: 100 },
  circle: { radius: 200, duration: 2 },
  triangle: { distance: 160, duration: .2, damage: 35 },
} as const;
export const HERO_MECHANICS = {
  diamond: { blinkDistance: 160, decoyDuration: 2, decoyRange: 300, beamLength: 900, beamWidth: 24, ultimateDamage: 230 },
  pentagon: { sigilLimit: 6, sigilLife: 7, triggerRadius: 30, delay: .45, slow: .3, webRadius: 240, webDamage: 100 },
  hexagon: { sweepAngle: Math.PI * 5 / 9, windup: .4, activeRadius: 175, activeDamage: 120, reduction: .25, overdriveCooldown: .55, overdriveRange: 60, finaleRadius: 210, finaleDamage: 120 },
} as const;
export const ULTIMATE = {
  square: { radius: 260, damage: 35, reduction: .4 },
  circle: { radius: 280, damage: 150, pullSpeed: 130 },
  triangle: { rounds: 5, blades: 8, damage: 30 },
} as const;
export const ELEMENT_CONFIG = { duration: 2, burnRatio: .15, iceSlow: .25, chainRadius: 120, chainCount: 2, chainRatio: .3, thermalRadius: 60, thermalRatio: .4, thermalSlow: .15, thermalInterval: .5 } as const;
export const DIRECTOR = { eliteTimes: [STAGE_TIMES.firstElite, STAGE_TIMES.secondElite], eventTimes: [STAGE_TIMES.firstEvent, STAGE_TIMES.secondEvent], bossChargeWarning: 1, blastWarning: 1.2, chargeWarning: .8, summonInterval: 25, summonCount: 4, summonCap: 10 } as const;
export const ENEMY_BEHAVIOR = {
  // aimCap：同一时刻处于「预警锁定」的指向性敌人上限，避免后期数百个攻击指向同时指向玩家。
  aimCap: 6,
  chargeSpeed: 430, chargeDuration: .7, chargeRest: 2.2, chargeRange: 420,
  rangedRange: 350, rangedWarning: .7, rangedRest: 2.5, rangedShotSpeed: 230,
  bossChargeSpeed: 500, bossChargeDuration: .85, bossRest: 2.5, bossEnragedRest: 1.4,
  bossShotSpeed: 250, bossShotSpread: .18, bossBlastRadius: 85,
} as const;

export const EXPLOSION = { fuse: 2, radius: 70, damage: 70, playerDamage: 20, spawnWeight: .2 } as const;
