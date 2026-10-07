const VIEW_AREA = 1000 * 700;
/** Equal world area across orientation, using the full battle surface. */
export function viewportFor(width: number, height: number): { width: number; height: number; ratio: number } {
  const ratio = Math.max(1, width) / Math.max(1, height);
  return { width: Math.sqrt(VIEW_AREA * ratio), height: Math.sqrt(VIEW_AREA / ratio), ratio };
}
