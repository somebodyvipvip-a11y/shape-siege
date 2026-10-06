import changelog from '../../CHANGELOG.md?raw';
import { escapeHTML, icon } from './shared';

interface ReleaseNote { version: string; date: string; changes: string[] }
/** 只读取版本标题与顶层项目，不执行 Markdown/HTML。 */
export function readReleaseNotes(markdown: string): ReleaseNote[] {
  const entries: ReleaseNote[] = [];
  let current: ReleaseNote | undefined;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^## (\d+\.\d+\.\d+) - (\d{4}-\d{2}-\d{2})\s*$/.exec(line);
    if (heading) { current = { version: heading[1], date: heading[2], changes: [] }; entries.push(current); }
    else if (current && line.startsWith('- ')) current.changes.push(line.slice(2).replace(/`/g, ''));
  }
  return entries;
}
export function releaseNotesHTML(version: string): string {
  const entries = readReleaseNotes(changelog).slice(0, 2);
  return `<div class="overlay-backdrop"><section class="dialog release-dialog" role="dialog" aria-modal="true" aria-label="版本更新公告" tabindex="-1"><div class="dialog-heading"><span class="eyebrow">WHAT'S NEW</span><button class="icon-button" data-action="close" aria-label="关闭更新公告">${icon('close')}</button></div><h2>版本更新公告 <small>v${escapeHTML(version)}</small></h2><p>看看这次有哪些变化。每个版本只自动提醒一次。</p><div class="release-notes">${entries.map(entry => `<section><h3>v${escapeHTML(entry.version)} <small>${escapeHTML(entry.date)}</small></h3><ul>${entry.changes.map(change => `<li>${escapeHTML(change)}</li>`).join('')}</ul></section>`).join('')}</div><button class="primary-button" data-action="close">知道了 ${icon('check')}</button></section></div>`;
}
