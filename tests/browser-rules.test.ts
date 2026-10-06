import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { GameInput, isTextInput } from '../src/input';
import { defaultSave, SAVE_KEY, SaveStore, validateSave, type StoragePort } from '../src/storage';
import { GameWorld } from '../src/game/world';
import { blocked } from '../src/game/spatial';
import { drawWorld } from '../src/render/geometry';
import { viewportFor } from '../src/render/viewport';
import { handleDialogEscape } from '../src/ui/dialog-input';

function event(type: string, properties: Record<string, unknown> = {}): Event {
  const value = new Event(type, { cancelable: true });
  for (const [key, property] of Object.entries(properties)) Object.defineProperty(value, key, { value: property });
  return value;
}
class TouchElement extends EventTarget {
  style = { transform: '' };
  disabled = false;
  captured = new Set<number>();
  classes = new Set<string>();
  classList = { add: (name: string) => this.classes.add(name), remove: (name: string) => this.classes.delete(name) };
  knob = { style: { transform: '' } };
  querySelector(): unknown { return this.knob; }
  setPointerCapture(id: number): void { this.captured.add(id); }
  hasPointerCapture(id: number): boolean { return this.captured.has(id); }
  releasePointerCapture(id: number): void { this.captured.delete(id); }
}
function inputFixture() {
  const window = new EventTarget(), pause = vi.fn(), input = new GameInput(window as Window, pause);
  const stick = new TouchElement(), skill = new TouchElement(), ultimate = new TouchElement();
  input.bind(stick as unknown as HTMLElement, skill as unknown as HTMLButtonElement, ultimate as unknown as HTMLButtonElement);
  input.setEnabled(true);
  return { window, pause, input, stick, skill, ultimate };
}
const down = (id: number, x = 0, y = 0): Event => event('pointerdown', { pointerId: id, clientX: x, clientY: y, button: 0 });

describe('unified input lifecycle', () => {
  it('tracks movement independently while both ability buttons fire single pulses', () => {
    const f = inputFixture();
    f.stick.dispatchEvent(down(10, 50, 50));
    f.stick.dispatchEvent(event('pointermove', { pointerId: 10, clientX: 94, clientY: 50 }));
    f.skill.dispatchEvent(down(11)); f.ultimate.dispatchEvent(down(12));
    expect(f.input.read()).toEqual({ x: 1, y: 0, skill: true, ultimate: true });
    expect(f.input.read()).toEqual({ x: 1, y: 0, skill: false, ultimate: false });
    f.stick.dispatchEvent(event('pointerup', { pointerId: 11 }));
    expect(f.input.read().x).toBe(1);
    f.input.destroy();
  });
  it('ignores a second movement pointer and cancels the correct one', () => {
    const f = inputFixture(); f.stick.dispatchEvent(down(1)); f.stick.dispatchEvent(down(2));
    f.stick.dispatchEvent(event('pointermove', { pointerId: 2, clientX: 44, clientY: 0 }));
    expect(f.input.read().x).toBe(0);
    f.stick.dispatchEvent(event('pointermove', { pointerId: 1, clientX: 44, clientY: 0 }));
    f.stick.dispatchEvent(event('pointercancel', { pointerId: 1 }));
    expect(f.input.read().x).toBe(0); expect(f.stick.knob.style.transform).toBe('');
    f.input.destroy();
  });
  it.each(['blur', 'resize'])('clears held keys, pulses, capture and joystick visuals on %s', type => {
    const f = inputFixture(); f.window.dispatchEvent(event('keydown', { code: 'KeyW', repeat: false }));
    f.stick.dispatchEvent(down(4)); f.stick.dispatchEvent(event('pointermove', { pointerId: 4, clientX: 20, clientY: 0 }));
    f.skill.dispatchEvent(down(5)); f.window.dispatchEvent(event(type));
    expect(f.input.read()).toEqual({ x: 0, y: 0, skill: false, ultimate: false });
    expect(f.stick.captured.size).toBe(0); expect(f.stick.classes.size).toBe(0); expect(f.stick.knob.style.transform).toBe('');
    f.input.destroy();
  });
  it('disabled gameplay clears the stick and does not leak old listeners after restart', () => {
    const f = inputFixture(); f.stick.dispatchEvent(down(3));
    f.stick.dispatchEvent(event('pointermove', { pointerId: 3, clientX: 44, clientY: 0 }));
    f.input.setEnabled(false); expect(f.stick.captured.size).toBe(0); expect(f.stick.knob.style.transform).toBe('');
    f.input.destroy(); f.window.dispatchEvent(event('keydown', { code: 'Escape', repeat: false })); expect(f.pause).not.toHaveBeenCalled();
  });
  it('does not repeat a skill while its key is held, including browser repeat events', () => {
    const f = inputFixture(); f.window.dispatchEvent(event('keydown', { code: 'Space', repeat: false }));
    expect(f.input.read().skill).toBe(true);
    f.window.dispatchEvent(event('keydown', { code: 'Space', repeat: true })); expect(f.input.read().skill).toBe(false);
    f.window.dispatchEvent(event('keyup', { code: 'Space' })); f.window.dispatchEvent(event('keydown', { code: 'Space', repeat: false }));
    expect(f.input.read().skill).toBe(true); f.input.destroy();
  });
  it('cancels an unconsumed ability when the touch is cancelled', () => {
    const f = inputFixture(); f.skill.dispatchEvent(down(2)); f.skill.dispatchEvent(event('pointercancel', { pointerId: 2 }));
    expect(f.input.read().skill).toBe(false); f.input.destroy();
  });
  it('ignores shortcuts while a text control owns focus', () => {
    const f = inputFixture(); const field = new EventTarget(); Object.defineProperty(field, 'tagName', { value: 'INPUT' });
    expect(isTextInput(field)).toBe(true);
    f.window.dispatchEvent(event('keydown', { code: 'KeyW', repeat: false, target: field }));
    expect(f.input.read().y).toBe(0); f.input.destroy();
  });
  it('the dialog and gameplay listeners consume one Esc only when resume enables gameplay', () => {
    const target = new EventTarget(); let input: GameInput; let panel = 'pause'; const pause = vi.fn();
    // Same registration order and same handler as GameApp.
    target.addEventListener('keydown', e => { if (panel !== 'none') handleDialogEscape(e as KeyboardEvent, panel, () => { panel = 'none'; input.setEnabled(true); }, () => {}); });
    input = new GameInput(target as Window, pause); input.setEnabled(false);
    target.dispatchEvent(event('keydown', { code: 'Escape', repeat: false }));
    expect(panel).toBe('none'); expect(pause).not.toHaveBeenCalled(); input.destroy();
  });
  it('Esc cannot bypass a pending upgrade dialog', () => {
    const resume = vi.fn(), close = vi.fn(); handleDialogEscape(event('keydown', { code: 'Escape' }) as KeyboardEvent, 'upgrade', resume, close);
    expect(resume).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
  });
});

