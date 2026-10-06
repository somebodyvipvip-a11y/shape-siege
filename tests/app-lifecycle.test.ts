import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameApp } from '../src/app';
import type { GameWorld } from '../src/game/world';

const mocks = vi.hoisted(() => ({
  audio: { unlock: vi.fn(), startMusic: vi.fn(), stop: vi.fn(), play: vi.fn(), configure: vi.fn() },
  createRenderer: vi.fn(),
}));
vi.mock('../src/audio', () => ({ GameAudio: class { constructor() { return mocks.audio; } } }));
vi.mock('../src/render/scene', () => ({ createBattleRenderer: mocks.createRenderer }));
vi.mock('../src/ui/shared', async importOriginal => ({ ...await importOriginal<object>(), icon: () => '<svg aria-hidden="true"></svg>' }));

// Minimal DOM ports; GameApp, GameInput and GameWorld execute their real lifecycle handlers.
class ElementPort extends EventTarget {
  innerHTML = ''; textContent = ''; hidden = false; disabled = false; isConnected = true;
  dataset: Record<string, string> = {}; tagName = 'DIV'; type = ''; value = '';
  style = { transform: '', setProperty: vi.fn() };
  classList = { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() };
  private children = new Map<string, ElementPort>();
  querySelector(selector: string): ElementPort {
    if (!this.children.has(selector)) this.children.set(selector, new ElementPort());
    return this.children.get(selector)!;
  }
  querySelectorAll(): ElementPort[] { return []; }
  setAttribute(): void {}
  removeAttribute(): void {}
  focus(): void {}
  closest(): ElementPort { return this; }
  setPointerCapture(): void {}
  hasPointerCapture(): boolean { return false; }
}
function dispatch(target: EventTarget, type: string, values: Record<string, unknown> = {}): void {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(values)) Object.defineProperty(event, key, { value });
  target.dispatchEvent(event);
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
describe('app audio and input coordination', () => {
  let root: ElementPort, target: EventTarget, doc: EventTarget & { hidden: boolean };
  const click = (action: string): void => {
    const button = new ElementPort(); button.dataset.action = action;
    dispatch(root, 'click', { target: button });
  };
  const flush = async (): Promise<void> => { await new Promise<void>(resolve => setImmediate(resolve)); };
  const start = async (): Promise<void> => {
    click('start-help');
    await vi.waitFor(() => expect(root.querySelector('#overlay-root').innerHTML).toBe(''));
  };
  beforeEach(async () => {
    vi.clearAllMocks(); mocks.audio.unlock.mockReset().mockResolvedValue(undefined);
    mocks.createRenderer.mockResolvedValue({ destroy: vi.fn(), resize: vi.fn(), shake: vi.fn() });
    root = new ElementPort(); target = new EventTarget();
    doc = Object.assign(new EventTarget(), { hidden: false, activeElement: null, body: new ElementPort(), documentElement: new ElementPort() });
    vi.stubGlobal('window', target); vi.stubGlobal('document', doc); vi.stubGlobal('HTMLInputElement', ElementPort);
    new GameApp(root as unknown as HTMLElement, 'test');
    await start(); mocks.audio.startMusic.mockClear();
  });
  afterEach(() => { click('menu'); vi.unstubAllGlobals(); });
  it('keeps a held Esc paused until a new non-repeat press', async () => {
    dispatch(target, 'keydown', { code: 'Escape', repeat: false });
    dispatch(target, 'keydown', { code: 'Escape', repeat: true }); await flush();
    expect(root.querySelector('#overlay-root').innerHTML).toContain('data-action="resume"');
    expect(mocks.audio.startMusic).not.toHaveBeenCalled();
    dispatch(target, 'keyup', { code: 'Escape' }); dispatch(target, 'keydown', { code: 'Escape', repeat: false }); await flush();
    expect(root.querySelector('#overlay-root').innerHTML).toBe(''); expect(mocks.audio.startMusic).toHaveBeenCalledTimes(1);
  });
  it.each(['blur', 'hidden', 'pause', 'settings', 'menu', 'restart', 'upgrade', 'result'])('does not restart music when delayed resume is invalidated by %s', async transition => {
    click('pause'); const unlock = deferred(); mocks.audio.unlock.mockReturnValueOnce(unlock.promise); click('resume');
    if (transition === 'blur') dispatch(target, 'blur');
    else if (transition === 'hidden') { doc.hidden = true; dispatch(doc, 'visibilitychange'); }
    else if (transition === 'upgrade' || transition === 'result') {
      const world = mocks.createRenderer.mock.calls.at(-1)![1] as GameWorld;
      if (transition === 'upgrade') world.state.pendingUpgrades = 1;
      else world.state.result = 'death';
    } else if (transition === 'restart') { click('menu'); await start(); }
    else click(transition);
    mocks.audio.startMusic.mockClear(); unlock.resolve(); await flush();
    expect(mocks.audio.startMusic).not.toHaveBeenCalled();
  });
  it('invalidates a gameplay gesture unlock after blur even if the user resumes first', async () => {
    const unlock = deferred(); mocks.audio.unlock.mockReturnValueOnce(unlock.promise);
    dispatch(target, 'keydown', { code: 'KeyW', repeat: false });
    dispatch(target, 'blur'); click('resume'); await flush(); mocks.audio.startMusic.mockClear();
    unlock.resolve(); await flush(); expect(mocks.audio.startMusic).not.toHaveBeenCalled();
  });
  it('plays a resumed session once its audio is ready', async () => {
    click('pause'); const unlock = deferred(); mocks.audio.unlock.mockReturnValueOnce(unlock.promise); click('resume');
    expect(mocks.audio.startMusic).not.toHaveBeenCalled(); unlock.resolve(); await flush();
    expect(mocks.audio.startMusic).toHaveBeenCalledTimes(1);
  });
  it.each(['blur', 'menu'])('cancels the initial audio unlock after a ready scene transitions to %s', async transition => {
    const unlock = deferred(); mocks.audio.unlock.mockReturnValueOnce(unlock.promise); click('restart');
    await vi.waitFor(() => expect(root.querySelector('#overlay-root').innerHTML).toBe(''));
    if (transition === 'blur') dispatch(target, 'blur'); else click('menu');
    unlock.resolve(); await flush(); expect(mocks.audio.startMusic).not.toHaveBeenCalled();
  });
  it('plays a settings preview while the same visible settings panel remains open', async () => {
    click('settings'); const unlock = deferred(); mocks.audio.unlock.mockReturnValueOnce(unlock.promise);
    const slider = new ElementPort(); slider.tagName = 'INPUT'; slider.type = 'range'; slider.dataset.setting = 'sound'; slider.value = '50';
    dispatch(root, 'input', { target: slider }); expect(mocks.audio.play).not.toHaveBeenCalled();
    unlock.resolve(); await flush(); expect(mocks.audio.play).toHaveBeenCalledExactlyOnceWith('select');
  });
  it.each(['blur', 'hidden', 'close', 'menu'])('cancels a delayed settings preview after %s', async transition => {
    click('settings'); const unlock = deferred(); mocks.audio.unlock.mockReturnValueOnce(unlock.promise);
    const slider = new ElementPort(); slider.tagName = 'INPUT'; slider.type = 'range'; slider.dataset.setting = 'sound'; slider.value = '50';
    dispatch(root, 'input', { target: slider });
    if (transition === 'blur') dispatch(target, 'blur');
    else if (transition === 'hidden') { doc.hidden = true; dispatch(doc, 'visibilitychange'); }
    else click(transition);
    mocks.audio.play.mockClear(); unlock.resolve(); await flush(); expect(mocks.audio.play).not.toHaveBeenCalled();
  });
});
