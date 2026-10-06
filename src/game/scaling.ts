/** 连续闯关的难度缩放。第 1 关全部倍率为 1，保证现有手感与测试不变。 */
export interface StageScale {
  hp: number; damage: number; speed: number; eliteHp: number; xp: number; spawn: number;
}
export function stageScale(stage: number): StageScale {
  const n = Math.max(1, Math.floor(stage)) - 1;
  return {
    hp: 1 + 0.35 * n,
    damage: 1 + 0.15 * n,
    speed: Math.min(1.4, 1 + 0.04 * n),
    eliteHp: 1 + 0.50 * n,
    xp: 1 + 0.15 * n,
    spawn: Math.max(0.55, 1 - 0.06 * n),
  };
}
