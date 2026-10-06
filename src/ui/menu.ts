import { CHARACTERS } from '../game/config';
import type { CharacterId } from '../game/types';
import type { SaveData } from '../storage';
import { COLORS, ROLE_TEXT, geometry, icon, timeLabel } from './shared';

export function menuHTML(selected: CharacterId, save: SaveData, version: string): string {
  const role = ROLE_TEXT[selected];
  return `<main class="menu-screen">
    <header class="menu-header"><a class="brand" href="#" aria-label="方块大战首页"><span class="brand-mark"><i></i><i></i><i></i></span><span>方块大战<small>BLOCK BATTLE</small></span></a><nav><button class="quiet-button" data-action="help">${icon('keyboard')}<span>操作说明</span></button><button class="icon-button" data-action="settings" aria-label="打开设置">${icon('settings')}</button></nav></header>
    <section class="hero-layout">
      <div class="hero-copy"><div class="eyebrow"><span class="status-dot"></span> 几何竞技场 · 单人生存</div><h1>以几何之力，<br>突破<span>重重包围。</span></h1><p class="hero-description">移动，生存，进化。<br>在不断涌来的怪潮中，构筑属于你的战斗轨道。</p><div class="hero-tags"><span>自动攻击</span><span>随机构筑</span><span>12 分钟挑战</span></div>
      <div class="best-score"><span class="score-icon">${icon('trophy')}</span><div><small>本地最好成绩</small><strong>${save.best.kills}<span> 击杀</span></strong></div><div class="best-divider"></div><div><small>最长存活</small><strong>${timeLabel(save.best.time)}</strong></div></div></div>
      <div class="hero-art" style="--role-color:${COLORS[selected]}" aria-hidden="true"><div class="art-grid"></div><div class="orbit orbit-outer"></div><div class="orbit orbit-mid"></div><div class="orbit orbit-inner"></div><span class="art-cross cross-a">+</span><span class="art-cross cross-b">+</span><div class="hero-body">${geometry(selected)}</div><div class="satellite satellite-a"></div><div class="satellite satellite-b"></div><div class="satellite satellite-c"></div><div class="enemy-fragment fragment-a"></div><div class="enemy-fragment fragment-b"></div><div class="art-label"><span>PLAYER / ${selected.toUpperCase()}</span><b>${role.title}</b><small>核心在线 · 等待进入战场</small></div><div class="coordinate">X 1600 &nbsp; Y 1600</div></div>
    </section>
    <section class="selection-section"><div class="section-heading"><div><span class="eyebrow">CHOOSE YOUR GEOMETRY</span><h2>选择你的几何形态</h2></div><span class="selection-caption">不同形态，相同生存法则</span></div>
      <div class="role-grid">${(['circle', 'square', 'triangle'] as const).map((id, index) => {
        const data = ROLE_TEXT[id], unlocked = save.unlocked.includes(id), active = selected === id, config = CHARACTERS[id];
        return `<button class="role-card ${active ? 'selected' : ''} ${unlocked ? '' : 'locked'}" style="--role-color:${COLORS[id]}" data-character="${id}" aria-pressed="${active}" ${unlocked ? '' : 'disabled'}><span class="role-topline"><span>0${index + 1} / ${id.toUpperCase()}</span><span>${active ? icon('check') : unlocked ? icon('chevron') : icon('lock')}</span></span><div class="role-main">${geometry(id)}<div><h3>${data.title}<span>${id === 'circle' ? '圆形' : id === 'square' ? '正方形' : '三角形'}</span></h3><small>${data.subtitle}</small></div></div><p>${data.attack}</p><div class="role-stats"><span>${icon('heart')} ${config.hp} 生命</span><span>${icon('target')} ${config.speed} 移速</span></div><div class="role-skills"><span>主动 <b>${data.active}</b></span><span>大招 <b>${data.ultimate}</b></span></div><span class="role-footer">${unlocked ? active ? '已选择 · 准备出战' : '选择此形态' : data.condition}</span></button>`;
      }).join('')}</div>
    </section>
    <div class="start-row"><p>${icon('help')} 自动攻击敌人，移动拾取经验，升级时选择强化。</p><button class="primary-button start-button" data-action="start">进入竞技场 ${icon('arrow')}</button></div>
    <footer class="menu-footer"><span>原创几何生存游戏</span><span>本地游玩 · 无需登录 <i></i> v${version}</span></footer>
  </main>`;
}
