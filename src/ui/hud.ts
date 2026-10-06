import { CHARACTERS, ELEMENT_NAMES, SKILLS } from '../game/config';
import type { GameState } from '../game/types';
import { COLORS, ROLE_TEXT, escapeHTML, geometry, hudRows, icon, timeLabel } from './shared';

export function hudHTML(): string {
  return `<div class="battle-hud"><div class="movement-zone" id="joystick" aria-label="浮动移动区域"><div class="joystick" aria-hidden="true"><span class="stick-ring"></span><span class="stick-knob"></span></div></div><div class="hud-top"><div class="vital-panel"><div class="vital-label">${icon('heart')}<span>生命</span><b id="hp-value"></b></div><div class="meter hp-meter"><i id="hp-bar"></i></div><div class="shield-label">${icon('shield')}<span id="shield-value">护盾 0</span></div></div><div class="time-panel"><strong id="battle-time">00:00</strong><span id="battle-phase">初始围攻</span></div><div class="hud-right"><div class="hud-summary"><b id="stage-value" class="stage-badge">第 1 关</b><b class="lives-badge" title="剩余命数">${icon('heart')}<span id="lives-value">× 3</span></b><span id="kills-value">0 击杀</span></div><div class="hud-actions"><button class="icon-button stats-button" data-action="stats" title="查看属性（Tab）" aria-label="查看当前属性">属性</button><button class="icon-button" data-action="pause" aria-label="暂停游戏">${icon('pause')}</button></div></div></div><div class="xp-panel"><b id="level-value">LV. 1</b><div class="meter xp-meter"><i id="xp-bar"></i></div><span id="xp-value">0 / 10</span></div><div id="stat-strip" class="stat-strip"></div><div class="battle-messages"><div id="boss-panel" class="boss-panel" hidden><span>最终首领 · 六边核心 <b id="boss-value"></b></span><div class="meter boss-meter"><i id="boss-bar"></i></div></div><div id="battle-warning" class="battle-warning" hidden></div><div id="event-panel" class="event-panel" hidden></div></div><div id="revive-banner" class="revive-banner" hidden><span>复活中</span><b id="revive-value">3</b></div><div id="skill-slots" class="skill-slots"></div><div class="touch-controls"><div class="ability-controls"><button id="skill-button" class="ability-button skill-button" aria-label="释放普通技能"><span class="ability-symbol">${geometry('active')}</span><b id="skill-name">普通技能</b><span id="skill-status">空格</span></button><button id="ultimate-button" class="ability-button ultimate-button" aria-label="释放大招"><span class="ability-symbol">${geometry('ultimate')}</span><b id="ultimate-name">大招</b><span id="ultimate-status">0 / 100 · Q</span></button></div></div></div>`;
}
export class HUD {
  private slotKey = '';
  private statKey = '';
  constructor(private root: HTMLElement) {}
  private text(id: string, value: string): void { const element = this.root.querySelector<HTMLElement>(`#${id}`)!; if (element.textContent !== value) element.textContent = value; }
  private meter(id: string, ratio: number): void { this.root.querySelector<HTMLElement>(`#${id}`)!.style.transform = `scaleX(${Math.max(0, Math.min(1, ratio))})`; }
  update(state: GameState): void {
    const p = state.player, role = ROLE_TEXT[p.characterId];
    this.root.style.setProperty('--role-color', COLORS[p.characterId]); this.root.style.setProperty('--skill-count', String(state.slots));
    this.text('hp-value', `${Math.ceil(p.hp)} / ${p.maxHp}`); this.meter('hp-bar', p.hp / p.maxHp);
    this.text('shield-value', `护盾 ${Math.ceil(p.shield)}`); this.text('battle-time', timeLabel(state.time)); this.text('battle-phase', state.phase);
    this.text('kills-value', `${state.kills} 击杀`); this.text('stage-value', `第 ${state.stage} 关`); this.text('lives-value', `× ${state.lives}`); this.text('level-value', `LV. ${state.level}`); this.text('xp-value', `${Math.floor(state.xp)} / ${state.xpRequired}`); this.meter('xp-bar', state.xp / state.xpRequired);
    const attributes = hudRows(p), statKey = attributes.map(attribute => attribute.value).join('|');
    if (statKey !== this.statKey) {
      this.statKey = statKey;
      this.root.querySelector('#stat-strip')!.innerHTML = attributes.map(attribute => `<span><small>${attribute.label}</small><b>${attribute.value}</b></span>`).join('');
    }
    const boss = state.enemies.find(enemy => enemy.kind === 'boss');
    this.root.querySelector<HTMLElement>('#boss-panel')!.hidden = !boss;
    if (boss) { this.text('boss-value', `${Math.ceil(boss.hp)} / ${boss.maxHp}`); this.meter('boss-bar', boss.hp / boss.maxHp); }
    const warning = this.root.querySelector<HTMLElement>('#battle-warning')!; warning.hidden = !state.warning; if (state.warning) warning.textContent = state.warning;
    const reviving = state.reviveTimer > 0;
    this.root.querySelector<HTMLElement>('#revive-banner')!.hidden = !reviving;
    if (reviving) this.text('revive-value', `${Math.ceil(state.reviveTimer)}`);
    const event = this.root.querySelector<HTMLElement>('#event-panel')!; event.hidden = !state.event;
    if (state.event) {
      const e = state.event, distance = Math.hypot(e.x - p.x, e.y - p.y), degrees = Math.atan2(e.y - p.y, e.x - p.x) * 180 / Math.PI;
      const progress = e.kind === 'charge' ? `充能 ${Math.floor(e.progress)} / 20 秒` : '击败标记精英';
      event.innerHTML = `<span class="event-arrow" style="transform:rotate(${degrees}deg)">${icon('arrow')}</span><div><b>${e.kind === 'charge' ? '能量节点' : '精英试炼'}</b><small>${distance < 180 ? progress : `距离 ${Math.round(distance)} · ${progress}`} · 剩余 ${Math.ceil(e.remaining)} 秒</small></div>`;
    }
    const slotKey = JSON.stringify([state.slots, p.skills.map(skill => [skill.id, skill.level, skill.elements, skill.enhanced])]);
    if (slotKey !== this.slotKey) {
      this.slotKey = slotKey;
      this.root.querySelector('#skill-slots')!.innerHTML = p.skills.map(skill => `<div class="skill-slot" title="${escapeHTML(SKILLS[skill.id].name)} · ${skill.level} 级${skill.enhanced ? ' · 行为强化' : ''}">${geometry(skill.id)}<span>${SKILLS[skill.id].name}</span><b>${skill.level}</b><small>${skill.elements.map(element => ELEMENT_NAMES[element]).join('＋')}</small></div>`).join('') + Array.from({ length: Math.max(0, state.slots - p.skills.length) }, () => '<div class="skill-slot empty"><span>待构筑</span></div>').join('');
    }
    const skill = this.root.querySelector<HTMLButtonElement>('#skill-button')!, ultimate = this.root.querySelector<HTMLButtonElement>('#ultimate-button')!;
    const inactive = state.paused || state.pendingUpgrades > 0 || state.reviveTimer > 0 || !!state.result;
    skill.disabled = inactive || p.skillCooldown > 0; ultimate.disabled = inactive || p.energy < 100;
    skill.classList.toggle('ready', !skill.disabled); ultimate.classList.toggle('ready', !ultimate.disabled);
    this.text('skill-name', role.active); this.text('ultimate-name', role.ultimate);
    this.text('skill-status', p.skillCooldown > 0 ? `${p.skillCooldown.toFixed(1)} 秒` : `${state.autoSkill ? '自动 / ' : ''}就绪 · 空格`);
    this.text('ultimate-status', p.energy >= 100 ? '就绪 · Q' : `${Math.floor(p.energy)} / 100 · Q`);
    skill.style.setProperty('--charge', `${100 * (1 - p.skillCooldown / (CHARACTERS[p.characterId].skillCooldown * (1 - p.cooldownReduction)))}%`);
    ultimate.style.setProperty('--charge', `${p.energy}%`);
  }
}
