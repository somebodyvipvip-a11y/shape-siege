const VIEW_AREA = 1000 * 700;
/** Equal world area across orientation; letterbox extreme aspect ratios. */
export function viewportFor(width: number, height: number): { width: number; height: number; ratio: number } {
  const ratio = Math.min(1.85, Math.max(.65, width / Math.max(1, height)));
  return { width: Math.sqrt(VIEW_AREA * ratio), height: Math.sqrt(VIEW_AREA / ratio), ratio };
}
