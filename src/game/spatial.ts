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
export function blocked(point: Vec, radius: number, obstacles: Obstacle[]): boolean {
  if (point.x < radius || point.y < radius || point.x > CONFIG.mapSize - radius || point.y > CONFIG.mapSize - radius) return true;
  return obstacles.some(o => {
    const x = Math.max(o.x, Math.min(point.x, o.x + o.width)), y = Math.max(o.y, Math.min(point.y, o.y + o.height));
    return (point.x - x) ** 2 + (point.y - y) ** 2 < radius ** 2;
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
export function makeObstacles(): Obstacle[] {
  // Deterministic islands: >= 320-unit corridors and a clear 600-unit birth area.
  const result: Obstacle[] = [];
  for (const x of [520, 1040, 1960, 2480]) for (const y of [520, 1040, 1960, 2480]) {
    result.push({ x, y, width: 180, height: 180 });
  }
  return result;
}
