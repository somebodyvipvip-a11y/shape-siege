import { ACTIVE, CHARACTERS, CONFIG, DIRECTOR, ENEMIES, STAGES } from './config';
import { collectDeaths, damageEnemy, damagePlayer, resolveResult, updateExplosions, updateStatuses } from './combat';
import { Director, updateEnemies } from './director';
import { Progression } from './progression';
import { SeededRandom } from './random';
import { stageScale } from './scaling';
import { activateSkill, activateUltimate, canAutoActivate, updateEffects, updateProjectiles, updateSkills, updateUltimate } from './skills';
import { blocked, distanceSq, makeObstacles, moveBody, SpatialGrid } from './spatial';
import type { CharacterId, Effect, Enemy, EnemyKind, GameState, Input, Projectile, SkillId, Vec, WorldAccess } from './types';

/** Browser-independent fixed-step battle. Renderer reads state; commands go through methods. */
export class GameWorld implements WorldAccess {
  readonly state: GameState;
  private sequence = 1;
  private simulationRandom: SeededRandom;
  private grid = new SpatialGrid();
  private progression: Progression;
  private director = new Director();
  private accumulator = 0;
  private skillHeld = false;
  private ultimateHeld = false;
  private queuedSkill = false;
  private queuedUltimate = false;

  constructor(characterId: CharacterId = 'circle', seed = 1) {
    const character = CHARACTERS[characterId], innate = character.attributes;
    this.simulationRandom = new SeededRandom(seed);
    const choicesRandom = new SeededRandom(seed ^ 0xBADC0FFE);
    const terrainRandom = new SeededRandom(seed ^ 0x7E22A1);
    this.state = {
      player: {
        characterId, x: CONFIG.mapSize / 2, y: CONFIG.mapSize / 2, radius: CONFIG.playerRadius,
        hp: character.hp, maxHp: character.hp, speed: character.speed * (1 + (innate.speedBonus ?? 0)), shield: 0, shieldTime: 0,
        invulnerable: 0, energy: 0, skillCooldown: 0, skillDuration: 0, ultimateDuration: 0, ultimateTick: 0,
        lastDirection: { x: 0, y: -1 }, speedBonus: innate.speedBonus ?? 0, cooldownReduction: innate.cooldownReduction ?? 0,
        damageBonus: innate.damageBonus ?? 0, pickupRadius: CONFIG.xpRadius + (innate.pickupRadius ?? 0),
        critChance: innate.critChance ?? 0, critMultiplier: CONFIG.critMultBase + (innate.critMultiplier ?? 0),
        dodge: innate.dodge ?? 0, armor: innate.armor ?? 0, luck: innate.luck ?? 0, lifesteal: innate.lifesteal ?? 0,
        dashTime: 0, dashRemaining: 0, dashDirection: { x: 0, y: -1 }, skills: [character.base, character.startingAoe].map(id => ({ id, level: 1, cooldown: 0, elements: [], enhanced: false })),
      },
      enemies: [], explosions: [], projectiles: [], pickups: [], effects: [], obstacles: makeObstacles(terrainRandom.next), time: 0,
      kills: 0, level: 1, xp: 0, xpRequired: 10, pendingUpgrades: 0, choices: [], rerolls: CONFIG.maxRerolls,
      result: null, event: null, damageBySkill: {}, phase: STAGES[0].name, paused: false,
      bossSpawned: false, bossDefeated: false, eliteKills: 0, warning: null, viewport: { x: 1000, y: 700 }, autoSkill: false,
      stage: 1, gift: [],
      lives: CONFIG.lives, reviveTimer: 0, slots: CONFIG.autoSlots,
    };
    this.progression = new Progression(this.state, choicesRandom.next);
  }
  update(dt: number, input: Input = { x: 0, y: 0, skill: false, ultimate: false }): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (this.state.paused || this.state.pendingUpgrades || this.state.result || this.state.gift.length) {
      this.accumulator = 0; this.queuedSkill = false; this.queuedUltimate = false;
      this.skillHeld = input.skill; this.ultimateHeld = input.ultimate;
      return;
    }
    if (input.skill && !this.skillHeld) this.queuedSkill = true;
    if (input.ultimate && !this.ultimateHeld) this.queuedUltimate = true;
    this.skillHeld = input.skill; this.ultimateHeld = input.ultimate;
    this.accumulator += Math.min(dt, CONFIG.step * CONFIG.maxCatchup);
    let steps = 0;
    while (this.accumulator + 1e-9 >= CONFIG.step && steps < CONFIG.maxCatchup) {
      this.step(CONFIG.step, input);
      this.accumulator = Math.max(0, this.accumulator - CONFIG.step);
      steps++;
      if (this.state.pendingUpgrades || this.state.result) { this.accumulator = 0; break; }
    }
  }
  setPaused(paused: boolean): void { this.state.paused = paused; this.accumulator = 0; }
  setAutoSkill(enabled: boolean): void { this.state.autoSkill = enabled; }
  setViewport(width: number, height: number): void {
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) this.state.viewport = { x: width, y: height };
  }
  chooseUpgrade(optionId: string): boolean { return this.progression.choose(optionId); }
  chooseGift(optionId: string): boolean {
    if (!this.progression.chooseGift(optionId)) return false;
    this.beginNextStage();
    return true;
  }
  reroll(): boolean { return this.progression.reroll(); }
  random(): number { return this.simulationRandom.next(); }
  nextId(): number { return this.sequence++; }
  nearby(position: Vec, radius: number): Enemy[] { return this.grid.query(position, radius); }
  damage(enemy: Enemy, amount: number, id: SkillId | 'active' | 'ultimate' | 'explosion', elements = true): void { damageEnemy(this, enemy, amount, id, elements); }
  damagePlayer(amount: number, contact = false): void { damagePlayer(this, amount, contact); }
  move(body: Vec & { radius: number }, dx: number, dy: number): void { moveBody(body, dx, dy, this.state.obstacles); }
  rewardChoice(): void { this.progression.reward(); }
  grantXp(value: number): void { this.progression.addXp(value); }

  spawnEnemy(kind: EnemyKind, position?: Vec, summoned = false, eventEnemy = false): Enemy | null {
    const s = this.state, config = ENEMIES[kind];
    if (!kind.startsWith('elite') && kind !== 'boss' && s.enemies.filter(e => !e.kind.startsWith('elite') && e.kind !== 'boss' && e.hp > 0).length >= CONFIG.enemyLimit) return null;
    if (!position) position = this.spawnPoint(config.radius) ?? undefined;
    if (!position || blocked(position, config.radius, s.obstacles)) return null;
    const scale = stageScale(s.stage);
    const hpScale = kind.startsWith('elite') || kind === 'boss' ? scale.eliteHp : scale.hp;
    const hp = kind === 'exploder' ? config.hp : config.hp * hpScale;
    const enemy: Enemy = {
      id: this.nextId(), x: position.x, y: position.y, kind, hp, maxHp: hp,
      radius: config.radius, speed: config.speed * scale.speed, damage: config.damage * scale.damage, state: 'chase', timer: kind === 'boss' ? 2 : 1,
      target: { x: s.player.x, y: s.player.y }, attackId: this.nextId(), slowTime: 0, slowFactor: 0,
      burn: null, thermal: new Map(), lastThermal: new Map(), orbitHits: new Map(), hitPlayer: false,
      explosionArmed: false, summoned, eventEnemy, bossPattern: 0, summonTimer: DIRECTOR.summonInterval, avoidSide: this.random() < .5 ? -1 : 1,
      attackDirection: { x: 0, y: -1 },
    };
    s.enemies.push(enemy);
    this.grid.rebuild(s.enemies);
    return enemy;
  }
  private spawnPoint(radius: number): Vec | null {
    const s = this.state;
    for (let attempt = 0; attempt < 64; attempt++) {
      const angle = this.random() * Math.PI * 2;
      const x = Math.cos(angle), y = Math.sin(angle);
      const margin = CONFIG.spawnClearance + radius;
      const edge = Math.min((s.viewport.x / 2 + margin) / Math.max(.001, Math.abs(x)), (s.viewport.y / 2 + margin) / Math.max(.001, Math.abs(y)));
      const distance = edge + this.random() * 120;
      const point = { x: s.player.x + x * distance, y: s.player.y + y * distance };
      if (!blocked(point, radius, s.obstacles)) return point;
    }
    return null;
  }
  addProjectile(data: Partial<Projectile> & Vec): Projectile | null {
    const { x, y, ...overrides } = data;
    const owner = data.owner ?? 'player', limit = owner === 'player' ? CONFIG.playerProjectileLimit : CONFIG.enemyProjectileLimit;
    if (this.state.projectiles.filter(p => p.owner === owner && p.life > 0).length >= limit) return null;
    const shot: Projectile = {
      id: this.nextId(), attackId: this.nextId(), owner, skillId: 'base-circle', x, y,
      vx: 0, vy: 0, radius: 7, damage: 0, life: 2, age: 0, range: 600, traveled: 0,
      targetId: null, pierce: 1, hit: new Set(), mode: 'straight', returning: false, split: false,
      ...overrides,
    };
    this.state.projectiles.push(shot);
    return shot;
  }
  addEffect(data: Partial<Effect> & Vec): Effect | null {
    const { x, y, ...overrides } = data;
    // Keep a reserved budget for enemy warnings. Decorations cannot occupy it.
    const owner = data.owner ?? 'player';
    const limit = owner === 'enemy' ? CONFIG.effectLimit : CONFIG.effectLimit - 20;
    if (this.state.effects.length >= limit) {
      // Never splice a container while skills iterate it; budget new emissions instead.
      return null;
    }
    const effect: Effect = { id: this.nextId(), attackId: this.nextId(), owner, skillId: 'base-circle', kind: 'blast', x, y, radius: 20, damage: 0, delay: 0, life: .2, triggered: false, hit: new Set(), ...overrides };
    this.state.effects.push(effect);
    return effect;
  }
  /** Test harness only. Product UI must not call this surface. */
  readonly debug = {
    addXp: (amount: number): void => this.progression.addXp(amount),
    candidates: () => this.progression.candidates(),
    giftCandidates: () => this.progression.giftCandidates(),
    rebuildGrid: (): void => this.grid.rebuild(this.state.enemies),
    resolveResult: (): void => { collectDeaths(this); resolveResult(this); },
  };

  private step(dt: number, input: Input): void {
    const s = this.state, p = s.player;
    s.time += dt;
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    p.skillCooldown = Math.max(0, p.skillCooldown - dt);
    p.skillDuration = Math.max(0, p.skillDuration - dt);
    p.shieldTime = Math.max(0, p.shieldTime - dt);
    if (!p.shieldTime) p.shield = 0;
    p.energy = Math.min(100, p.energy + dt);
    // 复活倒计时：归零时满血复活；复活当帧即可恢复操作。
    if (s.reviveTimer > 0) {
      s.reviveTimer = Math.max(0, s.reviveTimer - dt);
      if (s.reviveTimer <= 0) this.revivePlayer();
    }
    const dead = p.hp <= 0;
    let x = Number.isFinite(input.x) ? Math.max(-1, Math.min(1, input.x)) : 0;
    let y = Number.isFinite(input.y) ? Math.max(-1, Math.min(1, input.y)) : 0;
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    if (length > .001) p.lastDirection = { x: x / Math.hypot(x, y), y: y / Math.hypot(x, y) };
    this.director.update(this, dt);
    this.grid.rebuild(s.enemies);
    // 复活等待期间：不移动、不施法、不拾取，敌人 / 弹幕 / 特效照常推进。
    if (!dead) {
      if (this.queuedSkill || (s.autoSkill && p.skillCooldown <= 0 && canAutoActivate(this))) activateSkill(this);
      if (this.queuedUltimate) activateUltimate(this);
    }
    this.queuedSkill = false; this.queuedUltimate = false;
    if (!dead) {
      if (p.dashTime > 0) {
        const distance = Math.min(p.dashRemaining, ACTIVE.triangle.distance / ACTIVE.triangle.duration * dt);
        const oldX = p.x, oldY = p.y;
        this.move(p, p.dashDirection.x * distance, p.dashDirection.y * distance);
        p.dashRemaining -= distance;
        p.dashTime = Math.max(0, p.dashTime - dt);
        if (Math.hypot(p.x - oldX, p.y - oldY) < distance * .9) { p.dashTime = 0; p.dashRemaining = 0; }
      } else this.move(p, x * p.speed * dt, y * p.speed * dt);
    }
    updateStatuses(this, dt);
    updateUltimate(this, dt);
    this.grid.rebuild(s.enemies);
    updateExplosions(this, dt);
    if (!dead) updateSkills(this, dt);
    updateProjectiles(this, dt);
    updateEffects(this, dt);
    updateEnemies(this, dt);
    collectDeaths(this);
    resolveResult(this);
    if (s.result) return;
    if (s.bossDefeated && !s.gift.length) { this.beginStageClear(); return; }
    if (!dead) this.updatePickups(dt);
    this.grid.rebuild(s.enemies);
  }
  /** 复活瞬间：满血、短暂无敌，并移除复活半径内的普通敌人（不给经验与掉落，避免复活即秒死）。 */
  private revivePlayer(): void {
    const s = this.state, p = s.player;
    p.hp = p.maxHp;
    p.invulnerable = CONFIG.reviveInvulnerable;
    const radiusSq = CONFIG.reviveClearRadius ** 2;
    let write = 0;
    for (const enemy of s.enemies) {
      if (enemy.kind.startsWith('elite') || enemy.kind === 'boss' || distanceSq(enemy, p) > radiusSq) s.enemies[write++] = enemy;
    }
    s.enemies.length = write;
    this.grid.rebuild(s.enemies);
  }
  /** 击破首领：清场、回到地图中心并获得短暂无敌，随后弹出大礼包三选一。 */
  private beginStageClear(): void {
    const s = this.state, p = s.player;
    s.enemies.length = 0; s.projectiles.length = 0; s.effects.length = 0; s.explosions.length = 0; s.event = null;
    p.x = CONFIG.mapSize / 2; p.y = CONFIG.mapSize / 2; p.shield = 0; p.shieldTime = 0;
    // 首领可能在复活等待期间被持续伤害击杀，通关时补满生命并结束倒计时。
    s.reviveTimer = 0;
    if (p.hp <= 0) p.hp = p.maxHp;
    p.invulnerable = Math.max(p.invulnerable, 1.5);
    this.grid.rebuild(s.enemies);
    s.gift = this.progression.rollGift();
  }
  /** 选择大礼包后推进到下一关，重置时间轴与首领状态，保留等级、技能与属性成长。 */
  private beginNextStage(): void {
    const s = this.state, p = s.player;
    s.stage++;
    s.time = 0; s.bossSpawned = false; s.bossDefeated = false; s.warning = null;
    s.projectiles.length = 0; s.effects.length = 0; s.explosions.length = 0;
    this.director.reset();
    p.invulnerable = Math.max(p.invulnerable, 1);
  }
  private updatePickups(dt: number): void {
    const s = this.state, p = s.player;
    let write = 0;
    for (const pickup of s.pickups) {
      if (distanceSq(p, pickup) <= p.pickupRadius ** 2) pickup.attracted = true;
      if (pickup.attracted) {
        const dx = p.x - pickup.x, dy = p.y - pickup.y, distance = Math.hypot(dx, dy);
        const travel = CONFIG.pickupSpeed * dt;
        if (distance <= travel + p.radius) {
          if (pickup.kind === 'xp') this.progression.addXp(pickup.value);
          else if (pickup.kind === 'maxhp') { p.maxHp += pickup.value; p.hp = Math.min(p.maxHp, p.hp + pickup.value); }
          else p.hp = Math.min(p.maxHp, p.hp + pickup.value);
          continue;
        }
        pickup.x += dx / distance * travel; pickup.y += dy / distance * travel;
      }
      s.pickups[write++] = pickup;
    }
    s.pickups.length = write;
  }
}
