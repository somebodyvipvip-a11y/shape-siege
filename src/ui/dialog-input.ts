/** Consume before gameplay, even when continuing enables that listener. */
export function handleDialogEscape(event: KeyboardEvent, panel: string, resume: () => void, close: () => void): boolean {
  if (event.code !== 'Escape') return false;
  event.preventDefault();
  if (event.repeat) return true;
  if (panel === 'pause') resume();
  else if (['settings', 'help', 'leave'].includes(panel)) close();
  return true;
}
