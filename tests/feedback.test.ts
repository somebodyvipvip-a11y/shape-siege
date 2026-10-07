import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { collectDeaths } from '../src/game/combat';
import { CONFIG } from '../src/game/config';
import { addFeedback, DAMAGE_LIMIT, FEEDBACK_LIMIT, hitFeedback, updateFeedback } from '../src/game/feedback';
import { GameWorld } from '../src/game/world';
import { drawWorld } from '../src/render/geometry';
import { defaultSave } from '../src/storage';

function fixture() {
  const w = new GameWorld('circle', 17);
  w.state.obstacles = [];
  const e = w.spawnEnemy('tank', { x: 1750, y: 1600 })!;
  return { w, e };
}

describe('战斗装饰反馈', () => {
  it('仅生成命中与死亡反馈时不消费战斗随机数或实体编号', () => {
    const { w, e } = fixture(), { w: reference } = fixture();
    hitFeedback(w.state, e, 10, false);
    addFeedback(w.state, { kind: 'death', x: e.x, y: e.y, radius: e.radius, duration: .28 });
    expect(w.nextId()).toBe(reference.nextId()); expect(w.random()).toBe(reference.random());
  });
  it('拥挤场景限制默认/低画质屏内标签数量', () => {
    const { w } = fixture();
    for (let i = 0; i < DAMAGE_LIMIT; i++) addFeedback(w.state, { kind: 'damage', x: 1250 + i % 6 * 100,
      y: 1400 + Math.floor(i / 6) * 80, radius: 36, duration: .55, amount: 10 });
    for (const [quality, limit] of [['default', 10], ['low', 4]] as const) {
      let labels = 0;
      const g = new Proxy({}, { get: (_target, name) => (...args: unknown[]) => {
        if (name === 'lineBetween' && Number(args[2]) - Number(args[0]) === 4 && args[1] === args[3]) labels++;
      } }) as Phaser.GameObjects.Graphics;
      drawWorld(g, g, w.state, { ...defaultSave().settings, quality });
      expect(labels).toBe(limit);
    }
  });
  it('显示实际扣血并合并短时间命中，不延长标签寿命', () => {
    const { w, e } = fixture();
    w.damage(e, 12, 'active'); updateFeedback(w.state, .1);
    w.damage(e, 8, 'active');
    const labels = w.state.feedback.filter(f => f.kind === 'damage');
    expect(labels).toHaveLength(1); expect(labels[0].amount).toBe(20);
    expect(labels[0].life).toBeCloseTo(.45);
    w.damage(e, 999, 'active');
    expect(labels[0].amount).toBe(90);
    w.damage(e, 999, 'active'); expect(labels[0].amount).toBe(90);
  });
  it('暴击保留实际扣血和标记', () => {
    const { w, e } = fixture(); w.state.player.critChance = 1;
    w.damage(e, 10, 'active');
    expect(w.state.feedback.find(f => f.kind === 'damage')).toMatchObject({ critical: true, amount: 15 });
    expect(e.hp).toBe(75);
  });
  it('死亡只触发一次，亡灵爆炸怪保持完整', () => {
    const { w, e } = fixture(); w.damage(e, 999, 'active');
    collectDeaths(w); collectDeaths(w);
    expect(w.state.feedback.filter(f => f.kind === 'death')).toHaveLength(1);
    expect(w.state.kills).toBe(1);
    const ghost = w.spawnEnemy('exploder', { x: 1800, y: 1600 })!;
    w.damage(ghost, 10, 'active'); collectDeaths(w);
    expect(w.state.explosions).toHaveLength(1);
    expect(w.state.feedback.filter(f => f.kind === 'death')).toHaveLength(1);
  });
  it('装饰溢出不挤占预警、实际扣血、实体编号或随机流', () => {
    const { w, e } = fixture(), { w: reference, e: other } = fixture();
    for (let i = 0; i < FEEDBACK_LIMIT + 10; i++) addFeedback(w.state, { kind: 'death', x: 1600, y: 1600, radius: 10, duration: .3 });
    expect(w.state.feedback).toHaveLength(FEEDBACK_LIMIT);
    w.damage(e, 10, 'active'); reference.damage(other, 10, 'active');
    expect(e.hp).toBe(other.hp); expect(w.nextId()).toBe(reference.nextId()); expect(w.random()).toBe(reference.random());
    expect(w.addEffect({ x: 1600, y: 1600, owner: 'enemy', kind: 'warning' })).not.toBeNull();
  });
  it('伤害标签有独立数量上限，暂停冻结，恢复后过期清除', () => {
    const { w } = fixture();
    for (let i = 0; i < 30; i++) { const e = w.spawnEnemy('tank', { x: 1800 + i, y: 1600 })!; w.damage(e, 1, 'active'); }
    expect(w.state.feedback.filter(f => f.kind === 'damage')).toHaveLength(DAMAGE_LIMIT);
    const snapshot = JSON.stringify(w.state.feedback);
    w.setPaused(true); w.update(CONFIG.step); expect(JSON.stringify(w.state.feedback)).toBe(snapshot);
    w.setPaused(false); w.update(CONFIG.step); expect(JSON.stringify(w.state.feedback)).not.toBe(snapshot);
    updateFeedback(w.state, 1); expect(w.state.feedback).toHaveLength(0);
  });
  it('失败与进入下一关清理装饰', () => {
    const { w, e } = fixture(); w.damage(e, 1, 'active');
    w.state.player.hp = 0; w.state.lives = 1; w.debug.resolveResult();
    expect(w.state.feedback).toHaveLength(0);
    const { w: next, e: enemy } = fixture(); next.damage(enemy, 1, 'active'); next.state.bossDefeated = true;
    next.update(CONFIG.step); expect(next.state.feedback).toHaveLength(0); expect(next.state.gift.length).toBeGreaterThan(0);
  });
  it('减少动态效果关闭亮边、发射线和命中碎光，保留伤害信息', () => {
    const { w, e } = fixture(); w.damage(e, 10, 'active'); w.addProjectile({ x: 1600, y: 1600, vx: 400 });
    const calls: unknown[][] = [];
    const g = new Proxy({}, { get: (_target, name) => (...args: unknown[]) => { calls.push([name, ...args]); } }) as Phaser.GameObjects.Graphics;
    drawWorld(g, g, w.state, { ...defaultSave().settings, reducedMotion: true });
    expect(calls.some(c => c[0] === 'lineStyle' && c[2] === 0xffe4e9)).toBe(false);
    expect(calls.some(c => c[0] === 'lineStyle' && c[2] === 0xffb8c3)).toBe(true);
  });
});
