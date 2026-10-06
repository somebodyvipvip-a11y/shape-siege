import { SeededRandom } from './random';
import { CONFIG } from './config';
import type { Enemy, Obstacle, Vec } from './types';

export const distanceSq = (a: Vec, b: Vec): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export function direction(a: Vec, b: Vec): Vec {
  const x = b.x - a.x, y = b.y - a.y, length = Math.hypot(x, y);
  return length ? { x: x / length, y: y / length } : { x: 0, y: -1 };
}
export class SpatialGrid {
  private cells = new Map<number, Enemy[]>();
  private used: Enemy[][] = [];
  private scratch: Enemy[] = [];
  rebuild(enemies: Enemy[]): void {
    for (const cell of this.used) cell.length = 0;
    this.used.length = 0;
    for (const enemy of enemies) {
      if (enemy.hp <= 0) continue;
      const key = this.key(Math.floor(enemy.x / CONFIG.gridSize), Math.floor(enemy.y / CONFIG.gridSize));
      let cell = this.cells.get(key);
      if (!cell) { cell = []; this.cells.set(key, cell); }
      if (!cell.length) this.used.push(cell);
      cell.push(enemy);
    }
  }
  query(point: Vec, radius: number): Enemy[] {
    // One reusable scratch array. Consumers must finish before querying again.
    this.scratch.length = 0;
    const lowX = Math.floor((point.x - radius) / CONFIG.gridSize), highX = Math.floor((point.x + radius) / CONFIG.gridSize);
    const lowY = Math.floor((point.y - radius) / CONFIG.gridSize), highY = Math.floor((point.y + radius) / CONFIG.gridSize);
    for (let y = lowY; y <= highY; y++) for (let x = lowX; x <= highX; x++) {
      for (const e of this.cells.get(this.key(x, y)) ?? []) {
        if (e.hp > 0 && distanceSq(e, point) <= radius ** 2) this.scratch.push(e);
      }
    }
    return this.scratch;
  }
  private key(x: number, y: number): number { return y * 128 + x; }
}
export function pointSegmentDistanceSq(point: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x, dy = b.y - a.y, lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq)) : 0;
  return distanceSq(point, { x: a.x + t * dx, y: a.y + t * dy });
}
export function segmentsIntersect(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  const cross = (p: Vec, q: Vec, r: Vec): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (abC * abD < 0 && cdA * cdB < 0) return true;
  return (Math.abs(abC) < 1e-8 && pointSegmentDistanceSq(c, a, b) < 1e-8) ||
    (Math.abs(abD) < 1e-8 && pointSegmentDistanceSq(d, a, b) < 1e-8) ||
    (Math.abs(cdA) < 1e-8 && pointSegmentDistanceSq(a, c, d) < 1e-8) ||
    (Math.abs(cdB) < 1e-8 && pointSegmentDistanceSq(b, c, d) < 1e-8);
}
function pointInPolygon(point: Vec, vertices: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i], b = vertices[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export function blocked(point: Vec, radius: number, obstacles: Obstacle[]): boolean {
  if (point.x < radius || point.y < radius || point.x > CONFIG.mapSize - radius || point.y > CONFIG.mapSize - radius) return true;
  return obstacles.some(o => {
    const x = Math.max(o.x, Math.min(point.x, o.x + o.width)), y = Math.max(o.y, Math.min(point.y, o.y + o.height));
    if ((point.x - x) ** 2 + (point.y - y) ** 2 >= radius ** 2 && (point.x < o.x || point.x > o.x + o.width || point.y < o.y || point.y > o.y + o.height)) return false;
    if (!o.vertices) return (point.x - x) ** 2 + (point.y - y) ** 2 < radius ** 2;
    if (pointInPolygon(point, o.vertices)) return true;
    return o.vertices.some((a, i) => pointSegmentDistanceSq(point, a, o.vertices![(i + 1) % o.vertices!.length]) < radius ** 2);
  });
}
export function moveBody(body: Vec & { radius: number }, dx: number, dy: number, obstacles: Obstacle[]): void {
  // Subdivide fast motion to prevent tunnelling through a thin obstacle.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / Math.max(4, body.radius / 2)));
  for (let i = 0; i < steps; i++) {
    const x = Math.max(body.radius, Math.min(CONFIG.mapSize - body.radius, body.x + dx / steps));
    const y = Math.max(body.radius, Math.min(CONFIG.mapSize - body.radius, body.y + dy / steps));
    if (!blocked({ x, y: body.y }, body.radius, obstacles)) body.x = x;
    if (!blocked({ x: body.x, y }, body.radius, obstacles)) body.y = y;
  }
}
/** 独立随机流生成凸多边形岛屿；包围盒之间至少留 240 单位通路。 */
export function makeObstacles(random: () => number = new SeededRandom(1).next): Obstacle[] {
  const result: Obstacle[] = [], count = 12 + Math.floor(random() * 5);
  for (let attempt = 0; attempt < 600 && result.length < count; attempt++) {
    const center = { x: 300 + random() * 2600, y: 300 + random() * 2600 };
    const sides = 3 + Math.floor(random() * 4), angle = random() * Math.PI * 2;
    const rx = 70 + random() * 80, ry = 70 + random() * 80;
    const vertices = Array.from({ length: sides }, (_, i) => {
      const a = i * Math.PI * 2 / sides, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      return { x: center.x + x * Math.cos(angle) - y * Math.sin(angle), y: center.y + x * Math.sin(angle) + y * Math.cos(angle) };
    });
    const x = Math.min(...vertices.map(v => v.x)), y = Math.min(...vertices.map(v => v.y));
    const width = Math.max(...vertices.map(v => v.x)) - x, height = Math.max(...vertices.map(v => v.y)) - y;
    const obstacle = { x, y, width, height, vertices };
    if (x < 160 || y < 160 || x + width > CONFIG.mapSize - 160 || y + height > CONFIG.mapSize - 160) continue;
    if (blocked({ x: 1600, y: 1600 }, 360, [obstacle])) continue;
    if (result.some(o => !(x + width + 240 < o.x || o.x + o.width + 240 < x || y + height + 240 < o.y || o.y + o.height + 240 < y))) continue;
    result.push(obstacle);
  }
  return result;
}