describe('local save recovery and unlocks', () => {
  it('validates unknown schema and malformed fields, preserving valid fields only', () => {
    expect(validateSave({ schemaVersion: 2 })).toEqual(defaultSave());
    const save = validateSave({ schemaVersion: 1, settings: { autoSkill: 'yes', music: Infinity, sound: -1, quality: 'ultra' }, unlocked: ['triangle', 'unknown', 'triangle'], best: { kills: -3, time: 900 }, stats: null });
    expect(save.settings).toEqual(defaultSave().settings); expect(save.unlocked).toEqual(['circle', 'triangle']);
    expect(save.best.kills).toBe(0); expect(save.best.time).toBe(720); expect(save.stats.runs).toBe(0);
  });
  it.each(['{broken', 'null', '{"schemaVersion":99}'])('recovers bad JSON/schema (%s) with a useful warning', raw => {
    const store = new SaveStore({ getItem: () => raw, setItem: () => {} });
    expect(store.data).toEqual(defaultSave()); expect(store.warning).not.toBe('');
  });
  it('handles blocked reads and writes without losing in-memory progress', () => {
    const port: StoragePort = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('quota'); } };
    const store = new SaveStore(port); expect(store.warning).not.toBe('');
    const world = new GameWorld(); world.state.result = 'death'; world.state.kills = 12;
    expect(store.finish(world.state)).toEqual(['square']); expect(store.data.stats.runs).toBe(1);
    expect(store.data.best.kills).toBe(12); expect(store.warning).toContain('保存失败');
  });
  it('persists settings and elite unlock immediately; finishing also unlocks square', () => {
    const memory = new Map<string, string>();
    const port = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); } };
    const store = new SaveStore(port), world = new GameWorld();
    store.data.settings.autoSkill = true; world.state.eliteKills = 1;
    expect(store.unlockElite(world.state)).toBe(true); expect(store.unlockElite(world.state)).toBe(false);
    expect(new SaveStore(port).data.unlocked).toContain('triangle');
    world.state.result = 'victory'; world.state.time = 550; expect(store.finish(world.state)).toEqual(['square']);
    const reload = new SaveStore(port); expect(reload.data.settings.autoSkill).toBe(true); expect(reload.data.best.victories).toBe(1); expect(reload.data.stats.runs).toBe(1);
    expect(reload.warning).toBe('');
    expect(memory.get(SAVE_KEY)).toBeTruthy();
  });
  it('does not record abandoned or ongoing runs as completed', () => {
    const store = new SaveStore(null), world = new GameWorld(); expect(store.finish(world.state)).toEqual([]); expect(store.data.stats.runs).toBe(0); expect(store.data.unlocked).toEqual(['circle']);
  });
});

describe('rendering matches simulation geometry', () => {
  it('renders obstacle rectangles from the exact collision top-left coordinates', () => {
    const world = new GameWorld('square'), obstacle = world.state.obstacles[0];
    world.state.player.x = obstacle.x + obstacle.width / 2; world.state.player.y = obstacle.y + obstacle.height / 2;
    const calls: { name: string; args: unknown[] }[] = [];
    const graphics = new Proxy({}, { get: (_target, name) => (...args: unknown[]) => { calls.push({ name: String(name), args }); return graphics; } }) as Phaser.GameObjects.Graphics;
    drawWorld(graphics, graphics, world.state, defaultSave().settings);
    const rect = [obstacle.x, obstacle.y, obstacle.width, obstacle.height];
    expect(calls.some(call => call.name === 'fillRect' && JSON.stringify(call.args) === JSON.stringify(rect))).toBe(true);
    expect(blocked({ x: obstacle.x + 1, y: obstacle.y + 1 }, 1, world.state.obstacles)).toBe(true);
  });
  it('keeps the same visible world area after rotation and bounds extreme ratios', () => {
    const portrait = viewportFor(360, 800), landscape = viewportFor(800, 360);
    expect(portrait.width * portrait.height).toBeCloseTo(landscape.width * landscape.height, 8);
    expect(viewportFor(100, 2000).ratio).toBe(.65); expect(viewportFor(2000, 100).ratio).toBe(1.85);
  });
});
