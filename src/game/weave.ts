import { HERO_MECHANICS, SKILLS } from './config';
import { blocked, distanceSq, segmentsIntersect, pointSegmentDistanceSq, pointInPolygon as insidePolygon } from './spatial';
import type { Effect, GameState, Obstacle, Vec } from './types';

export interface WeavePath { nodes: Effect[]; edges: [Vec, Vec][]; closed: boolean; width: number }
function canLink(a: Vec, b: Vec, obstacles: Obstacle[]): boolean {
  const length = Math.sqrt(distanceSq(a, b));
  if (length > HERO_MECHANICS.pentagon.linkRange || length < 1) return false;
  if (blocked(a, 3, obstacles) || blocked(b, 3, obstacles)) return false;
  for (const obstacle of obstacles) {
    const vertices = obstacle.vertices ?? [{ x: obstacle.x, y: obstacle.y }, { x: obstacle.x + obstacle.width, y: obstacle.y },
      { x: obstacle.x + obstacle.width, y: obstacle.y + obstacle.height }, { x: obstacle.x, y: obstacle.y + obstacle.height }];
    for (let i = 0; i < vertices.length; i++) {
      const c = vertices[i], d = vertices[(i + 1) % vertices.length];
      if (segmentsIntersect(a, b, c, d) || Math.min(pointSegmentDistanceSq(a, c, d), pointSegmentDistanceSq(b, c, d),
        pointSegmentDistanceSq(c, a, b), pointSegmentDistanceSq(d, a, b)) <= 9) return false;
    }
  }
  return true;
}
export function weavePath(state: GameState): WeavePath {
  const nodes = state.effects.filter(e => e.kind === 'sigil' && e.life > 0 && !e.triggered);
  const edges: [Vec, Vec][] = [];
  for (let i = 1; i < nodes.length; i++) if (canLink(nodes[i - 1], nodes[i], state.obstacles)) edges.push([nodes[i - 1], nodes[i]]);
  let closed = nodes.length >= 3 && edges.length === nodes.length - 1 && canLink(nodes.at(-1)!, nodes[0], state.obstacles);
  if (closed) {
    const ring: [Vec, Vec][] = [...edges, [nodes.at(-1)!, nodes[0]]];
    for (let i = 0; i < ring.length; i++) for (let j = i + 2; j < ring.length; j++) {
      if (i === 0 && j === ring.length - 1) continue;
      if (segmentsIntersect(...ring[i], ...ring[j])) closed = false;
    }
    // 排除直线和几乎重叠的闭环。
    const area = Math.abs(nodes.reduce((sum, a, i) => { const b = nodes[(i + 1) % nodes.length]; return sum + a.x * b.y - b.x * a.y; }, 0)) / 2;
    if (area < 1000) closed = false;
    if (closed) edges.push(ring.at(-1)!);
  }
  const skill = state.player.skills.find(s => s.id === 'sigil');
  const width = SKILLS.sigil.radius + ((skill?.level ?? 1) - 1) * .5 + (skill?.enhanced ? 4 : 0);
  return { nodes, edges, closed, width };
}
export { pointInPolygon as insidePolygon } from './spatial';
export function touchesPath(point: Vec, radius: number, edges: [Vec, Vec][]): boolean {
  return edges.some(([a, b]) => pointSegmentDistanceSq(point, a, b) <= radius * radius);
}
export function touchesPolygon(point: Vec, radius: number, points: Vec[]): boolean {
  return insidePolygon(point, points) || touchesPath(point, radius, points.map((a, i) => [a, points[(i + 1) % points.length]]));
}
