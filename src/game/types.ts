export type CharacterId = 'square' | 'circle' | 'triangle';
export type SkillId = 'base-square' | 'base-circle' | 'base-triangle' | 'homing' | 'lightning' | 'boomerang' | 'mine' | 'shockwave' | 'meteor';
export type Element = 'fire' | 'ice' | 'lightning';
export type EnemyKind = 'chaser' | 'runner' | 'tank' | 'charger' | 'ranged' | 'elite-tank' | 'elite-charger' | 'boss';
export interface Vec { x: number; y: number }
export interface Input extends Vec { skill: boolean; ultimate: boolean }
export interface Obstacle extends Vec { width: number; height: number }
export interface SkillState { id: SkillId; level: number; cooldown: number; elements: Element[]; enhanced: boolean }
export interface Player extends Vec {
  characterId: CharacterId; radius: number; hp: number; maxHp: number; speed: number;
  shield: number; shieldTime: number; invulnerable: number; energy: number;
  skillCooldown: number; skillDuration: number; ultimateDuration: number; ultimateTick: number;
  lastDirection: Vec; speedBonus: number; cooldownReduction: number; damageBonus: number; pickupRadius: number;
  critChance: number; critMultiplier: number; dodge: number; armor: number;
  dashTime: number; dashRemaining: number; dashDirection: Vec; skills: SkillState[];
}
export interface Burn { dps: number; remaining: number; skillId: SkillId }
export interface Enemy extends Vec {
  id: number; kind: EnemyKind; hp: number; maxHp: number; radius: number; speed: number; damage: number;
  state: 'chase' | 'warning' | 'attack' | 'rest'; timer: number; target: Vec; attackId: number;
  slowTime: number; slowFactor: number; burn: Burn | null; thermal: Map<SkillId, number>;
  lastThermal: Map<SkillId, number>; summoned: boolean; eventEnemy: boolean; bossPattern: number; summonTimer: number;
  orbitHits: Map<number, number>; hitPlayer: boolean; avoidSide: number; attackDirection: Vec;
}
export interface Projectile extends Vec {
  id: number; attackId: number; owner: 'player' | 'enemy'; skillId: SkillId | 'enemy';
  vx: number; vy: number; radius: number; damage: number; life: number; age: number;
  range: number; traveled: number; targetId: number | null; pierce: number; hit: Set<number>;
  mode: 'straight' | 'homing' | 'boomerang'; returning: boolean; split: boolean;
}
export interface Pickup extends Vec { id: number; kind: 'xp' | 'heal'; value: number; attracted: boolean }
export interface Effect extends Vec {
  id: number; attackId: number; kind: 'warning' | 'blast' | 'mine' | 'field' | 'dash';
  owner: 'player' | 'enemy'; skillId: SkillId | 'active' | 'ultimate' | 'enemy';
  radius: number; damage: number; delay: number; life: number; triggered: boolean; hit: Set<number>;
}
export interface UpgradeChoice {
  id: string; name: string; description: string; kind: 'new' | 'level' | 'element' | 'behavior' | 'fusion' | 'stat';
  skillId?: SkillId; element?: Element; currentLevel?: number;
}
export interface MapEvent extends Vec { kind: 'elite' | 'charge'; remaining: number; progress: number; enemyId: number | null }
export type GameResult = 'victory' | 'death' | 'timeout' | null;
export interface GameState {
  player: Player; enemies: Enemy[]; projectiles: Projectile[]; pickups: Pickup[]; effects: Effect[]; obstacles: Obstacle[];
  time: number; kills: number; level: number; xp: number; xpRequired: number; pendingUpgrades: number;
  choices: UpgradeChoice[]; rerolls: number; result: GameResult; event: MapEvent | null;
  damageBySkill: Record<string, number>; phase: string; paused: boolean; bossSpawned: boolean; bossDefeated: boolean;
  eliteKills: number; warning: string | null; viewport: Vec; autoSkill: boolean;
}
/** Simulation modules share this interface, never browser or rendering objects. */
export interface WorldAccess {
  state: GameState; random(): number; nextId(): number;
  nearby(position: Vec, radius: number): Enemy[];
  damage(enemy: Enemy, amount: number, skillId: SkillId | 'active' | 'ultimate', elements?: boolean): void;
  damagePlayer(amount: number, contact?: boolean): void;
  spawnEnemy(kind: EnemyKind, position?: Vec, summoned?: boolean, eventEnemy?: boolean): Enemy | null;
  addProjectile(data: Partial<Projectile> & Vec): Projectile | null;
  addEffect(data: Partial<Effect> & Vec): Effect | null;
  move(body: Vec & { radius: number }, dx: number, dy: number): void;
  rewardChoice(): void;
}
