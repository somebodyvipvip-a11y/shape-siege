import type { CharacterId, GameState } from './game/types';

export interface Settings {
  autoSkill: boolean; music: number; sound: number; quality: 'default' | 'low'; reducedMotion: boolean; shake: boolean;
}
export interface SaveData {
  schemaVersion: 1; settings: Settings; unlocked: CharacterId[];
  best: { kills: number; time: number; level: number; victories: number; bestStage: number };
  stats: { runs: number; kills: number; time: number; bestStage: number };
}
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const SAVE_KEY = 'block-battle.save';
export function defaultSave(): SaveData {
  return { schemaVersion: 1, settings: { autoSkill: false, music: .25, sound: .55, quality: 'default', reducedMotion: false, shake: true }, unlocked: ['circle'], best: { kills: 0, time: 0, level: 1, victories: 0, bestStage: 1 }, stats: { runs: 0, kills: 0, time: 0, bestStage: 1 } };
}
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const number = (value: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER): number => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(max, value) : fallback;
const bool = (value: unknown, fallback: boolean): boolean => typeof value === 'boolean' ? value : fallback;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, key === 'unlocked' && Array.isArray(item) ? [...item].sort() : canonical(item)]));
  return value;
}
/** 缺失字段按默认值补齐后再比较：纯新增字段属于版本迁移，不应误报为数据损坏。 */
function fill(value: unknown, defaults: unknown): unknown {
  // 非对象或数组不参与补齐：数组按原值保留，null/原始值原样返回以触发数据损坏告警。
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const source = value as Record<string, unknown>, base = record(defaults);
  return Object.fromEntries(Object.entries(base).map(([key, fallback]) => [key, key in source ? fill(source[key], fallback) : fallback]));
}
/** Unknown schemas are never interpreted as current data. Individual fields recover safely. */
export function validateSave(raw: unknown): SaveData {
  const data = record(raw), defaults = defaultSave();
  if (data.schemaVersion !== 1) return defaults;
  const settings = record(data.settings), best = record(data.best), stats = record(data.stats);
  const unlocked = Array.isArray(data.unlocked) ? data.unlocked : [];
  return {
    schemaVersion: 1,
    settings: { autoSkill: bool(settings.autoSkill, false), music: number(settings.music, .25, 1), sound: number(settings.sound, .55, 1), quality: settings.quality === 'low' ? 'low' : 'default', reducedMotion: bool(settings.reducedMotion, false), shake: bool(settings.shake, true) },
    unlocked: ['circle', ...(['square', 'triangle'] as const).filter(id => unlocked.includes(id))],
    best: { kills: Math.floor(number(best.kills, 0)), time: number(best.time, 0, 300), level: Math.max(1, Math.floor(number(best.level, 1))), victories: Math.floor(number(best.victories, 0)), bestStage: Math.max(1, Math.floor(number(best.bestStage, 1))) },
    stats: { runs: Math.floor(number(stats.runs, 0)), kills: Math.floor(number(stats.kills, 0)), time: number(stats.time, 0), bestStage: Math.max(1, Math.floor(number(stats.bestStage, 1))) },
  };
}
export class SaveStore {
  data = defaultSave();
  warning = '';
  constructor(private port: StoragePort | null) {
    try {
      const text = port?.getItem(SAVE_KEY);
      if (text) {
        const raw: unknown = JSON.parse(text);
        this.data = validateSave(raw);
        if (JSON.stringify(canonical(fill(raw, this.data))) !== JSON.stringify(canonical(this.data))) this.warning = '部分本地数据不完整，已恢复为安全值。';
      }
      if (!port) this.warning = '浏览器未提供本地保存，本次仍可正常游玩。';
    } catch { this.warning = '本地存档无法读取，已使用默认数据。'; }
  }
  persist(): boolean {
    try {
      if (!this.port) throw new Error('unavailable');
      this.port.setItem(SAVE_KEY, JSON.stringify(this.data));
      this.warning = '';
      return true;
    } catch { this.warning = '本地保存失败，本次进度仍保留在当前页面。'; return false; }
  }
  unlockElite(state: Pick<GameState, 'eliteKills'>): boolean {
    if (state.eliteKills > 0 && !this.data.unlocked.includes('triangle')) {
      this.data.unlocked.push('triangle'); this.persist(); return true;
    }
    return false;
  }
  finish(state: GameState): CharacterId[] {
    if (!state.result) return [];
    const newly: CharacterId[] = [];
    if (!this.data.unlocked.includes('square')) { this.data.unlocked.push('square'); newly.push('square'); }
    if (this.unlockElite(state)) newly.push('triangle');
    const { best, stats } = this.data;
    best.kills = Math.max(best.kills, state.kills); best.time = Math.max(best.time, state.time); best.level = Math.max(best.level, state.level);
    best.bestStage = Math.max(best.bestStage, state.stage); stats.bestStage = Math.max(stats.bestStage, state.stage);
    if (state.result === 'victory') best.victories++;
    stats.runs++; stats.kills += state.kills; stats.time += state.time;
    this.persist();
    return newly;
  }
}
export function browserSave(): SaveStore {
  try { return new SaveStore(window.localStorage); } catch { return new SaveStore(null); }
}
