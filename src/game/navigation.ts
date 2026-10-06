import { CONFIG } from './config';
import { blocked, direction, distanceSq, pointSegmentDistanceSq, segmentsIntersect } from './spatial';
import type { Enemy, Obstacle, Vec, WorldAccess } from './types';

// Use each island's bounding clearance corners as conservative routing nodes. Graphs and
// target distances are shared by all enemies of the same radius in one world.
interface Graph {
  points: Vec[];
  edges: { to: number; length: number }[][];
  goal: Vec;
  distances: number[];
  next: number[];
  version: number;
}
interface Route { waypoint: Vec; version: number }
const navigation = new WeakMap<WorldAccess, Navigation>();
const padding = 2;

/** Exact swept-circle clearance, including polygon edges, rectangle corners and map edges. */
export function clearPath(a: Vec, b: Vec, radius: number, obstacles: Obstacle[]): boolean {
  if (blocked(a, radius, obstacles) || blocked(b, radius, obstacles)) return false;
  for (const o of obstacles) {
    if (Math.max(a.x, b.x) < o.x - radius || Math.min(a.x, b.x) > o.x + o.width + radius ||
        Math.max(a.y, b.y) < o.y - radius || Math.min(a.y, b.y) > o.y + o.height + radius) continue;
    if (o.vertices) {
      for (let i = 0; i < o.vertices.length; i++) {
        const c = o.vertices[i], d = o.vertices[(i + 1) % o.vertices.length];
        if (segmentsIntersect(a, b, c, d) || Math.min(pointSegmentDistanceSq(a, c, d), pointSegmentDistanceSq(b, c, d), pointSegmentDistanceSq(c, a, b), pointSegmentDistanceSq(d, a, b)) < radius * radius) return false;
      }
      continue;
    }
    // Slab intersection catches paths through the rectangle's interior.
    let enter = 0, exit = 1;
    for (const [start, delta, low, high] of [[a.x, b.x - a.x, o.x, o.x + o.width], [a.y, b.y - a.y, o.y, o.y + o.height]]) {
      if (delta === 0) { if (start < low || start > high) { enter = 2; break; } }
      else {
        const first = (low - start) / delta, second = (high - start) / delta;
        enter = Math.max(enter, Math.min(first, second));
        exit = Math.min(exit, Math.max(first, second));
      }
    }
    if (enter <= exit) return false;
    for (const x of [o.x, o.x + o.width]) for (const y of [o.y, o.y + o.height]) {
      if (pointSegmentDistanceSq({ x, y }, a, b) < radius * radius) return false;
    }
  }
  return true;
}

function legalGoal(target: Vec, radius: number, obstacles: Obstacle[]): Vec {
  const margin = radius + padding;
  const point = { x: Math.max(margin, Math.min(CONFIG.mapSize - margin, target.x)), y: Math.max(margin, Math.min(CONFIG.mapSize - margin, target.y)) };
  if (!blocked(point, radius, obstacles)) return point;
  const candidates: Vec[] = [];
  for (const o of obstacles) {
    const x = Math.max(o.x - margin, Math.min(o.x + o.width + margin, point.x));
    const y = Math.max(o.y - margin, Math.min(o.y + o.height + margin, point.y));
    candidates.push({ x: o.x - margin, y }, { x: o.x + o.width + margin, y },
      { x, y: o.y - margin }, { x, y: o.y + o.height + margin });
  }
  return candidates.filter(p => !blocked(p, radius, obstacles)).sort((a, b) => distanceSq(a, point) - distanceSq(b, point))[0] ?? point;
}

class Navigation {
  private obstacles: Obstacle[] = [];
  private graphs = new Map<number, Graph>();
  private routes = new WeakMap<Enemy, Route>();
  private target: Vec = { x: NaN, y: NaN };
  private refresh = 0;

  prepare(world: WorldAccess, dt: number): void {
    if (this.obstacles !== world.state.obstacles) {
      this.obstacles = world.state.obstacles;
      this.graphs.clear(); this.routes = new WeakMap(); this.refresh = 0;
    }
    this.refresh -= dt;
    if (this.refresh <= 0) {
      this.refresh = .25;
      const target = world.state.player;
      if (target.x !== this.target.x || target.y !== this.target.y) {
        this.target = { x: target.x, y: target.y };
        for (const [radius, graph] of this.graphs) this.updateGoal(graph, radius);
      }
    }
  }

