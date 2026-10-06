import type { Input } from './game/types';

const movement: Record<string, [number, number]> = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
export function isTextInput(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return !!element && (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || element.isContentEditable);
}
export class GameInput {
  private keys = new Set<string>();
  private skill = false;
  private ultimate = false;
  private pointerId: number | null = null;
  private origin = { x: 0, y: 0 };
  private stick = { x: 0, y: 0 };
  private listeners: (() => void)[] = [];
  private enabled = false;
  private resetStick: () => void = () => {};
  constructor(private target: Window, private onPause: () => void, private onGesture: () => void = () => {}) {
    this.listen(target, 'keydown', event => {
      const e = event as KeyboardEvent;
      if (e.defaultPrevented || isTextInput(e.target) || !this.enabled) return;
      if (!(e.code in movement) && !['Space', 'KeyQ', 'Escape'].includes(e.code)) return;
      e.preventDefault(); this.onGesture();
      if (e.repeat || this.keys.has(e.code)) return;
      this.keys.add(e.code);
      if (e.code === 'Space') this.skill = true;
      if (e.code === 'KeyQ') this.ultimate = true;
      if (e.code === 'Escape') this.onPause();
    });
    this.listen(target, 'keyup', event => { this.keys.delete((event as KeyboardEvent).code); });
    this.listen(target, 'blur', () => this.clear());
    this.listen(target, 'resize', () => this.clear());
  }
  private listen(target: EventTarget, name: string, callback: EventListener): void {
    target.addEventListener(name, callback); this.listeners.push(() => target.removeEventListener(name, callback));
  }
  bind(joystick: HTMLElement, skill: HTMLButtonElement, ultimate: HTMLButtonElement): void {
    const visual = joystick.querySelector<HTMLElement>('.stick-knob');
    const reset = (): void => { if (visual) visual.style.transform = ''; joystick.classList.remove('active'); };
    this.resetStick = () => {
      if (this.pointerId !== null && joystick.hasPointerCapture(this.pointerId)) joystick.releasePointerCapture(this.pointerId);
      reset();
    };
    this.listen(joystick, 'pointerdown', event => {
      const e = event as PointerEvent;
      if (!this.enabled || this.pointerId !== null || e.button > 0) return;
      e.preventDefault(); this.onGesture(); this.pointerId = e.pointerId;
      this.origin = { x: e.clientX, y: e.clientY }; this.stick = { x: 0, y: 0 };
      joystick.setPointerCapture(e.pointerId); joystick.classList.add('active');
    });
    this.listen(joystick, 'pointermove', event => {
      const e = event as PointerEvent;
      if (e.pointerId !== this.pointerId) return;
      const dx = e.clientX - this.origin.x, dy = e.clientY - this.origin.y, length = Math.hypot(dx, dy), radius = 44;
      const scale = length > radius ? radius / length : 1;
      this.stick = { x: dx * scale / radius, y: dy * scale / radius };
      if (visual) visual.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
    });
    const cancel = (event: Event): void => {
      const e = event as PointerEvent;
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null; this.stick = { x: 0, y: 0 }; reset();
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.listen(joystick, type, cancel);
    for (const [button, action] of [[skill, 'skill'], [ultimate, 'ultimate']] as const) {
      this.listen(button, 'pointerdown', event => {
        const e = event as PointerEvent;
        if (!this.enabled || button.disabled || e.button > 0) return;
        e.preventDefault(); this.onGesture(); button.setPointerCapture(e.pointerId);
        if (action === 'skill') this.skill = true; else this.ultimate = true;
      });
      // Keyboard and assistive activation have no pointerdown.
      this.listen(button, 'click', event => {
        if ((event as MouseEvent).detail !== 0 || !this.enabled || button.disabled) return;
        this.onGesture(); if (action === 'skill') this.skill = true; else this.ultimate = true;
      });
      this.listen(button, 'pointercancel', () => { if (action === 'skill') this.skill = false; else this.ultimate = false; });
    }
    this.listeners.push(reset);
    this.listen(this.target, 'blur', reset); this.listen(this.target, 'resize', reset);
  }
  setEnabled(enabled: boolean): void { this.enabled = enabled; if (!enabled) this.clear(); }
  read(): Input {
    let x = this.stick.x, y = this.stick.y;
    if (!this.enabled) return { x: 0, y: 0, skill: false, ultimate: false };
    for (const key of this.keys) if (movement[key]) { x += movement[key][0]; y += movement[key][1]; }
    const input = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)), skill: this.skill, ultimate: this.ultimate };
    this.skill = false; this.ultimate = false;
    return input;
  }
  clear(): void { this.resetStick(); this.keys.clear(); this.skill = false; this.ultimate = false; this.pointerId = null; this.stick = { x: 0, y: 0 }; }
  destroy(): void { this.clear(); for (const dispose of this.listeners.splice(0)) dispose(); }
}
