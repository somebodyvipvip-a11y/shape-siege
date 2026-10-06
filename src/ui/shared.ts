import { createElement, ArrowRight, Settings2, Keyboard, Play, Pause, RotateCcw, Home, X, LockKeyhole, Check, Trophy, Shield, Heart, Crosshair, Volume2, ChevronRight, Sparkles, CircleHelp, AlertTriangle, type IconNode } from 'lucide';
import type { CharacterId, Player, SkillId } from '../game/types';

const icons: Record<string, IconNode> = { arrow: ArrowRight, settings: Settings2, keyboard: Keyboard, play: Play, pause: Pause, reroll: RotateCcw, home: Home, close: X, lock: LockKeyhole, check: Check, trophy: Trophy, shield: Shield, heart: Heart, target: Crosshair, volume: Volume2, chevron: ChevronRight, sparkles: Sparkles, help: CircleHelp, warning: AlertTriangle };
export function icon(name: string): string { return createElement(icons[name] ?? CircleHelp, { width: 20, height: 20, 'aria-hidden': 'true', 'stroke-width': 1.8 }).outerHTML; }
export const COLORS: Record<CharacterId, string> = { circle: '#63E2C3', square: '#65B8FF', triangle: '#D0A2FF', diamond: '#FFD36A', pentagon: '#76D4C8', hexagon: '#FFA568' };
export const ROLE_TEXT: Record<CharacterId, { title: string; shape: string; subtitle: string; attack: string; active: string; ultimate: string; condition: string }> = {
  circle: { title: '星环', shape: '圆形', subtitle: '轨道控制 / 均衡', attack: '星球环绕近敌，震荡波范围清场。', active: '轨道扩张', ultimate: '引力爆炸', condition: '初始解锁' },
  square: { title: '堡垒', shape: '正方形', subtitle: '坚固护盾 / 防守', attack: '四向冲击与连锁闪电，护盾稳住阵线。', active: '护盾震退', ultimate: '守护领域', condition: '完成任意一局后解锁' },
  triangle: { title: '锋刃', shape: '三角形', subtitle: '高速穿透 / 突进', attack: '穿透飞刃与回旋刃，冲刺破阵。', active: '锋刃冲刺', ultimate: '径向刃雨', condition: '首次击杀阶段精英后解锁' },
  diamond: { title: '棱镜', shape: '菱形', subtitle: '远程射线 / 狙击', attack: '聚焦射线优先精英，命中后折射碎光。', active: '镜面跃迁', ultimate: '棱镜贯穿', condition: '初始解锁' },
  pentagon: { title: '织阵', shape: '五边形', subtitle: '陷阱布阵 / 控制', attack: '追踪符点与延时法阵，引怪入阵再引爆。', active: '阵地引爆', ultimate: '五芒封锁', condition: '初始解锁' },
  hexagon: { title: '重锤', shape: '六边形', subtitle: '近战重击 / 爆发', attack: '扇形横扫与震地裂纹，蓄力重击破阵。', active: '蓄力猛击', ultimate: '核心过载', condition: '初始解锁' },
};
export function geometry(id: CharacterId | SkillId | string, className = ''): string {
  let path = '';
  if (id === 'circle' || id === 'base-circle') path = '<circle cx="32" cy="32" r="15" fill="currentColor" fill-opacity=".13"/><circle cx="32" cy="32" r="15"/><ellipse cx="32" cy="32" rx="28" ry="22" transform="rotate(-28 32 32)" opacity=".45"/><circle cx="54" cy="17" r="4" fill="currentColor"/>';
  else if (id === 'square' || id === 'base-square') path = '<rect x="15" y="15" width="34" height="34" rx="3" fill="currentColor" fill-opacity=".13"/><rect x="21" y="21" width="22" height="22" opacity=".5"/><path d="M32 5v5m0 44v5M5 32h5m44 0h5"/>';
  else if (id === 'triangle' || id === 'base-triangle') path = '<path d="M32 10 54 50H10Z" fill="currentColor" fill-opacity=".13"/><path d="m32 21 12 23H20Z" opacity=".5"/><path d="m8 17 5-5m38 0 5 5"/>';
  else if (id === 'diamond' || id === 'base-diamond' || id === 'refraction') path = '<path d="M32 6 51 32 32 58 13 32Z" fill="currentColor" fill-opacity=".13"/><path d="M32 6v52M13 32h38m-18-7 21-9m-21 23 21 9" opacity=".6"/>';
  else if (id === 'pentagon' || id === 'base-pentagon' || id === 'sigil') path = '<path d="m32 7 25 18-10 29H17L7 25Z" fill="currentColor" fill-opacity=".13"/><path d="m32 7 15 47L7 25h50L17 54Z" opacity=".5"/>';
  else if (id === 'hexagon' || id === 'base-hexagon' || id === 'fissure') path = '<path d="m32 6 23 13v26L32 58 9 45V19Z" fill="currentColor" fill-opacity=".25"/><path d="M24 18h16v12H24Zm8 12v18" stroke-width="4"/>';
  else if (id === 'lightning' || id.includes('lightning')) path = '<path d="m36 6-20 29h15l-4 23 22-31H34Z" fill="currentColor" fill-opacity=".15"/>';
  else if (id === 'boomerang') path = '<path d="m11 36 21-25 21 25-21-13Z"/><path d="M15 47q17 14 34-2" opacity=".5"/>';
  else if (id === 'mine') path = '<path d="m32 7 22 13v24L32 57 10 44V20Z"/><circle cx="32" cy="32" r="11"/><path d="M32 26v12m-6-6h12"/>';
  else if (id === 'meteor') path = '<path d="m29 32 12-21m-3 27L54 9m-33 20 8-16" opacity=".5"/><path d="m24 31 12 8 2 13-13 6-14-10 2-13Z" fill="currentColor" fill-opacity=".15"/>';
  else if (id === 'homing') path = '<circle cx="32" cy="32" r="19" stroke-dasharray="7 6"/><path d="m21 42 22-20-7 21-6-8Z" fill="currentColor" fill-opacity=".15"/>';
  else if (id === 'shockwave' || id === 'active' || id === 'ultimate') path = '<circle cx="32" cy="32" r="23" opacity=".4"/><circle cx="32" cy="32" r="15" opacity=".7"/><path d="m32 24 8 8-8 8-8-8Z" fill="currentColor"/>';
  else path = '<path d="m32 9 23 14v19L32 56 9 42V23Z"/><path d="M32 22v20m-10-10h20"/>';
  return `<svg class="geo-icon ${className}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}
export function timeLabel(time: number): string { const value = Math.floor(time); return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`; }
export function attributeRows(player: Player): { label: string; value: string }[] {
  const percent = (value: number): string => `${Math.round(value * 100)}%`;
  return [
    { label: '移动速度', value: `${Math.round(player.speed)}${player.speedBonus > 0 ? ` +${percent(player.speedBonus)}` : ''}` },
    { label: '伤害加成', value: `+${percent(player.damageBonus)}` },
    { label: '冷却缩减', value: percent(player.cooldownReduction) },
    { label: '拾取范围', value: `${Math.round(player.pickupRadius)}` },
    { label: '暴击率', value: percent(player.critChance) },
    { label: '暴击伤害', value: `${player.critMultiplier.toFixed(1)}×` },
    { label: '闪避', value: percent(player.dodge) },
    { label: '护甲', value: `${Math.round(player.armor)}` },
    { label: '幸运', value: `${Math.round(player.luck)}` },
  ];
}
export function lifeRow(player: Player): { label: string; value: string } {
  return { label: '生命', value: `${Math.ceil(player.hp)} / ${Math.round(player.maxHp)}` };
}
/** 常驻 HUD 精简 5 项：生命、暴击率、闪避、护甲、幸运；完整属性见 Tab 属性面板。 */
export function hudRows(player: Player): { label: string; value: string }[] {
  const percent = (value: number): string => `${Math.round(value * 100)}%`;
  return [lifeRow(player), { label: '暴击率', value: percent(player.critChance) }, { label: '闪避', value: percent(player.dodge) }, { label: '护甲', value: `${Math.round(player.armor)}` }, { label: '幸运', value: `${Math.round(player.luck)}` }];
}
export function escapeHTML(text: string): string { return text.replace(/[&<>"']/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[value]!); }