  direction(enemy: Enemy, target: Vec, travel: number): Vec {
    const toward = (point: Vec): Vec => {
      const distance = Math.sqrt(distanceSq(enemy, point));
      if (distance < .01) return { x: 0, y: 0 };
      const scale = travel > 0 ? Math.min(1, distance / travel) : 1;
      const d = direction(enemy, point);
      return { x: d.x * scale, y: d.y * scale };
    };
    if (clearPath(enemy, target, enemy.radius, this.obstacles)) {
      this.routes.delete(enemy);
      return toward(target);
    }
    const graph = this.graph(enemy.radius);
    if (clearPath(enemy, graph.goal, enemy.radius, this.obstacles)) {
      this.routes.delete(enemy);
      return toward(graph.goal);
    }
    let route = this.routes.get(enemy);
    if (!route || route.version !== graph.version || distanceSq(enemy, route.waypoint) < .1 ** 2) {
      const candidates = graph.points.map((point, i) => ({ i, score: Math.sqrt(distanceSq(enemy, point)) + graph.distances[i] }));
      candidates.sort((a, b) => a.score - b.score || a.i - b.i);
      route = undefined;
      for (const { i, score } of candidates) {
        if (!Number.isFinite(score) || !clearPath(enemy, graph.points[i], enemy.radius, this.obstacles)) continue;
        const next = graph.next[i];
        const waypoint = distanceSq(enemy, graph.points[i]) < .1 ** 2 ? (next < 0 ? graph.goal : graph.points[next]) : graph.points[i];
        if (!clearPath(enemy, waypoint, enemy.radius, this.obstacles)) continue;
        route = { waypoint, version: graph.version };
        this.routes.set(enemy, route);
        break;
      }
    }
    return route ? toward(route.waypoint) : { x: 0, y: 0 };
  }

  private graph(radius: number): Graph {
    let graph = this.graphs.get(radius);
    if (graph) return graph;
    const points: Vec[] = [], margin = radius + padding;
    for (const o of this.obstacles) for (const x of [o.x - margin, o.x + o.width + margin]) for (const y of [o.y - margin, o.y + o.height + margin]) {
      const point = { x, y };
      if (!blocked(point, radius, this.obstacles)) points.push(point);
    }
    const edges: Graph['edges'] = points.map(() => []);
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
      if (!clearPath(points[i], points[j], radius, this.obstacles)) continue;
      const length = Math.sqrt(distanceSq(points[i], points[j]));
      edges[i].push({ to: j, length }); edges[j].push({ to: i, length });
    }
    graph = { points, edges, goal: this.target, distances: [], next: [], version: 0 };
    this.graphs.set(radius, graph);
    this.updateGoal(graph, radius);
    return graph;
  }

  private updateGoal(graph: Graph, radius: number): void {
    graph.goal = legalGoal(this.target, radius, this.obstacles);
    graph.version++;
    graph.distances = graph.points.map(point => clearPath(point, graph.goal, radius, this.obstacles) ? Math.sqrt(distanceSq(point, graph.goal)) : Infinity);
    graph.next = graph.points.map(() => -1);
    const visited = new Set<number>();
    for (let step = 0; step < graph.points.length; step++) {
      let current = -1, shortest = Infinity;
      for (let i = 0; i < graph.points.length; i++) if (!visited.has(i) && graph.distances[i] < shortest) { current = i; shortest = graph.distances[i]; }
      if (current < 0) break;
      visited.add(current);
      for (const edge of graph.edges[current]) if (shortest + edge.length < graph.distances[edge.to]) {
        graph.distances[edge.to] = shortest + edge.length;
        graph.next[edge.to] = current;
      }
    }
  }
}

export function prepareNavigation(world: WorldAccess, dt: number): void {
  let shared = navigation.get(world);
  if (!shared) { shared = new Navigation(); navigation.set(world, shared); }
  shared.prepare(world, dt);
}
export function navigationDirection(world: WorldAccess, enemy: Enemy, target: Vec, travel: number): Vec {
  return navigation.get(world)!.direction(enemy, target, travel);
}
