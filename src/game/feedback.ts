import type { CombatFeedback, Enemy, GameState } from './types';

export const FEEDBACK_LIMIT = 64;
export const DAMAGE_LIMIT = 24;

export function addFeedback(state: GameState, data: Omit<CombatFeedback, 'life'>): void {
  // Reserve eight slots for deaths so a burst of hits cannot hide every kill.
  if (state.feedback.length >= FEEDBACK_LIMIT - (data.kind === 'death' ? 0 : 8)) return;
  state.feedback.push({ ...data, life: data.duration });
}

export function hitFeedback(state: GameState, enemy: Enemy, amount: number, critical: boolean): void {
  // Merge short bursts without extending their lifetime: burns cannot keep a label alive forever.
  const label = state.feedback.find(f => f.kind === 'damage' && f.targetId === enemy.id && f.duration - f.life < .18);
  if (label) { label.amount = (label.amount ?? 0) + amount; label.critical ||= critical; }
  else if (state.feedback.filter(f => f.kind === 'damage').length < DAMAGE_LIMIT)
    addFeedback(state, { kind: 'damage', x: enemy.x, y: enemy.y - enemy.radius - 12, radius: 36,
      duration: .55, targetId: enemy.id, amount, critical });
  if (state.time - (enemy.feedbackAt ?? -Infinity) >= .12) {
    enemy.feedbackAt = state.time;
    addFeedback(state, { kind: 'hit', x: enemy.x, y: enemy.y, radius: enemy.radius, duration: .12, targetId: enemy.id, critical });
  }
}

export function updateFeedback(state: GameState, dt: number): void {
  let write = 0;
  for (const effect of state.feedback) {
    effect.life -= dt;
    if (effect.life > 0) state.feedback[write++] = effect;
  }
  state.feedback.length = write;
}
