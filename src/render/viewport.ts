const MIN_VIEW_AREA = 1000 * 700;
/** CSS dimensions: keep the mobile view, expand large surfaces instead of magnifying geometry. */
export function viewportFor(width: number, height: number): { width: number; height: number; ratio: number } {
  const safeWidth = Math.max(1, width), safeHeight = Math.max(1, height);
  const ratio = safeWidth / safeHeight, area = Math.max(MIN_VIEW_AREA, safeWidth * safeHeight);
  return { width: Math.sqrt(area * ratio), height: Math.sqrt(area / ratio), ratio };
}
