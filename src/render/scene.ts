import Phaser from 'phaser';
import type { GameWorld } from '../game/world';
import type { Settings } from '../storage';
import { drawWorld } from './geometry';
import { viewportFor } from './viewport';

export interface BattleRenderer { destroy(): void; shake(): void; resize(): void }
export function createBattleRenderer(host: HTMLElement, world: GameWorld, settings: () => Settings, frame: (dt: number) => void): Promise<BattleRenderer> {
  return new Promise((resolve, reject) => {
    let disposed = false, ready = false;
    let observer: ResizeObserver | null = null;
    let game: Phaser.Game | undefined;
    let scene: BattleScene;
    const timeout = setTimeout(() => { if (!ready) { destroy(); reject(new Error('画布初始化超时。请检查浏览器是否支持 Canvas / WebGL。')); } }, 12000);
    class BattleScene extends Phaser.Scene {
      private geometry!: Phaser.GameObjects.Graphics;
      private danger!: Phaser.GameObjects.Graphics;
      create(): void {
        if (disposed) return;
        scene = this; this.geometry = this.add.graphics(); this.danger = this.add.graphics();
        ready = true; clearTimeout(timeout); resize();
        observer = new ResizeObserver(resize); observer.observe(host);
        // The app already cleared input on resize; resize never replaces the world.
        resolve({ destroy, resize, shake: () => { const config = settings(); if (config.shake && !config.reducedMotion) this.cameras.main.shake(90, .0025); } });
      }
      layout(width: number, height: number): void {
        // Camera size uses backing pixels; the visible world uses CSS pixels so quality/DPR never change scale.
        const view = viewportFor(host.clientWidth, host.clientHeight);
        const camera = this.cameras.main;
        camera.setViewport(0, 0, width, height);
        camera.setZoom(width / view.width); world.setViewport(view.width, view.height);
      }
      update(_time: number, delta: number): void {
        if (disposed || !ready) return;
        frame(delta / 1000);
        const p = world.state.player;
        this.cameras.main.centerOn(p.x, p.y);
        drawWorld(this.geometry, this.danger, world.state, settings());
      }
    }
    function resize(): void {
      if (disposed || !ready) return;
      const ratio = settings().quality === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.round(host.clientWidth * ratio)), height = Math.max(1, Math.round(host.clientHeight * ratio));
      if (!game) return;
      game.scale.resize(width, height); game.canvas.style.width = '100%'; game.canvas.style.height = '100%';
      scene.layout(width, height);
    }
    function destroy(): void { if (disposed) return; disposed = true; clearTimeout(timeout); observer?.disconnect(); game?.destroy(true); }
    try {
      game = new Phaser.Game({ type: Phaser.AUTO, parent: host, width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight), backgroundColor: '#0B1020', scene: BattleScene, banner: false, autoFocus: false, input: false, audio: { noAudio: true }, fps: { target: 60 }, antialias: true, render: { powerPreference: 'default' } });
    } catch { destroy(); reject(new Error('浏览器无法创建游戏画布，请更新浏览器后重试。')); return; }
    game.canvas?.addEventListener('webglcontextlost', event => { event.preventDefault(); world.setPaused(true); frame(0); }, { once: true });
    game.events.once('destroy', () => { observer?.disconnect(); clearTimeout(timeout); });
  });
}
