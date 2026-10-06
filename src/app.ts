import { GameWorld } from './game/world';
import type { CharacterId } from './game/types';
import { GameInput } from './input';
import { GameAudio } from './audio';
import { browserSave, type Settings } from './storage';
import type { BattleRenderer } from './render/scene';
import { menuHTML } from './ui/menu';
import { HUD, hudHTML } from './ui/hud';
import { confirmLeaveHTML, helpHTML, loadingHTML, pauseHTML, resultHTML, settingsHTML, upgradeHTML } from './ui/overlays';
import { escapeHTML, icon } from './ui/shared';
import { handleDialogEscape } from './ui/dialog-input';

type Panel = 'none' | 'pause' | 'upgrade' | 'result' | 'settings' | 'help' | 'leave' | 'loading' | 'error';
export class GameApp {
  private save = browserSave();
  private audio = new GameAudio(this.save.data.settings);
  private selected: CharacterId = 'circle';
  private world: GameWorld | null = null;
  private renderer: BattleRenderer | null = null;
  private input: GameInput | null = null;
  private hud: HUD | null = null;
  private overlay!: HTMLElement;
  private panel: Panel = 'none';
  private panelSignature = '';
  private running = false;
  private starting = false;
  private generation = 0;
  private hudElapsed = 0;
  private seenHelp = false;
  private resultSaved = false;
  private newly: CharacterId[] = [];
  private rewards: boolean[] = [];
  private lastFocus: HTMLElement | null = null;
  constructor(private root: HTMLElement, private version: string) {
    root.addEventListener('click', event => this.click(event));
    root.addEventListener('input', event => this.setting(event));
    root.addEventListener('change', event => this.setting(event));
    window.addEventListener('blur', () => this.backgroundPause());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.backgroundPause(); });
    window.addEventListener('keydown', event => this.dialogKey(event));
    window.addEventListener('pagehide', () => { this.backgroundPause(); });
    window.addEventListener('resize', () => this.input?.clear());
    this.applySettings(); this.showMenu();
  }
  private showMenu(): void {
    this.generation++; this.starting = false; this.running = false;
    this.input?.destroy(); this.input = null; this.renderer?.destroy(); this.renderer = null; this.world = null; this.hud = null;
    this.audio.stop(); this.panel = 'none'; this.panelSignature = ''; this.resultSaved = false;
    document.body.classList.remove('in-battle');
    this.root.innerHTML = `<div id="screen">${menuHTML(this.selected, this.save.data, this.version)}</div><div id="overlay-root"></div><div id="notice-root" aria-live="polite"></div>`;
    this.overlay = this.root.querySelector('#overlay-root')!; this.notice(this.save.warning);
  }
  private notice(message: string): void {
    const root = this.root.querySelector('#notice-root');
    if (root) root.innerHTML = message ? `<div class="save-notice">${icon('warning')}<span>${escapeHTML(message)}</span><button data-action="dismiss-notice" class="icon-button" aria-label="关闭保存提示">${icon('close')}</button></div>` : '';
  }
  private async start(skipHelp = false): Promise<void> {
    if (this.starting) return;
    if (!skipHelp && !this.seenHelp && this.save.data.stats.runs === 0) { this.setPanel('help', helpHTML(false)); return; }
    this.seenHelp = true;
    this.renderer?.destroy(); this.input?.destroy(); this.audio.stop();
    const generation = ++this.generation;
    this.starting = true; this.running = false; this.resultSaved = false; this.newly = []; this.rewards = []; this.hudElapsed = 0;
    document.body.classList.add('in-battle');
    this.root.innerHTML = `<div class="battle-screen"><div id="battle-canvas" class="battle-canvas" role="img" aria-label="几何竞技场战斗画面"></div><div id="hud-root">${hudHTML()}</div></div><div id="overlay-root"></div><div id="notice-root" aria-live="polite"></div>`;
    this.overlay = this.root.querySelector('#overlay-root')!;
    this.setPanel('loading', loadingHTML());
    const world = new GameWorld(this.selected, crypto.getRandomValues(new Uint32Array(1))[0]);
    this.world = world; world.setAutoSkill(this.save.data.settings.autoSkill);
    this.hud = new HUD(this.root.querySelector('#hud-root')!); this.hud.update(world.state);
    this.input = new GameInput(window, () => this.pause(), () => { void this.audio.unlock().then(() => { if (this.running && this.panel === 'none') this.audio.startMusic(); }); });
    this.input.bind(this.root.querySelector('#joystick')!, this.root.querySelector('#skill-button')!, this.root.querySelector('#ultimate-button')!);
    void this.audio.unlock();
    try {
      const { createBattleRenderer } = await import('./render/scene');
      if (generation !== this.generation) return;
      const renderer = await createBattleRenderer(this.root.querySelector('#battle-canvas')!, world, () => this.save.data.settings, dt => this.frame(dt));
      if (generation !== this.generation) { renderer.destroy(); return; }
      this.renderer = renderer; this.starting = false; this.running = true;
      if (document.hidden || world.state.paused) { world.setPaused(true); this.setPanel('pause', pauseHTML()); }
      else { this.setPanel('none'); this.audio.startMusic(); }
      this.notice(this.save.warning);
    } catch (error) {
      if (generation !== this.generation) return;
      this.starting = false; this.running = false; this.input?.destroy(); this.input = null;
      this.setPanel('error', loadingHTML(`战场资源加载失败：${error instanceof Error ? error.message : '未知加载错误，请重试。'}`));
    }
  }
  private frame(dt: number): void {
    const world = this.world;
    if (!world || !this.running) return;
    const state = world.state, hp = state.player.hp, kills = state.kills, level = state.level, pending = state.pendingUpgrades;
    const cooldown = state.player.skillCooldown, energy = state.player.energy;
    world.update(dt, this.input?.read());
    if (state.player.hp < hp) { this.audio.play('hurt'); this.renderer?.shake(); }
    else if (state.kills > kills) this.audio.play('kill');
    if (state.player.skillCooldown > cooldown) this.audio.play('skill');
    if (state.player.energy < energy - 30) this.audio.play('ultimate');
    if (state.pendingUpgrades > pending) {
      const levels = state.level - level, additions = state.pendingUpgrades - pending;
      for (let index = 0; index < additions; index++) this.rewards.push(index < additions - levels);
    }
    if (this.save.unlockElite(state)) { this.newly.push('triangle'); this.notice('三角形·锋刃已解锁，结算后可选择。'); }
    this.hudElapsed += dt;
    if (this.hudElapsed >= .1) { this.hudElapsed = 0; this.hud?.update(state); }
    if (state.result) {
      if (!this.resultSaved) { this.resultSaved = true; this.newly.push(...this.save.finish(state)); this.audio.stop(); this.notice(this.save.warning); this.hud?.update(state); }
      if (this.panel !== 'result') { this.setPanel('result', resultHTML(state, this.newly)); this.audio.play('result'); }
      return;
    }
    if (state.pendingUpgrades > 0 && !['settings', 'help'].includes(this.panel)) {
      const signature = `${state.pendingUpgrades}/${state.rerolls}/${state.choices.map(choice => choice.id).join('|')}`;
      if (this.panel !== 'upgrade' || signature !== this.panelSignature) { const first = this.panel !== 'upgrade'; this.setPanel('upgrade', upgradeHTML(state, this.rewards[0] ?? false)); this.panelSignature = signature; if (first) this.audio.play('upgrade'); }
    } else if (this.panel === 'none' && state.paused) this.setPanel('pause', pauseHTML());
  }
  private setPanel(panel: Panel, html = ''): void {
    if (this.panel === 'none' && panel !== 'none') this.lastFocus = document.activeElement as HTMLElement;
    this.panel = panel; this.overlay.innerHTML = html;
    const interactive = this.running && panel === 'none' && !this.world?.state.paused;
    this.input?.setEnabled(interactive);
    this.root.querySelector<HTMLElement>('.battle-screen, .menu-screen')?.setAttribute('inert', '');
    if (panel === 'none') {
      this.root.querySelector<HTMLElement>('.battle-screen, .menu-screen')?.removeAttribute('inert');
      if (this.lastFocus?.isConnected) this.lastFocus.focus({ preventScroll: true });
    } else {
      this.overlay.querySelector<HTMLElement>('[role="dialog"]')?.focus({ preventScroll: true });
      this.audio.stop();
    }
    this.hud?.update(this.world!.state);
  }
  private pause(): void {
    if (!this.world || this.world.state.result || this.starting) return;
    const state = this.world.state;
    if (state.pendingUpgrades > 0) {
      this.world.setPaused(true);
      this.setPanel('upgrade', upgradeHTML(state, this.rewards[0] ?? false)); return;
    }
    if (this.panel === 'pause') this.resume();
    else { this.world.setPaused(true); this.setPanel('pause', pauseHTML()); }
  }
  private resume(): void {
    if (!this.world || this.world.state.result) return;
    if (this.world.state.pendingUpgrades > 0) { this.setPanel('upgrade', upgradeHTML(this.world.state, this.rewards[0] ?? false)); return; }
    this.world.setPaused(false); this.setPanel('none'); void this.audio.unlock().then(() => this.audio.startMusic());
  }
  private backgroundPause(): void {
    this.input?.clear(); this.audio.stop();
    if (!this.world || this.world.state.result) return;
    this.world.setPaused(true);
    if (this.running && this.panel === 'none') this.setPanel('pause', pauseHTML());
  }
  private closePanel(): void {
    if (this.world) {
      if (this.world.state.pendingUpgrades > 0) this.setPanel('upgrade', upgradeHTML(this.world.state, this.rewards[0] ?? false));
      else this.setPanel('pause', pauseHTML());
    } else this.setPanel('none');
  }
  private click(event: MouseEvent): void {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    const character = button.dataset.character as CharacterId | undefined;
    if (character && this.save.data.unlocked.includes(character)) { this.selected = character; this.audio.play('select'); this.showMenu(); return; }
    const choice = button.dataset.choice;
    if (choice && this.world && this.panel === 'upgrade') {
      const signature = this.panelSignature;
      if (!this.world.chooseUpgrade(choice)) return;
      this.rewards.shift(); this.audio.play('select');
      this.panelSignature = '';
      // Replace immediately; a queued click can only target a detached card.
      if (this.world.state.pendingUpgrades) { this.setPanel('upgrade', upgradeHTML(this.world.state, this.rewards[0] ?? false)); this.panelSignature = signature === '' ? '' : 'refresh'; }
      else if (this.world.state.paused) this.setPanel('pause', pauseHTML());
      else { this.setPanel('none'); this.audio.startMusic(); }
      return;
    }
    switch (button.dataset.action) {
      case 'start': void this.start(); break;
      case 'start-help': case 'restart': case 'retry': void this.start(true); break;
      case 'pause': this.pause(); break;
      case 'resume': this.resume(); break;
      case 'menu': this.showMenu(); break;
      case 'leave': this.setPanel('leave', confirmLeaveHTML()); break;
      case 'settings': case 'help': {
        this.world?.setPaused(true);
        const settings = button.dataset.action === 'settings';
        this.setPanel(settings ? 'settings' : 'help', settings ? settingsHTML(this.save.data.settings) : helpHTML(!!this.world)); break;
      }
      case 'close': this.closePanel(); break;
      case 'reroll': if (this.world?.reroll()) { this.audio.play('select'); this.panelSignature = ''; this.setPanel('upgrade', upgradeHTML(this.world.state, this.rewards[0] ?? false)); } break;
      case 'dismiss-notice': this.notice(''); break;
    }
  }
  private setting(event: Event): void {
    const control = event.target as HTMLInputElement | HTMLSelectElement, key = control.dataset.setting as keyof Settings | undefined;
    if (!key) return;
    // A range emits input; checkbox/select emit change. Do not save each event twice.
    if (event.type === 'input' && !(control instanceof HTMLInputElement && control.type === 'range')) return;
    if (event.type === 'change' && control instanceof HTMLInputElement && control.type === 'range') return;
    const settings = this.save.data.settings;
    if (key === 'music' || key === 'sound') { settings[key] = Number(control.value) / 100; const output = this.root.querySelector(`#${key}-output`); if (output) output.textContent = `${control.value}%`; }
    else if (key === 'quality') settings.quality = control.value === 'low' ? 'low' : 'default';
    else settings[key] = (control as HTMLInputElement).checked;
    this.world?.setAutoSkill(settings.autoSkill); this.applySettings(); this.renderer?.resize(); this.save.persist(); this.notice(this.save.warning);
    if (key === 'sound') { void this.audio.unlock().then(() => this.audio.play('select')); }
  }
  private applySettings(): void { this.audio.configure(this.save.data.settings); document.documentElement.classList.toggle('reduced-motion', this.save.data.settings.reducedMotion); }
  private dialogKey(event: KeyboardEvent): void {
    if (this.panel === 'none' || this.panel === 'loading' || this.panel === 'error') return;
    handleDialogEscape(event, this.panel, () => this.resume(), () => this.closePanel());
    if (event.key !== 'Tab') return;
    const items = Array.from(this.overlay.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]'));
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !items.includes(document.activeElement as HTMLElement))) { event.preventDefault(); first.focus(); }
  }
}
