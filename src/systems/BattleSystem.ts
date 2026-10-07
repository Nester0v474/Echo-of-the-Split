import {
  BASE_INCOME,
  RESOURCE_INCOME,
  FLANK_MULTIPLIER,
  ASTEROID_DAMAGE_REDUCTION,
} from '../config/constants';
import { UNIT_TYPES, upgradeCost, type UnitId } from '../config/units';
import {
  MAX_ENEMY_FIELD_SHIPS,
  WAVE_SCHEDULE,
  getUpcomingWave,
  getWave,
  type UpcomingWave,
  type WaveSchedule,
} from '../config/waveSchedule';
import type { BattleUnit, Team, UnitSpawn } from '../entities/Unit';
import { EventEmitter } from './EventEmitter';
import {
  HexGrid,
  HexType,
  areOppositeNeighbors,
  getHexesInRange,
  hexDistance,
  hexKey,
  type Axial,
} from './HexGrid';
import { findPath, getReachable } from './Pathfinding';

export type BattlePhase = 'player' | 'enemy' | 'ended';
export type BattleEndReason = 'flagship' | 'elimination' | 'turn_limit';

export interface BattleEvents {
  'battle:started': { units: readonly BattleUnit[]; turnNumber: number };
  'turn:start': { team: Team; turnNumber: number; energy: number };
  'turn:end': { team: Team; turnNumber: number };
  'unit:selected': { unitId: string | null };
  'unit:moved': {
    unitId: string;
    from: Axial;
    to: Axial;
    path: Axial[];
  };
  'unit:attacked': {
    attackerId: string;
    targetId: string;
    /** Damage actually applied by this attack (after flank / cover). */
    damage: number;
    remainingHp: number;
    remainingShield: number;
    flanked: boolean;
  };
  /**
   * Second attack of a flanking pair landed: the first attacker's damage is
   * retroactively raised to ×FLANK_MULTIPLIER (`bonusDamage` applied now).
   */
  'combat:flank': {
    targetId: string;
    attackerIds: [string, string];
    bonusDamage: number;
  };
  /** Stats changed outside of an attack (e.g. shield regen). */
  'unit:updated': { unitId: string };
  /** A unit entered the field mid-battle (wave reinforcement or recruit). */
  'unit:spawned': { unit: BattleUnit; source: 'wave' | 'recruit' };
  /** Whole reinforcement wave arrived — render as one distinct action. */
  'wave:spawned': { turnNumber: number; team: Team; units: readonly BattleUnit[] };
  'energy:changed': { team: Team; energy: number };
  /** A ship class was upgraded at the flagship; living ships already patched. */
  'upgrade:purchased': { team: Team; typeId: UnitId; level: number };
  'unit:died': { unitId: string };
  /** `winner` is null when the turn limit ran out. */
  'battle:ended': { winner: Team | null; reason: BattleEndReason; turnNumber: number };
  'action:rejected': { reason: string };
}

export interface BattleSystemOptions {
  /**
   * Built-in AI drives the enemy phase via tickAi(). Set false to control
   * both teams through the public API (headless simulation).
   */
  autoEnemyAi?: boolean;
  /** Enemy reinforcements by turn; null disables waves. */
  waveSchedule?: WaveSchedule | null;
  /** After the scripted opening, keep spawning a balanced loop. */
  loopWaves?: boolean;
  /** Optional draw after this many rounds. Omitted or non-finite = no turn limit. */
  maxTurns?: number;
  startingEnergy?: number;
  /** Per-team starting energy (overrides startingEnergy). */
  startingEnergyByTeam?: Partial<Record<Team, number>>;
  /** Flagship shield regen per team (difficulty knob, GDD §9). */
  shieldRegenByTeam?: Partial<Record<Team, number>>;
}

interface TurnAttackRecord {
  attackerId: string;
  hex: Axial;
  team: Team;
}

/** Recruit order used by `priority` helpers (artillery first). */
export const RECRUIT_PRIORITY: readonly UnitId[] = ['artillery', 'cruiser', 'fighter', 'scout'];

export class BattleSystem {
  readonly events = new EventEmitter<BattleEvents>();
  readonly grid: HexGrid;
  readonly maxTurns: number;

  private readonly autoEnemyAi: boolean;
  private readonly waveSchedule: WaveSchedule | null;
  private readonly loopWaves: boolean;
  private readonly startingEnergy: number;
  private readonly startingEnergyByTeam: Partial<Record<Team, number>>;
  private readonly shieldRegenByTeam: Partial<Record<Team, number>>;

  private units = new Map<string, BattleUnit>();
  private phase: BattlePhase = 'player';
  private turnNumber = 1;
  private selectedUnitId: string | null = null;
  private aiQueue: string[] = [];
  private energy: Record<Team, number> = { player: 0, enemy: 0 };
  private upgrades: Record<Team, Partial<Record<UnitId, number>>> = { player: {}, enemy: {} };
  private spawnCounter = 0;
  /** Attacks landed during the current phase, by target id (flank tracking). */
  private attacksThisTurn = new Map<string, TurnAttackRecord[]>();
  private endInfo: { winner: Team | null; reason: BattleEndReason } | null = null;

  constructor(grid: HexGrid, options: BattleSystemOptions = {}) {
    this.grid = grid;
    this.autoEnemyAi = options.autoEnemyAi ?? true;
    this.waveSchedule = options.waveSchedule === undefined ? WAVE_SCHEDULE : options.waveSchedule;
    this.loopWaves =
      options.loopWaves ?? (options.waveSchedule === undefined || options.waveSchedule === WAVE_SCHEDULE);
    this.maxTurns = options.maxTurns ?? Number.POSITIVE_INFINITY;
    this.startingEnergy = options.startingEnergy ?? 0;
    this.startingEnergyByTeam = options.startingEnergyByTeam ?? {};
    this.shieldRegenByTeam = options.shieldRegenByTeam ?? {};
  }

  // -------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------

  start(spawns: readonly UnitSpawn[]): void {
    this.units.clear();
    this.phase = 'player';
    this.turnNumber = 1;
    this.selectedUnitId = null;
    this.aiQueue = [];
    this.spawnCounter = 0;
    this.attacksThisTurn.clear();
    this.endInfo = null;
    this.energy = {
      player: this.startingEnergyByTeam.player ?? this.startingEnergy,
      enemy: this.startingEnergyByTeam.enemy ?? this.startingEnergy,
    };
    this.upgrades = { player: {}, enemy: {} };

    for (const spawn of spawns) {
      if (!this.grid.has(spawn.q, spawn.r)) {
        throw new Error(`Spawn ${spawn.id} outside grid (${spawn.q},${spawn.r})`);
      }
      if (this.getUnitAt(spawn.q, spawn.r)) {
        throw new Error(`Spawn cell occupied (${spawn.q},${spawn.r})`);
      }
      this.units.set(spawn.id, this.buildUnit(spawn));
    }

    this.events.emit('battle:started', {
      units: this.getUnits(),
      turnNumber: this.turnNumber,
    });
    this.beginTurn('player');
  }

  private buildUnit(spawn: UnitSpawn, fresh = true): BattleUnit {
    const def = UNIT_TYPES[spawn.typeId];
    const o = spawn.overrides ?? {};
    const stats = this.getClassStats(spawn.team, spawn.typeId);
    const hp = o.hp ?? stats.hp;
    const shield = o.shield ?? def.shield;
    return {
      id: spawn.id,
      typeId: spawn.typeId,
      team: spawn.team,
      q: spawn.q,
      r: spawn.r,
      hp,
      maxHp: hp,
      shield,
      maxShield: shield,
      shieldRegen: this.shieldRegenByTeam[spawn.team] ?? def.shieldRegen,
      damage: o.damage ?? stats.damage,
      range: o.range ?? def.range,
      moveRange: o.moveRange ?? def.moveRange,
      // Units that arrive mid-battle spend their first turn deploying.
      hasMoved: !fresh,
      hasAttacked: !fresh,
      alive: true,
    };
  }

  // -------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------

  getPhase(): BattlePhase {
    return this.phase;
  }

  getTurnNumber(): number {
    return this.turnNumber;
  }

  getUpcomingWave(): UpcomingWave | null {
    return getUpcomingWave(this.waveSchedule, this.turnNumber, this.phase, this.loopWaves);
  }

  getSelectedUnitId(): string | null {
    return this.selectedUnitId;
  }

  getEnergy(team: Team): number {
    return this.energy[team];
  }

  getEndInfo(): { winner: Team | null; reason: BattleEndReason } | null {
    return this.endInfo;
  }

  getUpgradeLevel(team: Team, typeId: UnitId): number {
    return this.upgrades[team][typeId] ?? 0;
  }

  /** Energy needed for the next level of `typeId`, or null when maxed. */
  getUpgradeCost(team: Team, typeId: UnitId): number | null {
    return upgradeCost(typeId, this.getUpgradeLevel(team, typeId));
  }

  /** Effective base stats of a class for `team` including bought upgrades. */
  getClassStats(team: Team, typeId: UnitId): { hp: number; damage: number; level: number } {
    const def = UNIT_TYPES[typeId];
    const level = this.getUpgradeLevel(team, typeId);
    return {
      hp: def.hp + level * def.upgrade.hpPerLevel,
      damage: def.damage + level * def.upgrade.damagePerLevel,
      level,
    };
  }

  getUnits(): BattleUnit[] {
    return [...this.units.values()].map((u) => ({ ...u }));
  }

  getUnit(id: string): BattleUnit | undefined {
    const u = this.units.get(id);
    return u ? { ...u } : undefined;
  }

  getUnitAt(q: number, r: number): BattleUnit | undefined {
    for (const u of this.units.values()) {
      if (u.alive && u.q === q && u.r === r) {
        return { ...u };
      }
    }
    return undefined;
  }

  getFlagship(team: Team): BattleUnit | undefined {
    for (const u of this.units.values()) {
      if (u.team === team && UNIT_TYPES[u.typeId].isFlagship) {
        return { ...u };
      }
    }
    return undefined;
  }

  /**
   * Attack range after terrain: a unit on an ASTEROID hex cannot fire at its
   * maximum range (range - 1, minimum 1).
   */
  effectiveRange(unit: Pick<BattleUnit, 'q' | 'r' | 'range'>): number {
    if (this.grid.getType(unit.q, unit.r) === HexType.ASTEROID) {
      return Math.max(1, unit.range - 1);
    }
    return unit.range;
  }

  /** Energy income for `team` right now (GDD §6). */
  incomeFor(team: Team): number {
    let held = 0;
    for (const cell of this.grid.cellsOfType(HexType.RESOURCE)) {
      const occupant = this.getUnitAt(cell.q, cell.r);
      if (occupant && occupant.team === team) {
        held += 1;
      }
    }
    return BASE_INCOME + RESOURCE_INCOME * held;
  }

  // -------------------------------------------------------------------
  // Selection / planning
  // -------------------------------------------------------------------

  selectUnit(unitId: string | null): boolean {
    if (this.phase !== 'player') {
      this.reject('Not player phase');
      return false;
    }

    if (unitId === null) {
      this.selectedUnitId = null;
      this.events.emit('unit:selected', { unitId: null });
      return true;
    }

    const unit = this.units.get(unitId);
    if (!unit || !unit.alive || unit.team !== 'player') {
      this.reject('Cannot select unit');
      return false;
    }
    if (UNIT_TYPES[unit.typeId].isFlagship) {
      this.reject('Structures act automatically');
      return false;
    }

    this.selectedUnitId = unitId;
    this.events.emit('unit:selected', { unitId });
    return true;
  }

  /** Hexes the unit can move to this turn. */
  getMoveTargets(unitId: string): Axial[] {
    const unit = this.units.get(unitId);
    if (!unit || !unit.alive || unit.hasMoved || unit.moveRange === 0) {
      return [];
    }
    return getReachable(
      this.grid,
      { q: unit.q, r: unit.r },
      unit.moveRange,
      (q, r) => this.isOccupied(q, r),
    );
  }

  /** Living enemies within the unit's effective attack range. */
  getAttackTargets(unitId: string): BattleUnit[] {
    const unit = this.units.get(unitId);
    if (!unit || !unit.alive || unit.hasAttacked) {
      return [];
    }
    const range = this.effectiveRange(unit);
    return [...this.units.values()]
      .filter((t) => t.alive && t.team !== unit.team && hexDistance(unit, t) <= range)
      .map((t) => ({ ...t }));
  }

  /** Path the unit would take to (q,r) this turn, or null — for previews only. */
  previewPath(unitId: string, toQ: number, toR: number): Axial[] | null {
    const unit = this.units.get(unitId);
    if (!unit || !unit.alive || unit.hasMoved) {
      return null;
    }
    if (!this.grid.has(toQ, toR) || this.isOccupied(toQ, toR)) {
      return null;
    }
    const path = findPath(
      this.grid,
      { q: unit.q, r: unit.r },
      { q: toQ, r: toR },
      (q, r) => this.isOccupied(q, r),
      unit.moveRange,
    );
    return path && path.length >= 2 ? path : null;
  }

  // -------------------------------------------------------------------
  // Actions (valid for the team whose phase it is)
  // -------------------------------------------------------------------

  moveUnit(unitId: string, toQ: number, toR: number): boolean {
    const unit = this.units.get(unitId);
    if (!this.canAct(unit)) {
      return false;
    }
    if (unit.hasMoved) {
      this.reject('Unit already moved');
      return false;
    }
    if (!this.grid.has(toQ, toR) || this.isOccupied(toQ, toR)) {
      this.reject('Invalid destination');
      return false;
    }

    const from = { q: unit.q, r: unit.r };
    const to = { q: toQ, r: toR };
    const path = findPath(
      this.grid,
      from,
      to,
      (q, r) => this.isOccupied(q, r),
      unit.moveRange,
    );

    if (!path || path.length < 2) {
      this.reject('No path');
      return false;
    }
    if (path.length - 1 > unit.moveRange) {
      this.reject('Out of move range');
      return false;
    }

    unit.q = toQ;
    unit.r = toR;
    unit.hasMoved = true;
    if (unit.team === 'player') {
      this.selectedUnitId = unitId;
    }

    this.events.emit('unit:moved', { unitId, from, to, path });
    return true;
  }

  attack(attackerId: string, targetId: string): boolean {
    const attacker = this.units.get(attackerId);
    if (!this.canAct(attacker)) {
      return false;
    }
    const target = this.units.get(targetId);
    if (!target || !target.alive || target.team === attacker.team) {
      this.reject('Invalid target');
      return false;
    }
    if (attacker.hasAttacked) {
      this.reject('Unit already attacked');
      return false;
    }
    if (hexDistance(attacker, target) > this.effectiveRange(attacker)) {
      this.reject('Out of attack range');
      return false;
    }

    this.resolveAttack(attacker, target);
    if (attacker.team === 'player') {
      this.selectedUnitId = attackerId;
    }
    return this.phase !== 'ended';
  }

  /**
   * Buy a unit for the acting team; it appears on the nearest free hex to the
   * team's flagship and can act from the next turn.
   */
  recruit(team: Team, typeId: UnitId): BattleUnit | null {
    if (this.phase !== team) {
      this.reject(`Not ${team} phase`);
      return null;
    }
    const def = UNIT_TYPES[typeId];
    if (def.isFlagship) {
      this.reject('Cannot recruit a structure');
      return null;
    }
    if (this.energy[team] < def.cost) {
      this.reject('Not enough energy');
      return null;
    }
    const flagship = this.getFlagship(team);
    if (!flagship || !flagship.alive) {
      this.reject('No flagship to spawn at');
      return null;
    }
    const hex = this.findSpawnHex(flagship);
    if (!hex) {
      this.reject('No free hex near flagship');
      return null;
    }

    this.energy[team] -= def.cost;
    this.events.emit('energy:changed', { team, energy: this.energy[team] });

    const unit = this.spawnUnit(team, typeId, hex, 'recruit');
    return { ...unit };
  }

  /**
   * Buy the next upgrade level for a ship class. Applies immediately to all
   * living ships of that class (hp, maxHp, damage) and to future recruits.
   */
  upgradeUnitType(team: Team, typeId: UnitId): boolean {
    if (this.phase !== team) {
      this.reject(`Not ${team} phase`);
      return false;
    }
    const flagship = this.getFlagship(team);
    if (!flagship || !flagship.alive) {
      this.reject('No flagship');
      return false;
    }
    const cost = this.getUpgradeCost(team, typeId);
    if (cost === null) {
      this.reject('Already at max level');
      return false;
    }
    if (this.energy[team] < cost) {
      this.reject('Not enough energy');
      return false;
    }

    this.energy[team] -= cost;
    const level = this.getUpgradeLevel(team, typeId) + 1;
    this.upgrades[team][typeId] = level;

    const track = UNIT_TYPES[typeId].upgrade;
    for (const u of this.units.values()) {
      if (u.alive && u.team === team && u.typeId === typeId) {
        u.maxHp += track.hpPerLevel;
        u.hp += track.hpPerLevel;
        u.damage += track.damagePerLevel;
        this.events.emit('unit:updated', { unitId: u.id });
      }
    }

    this.events.emit('energy:changed', { team, energy: this.energy[team] });
    this.events.emit('upgrade:purchased', { team, typeId, level });
    return true;
  }

  /**
   * Runs the built-in heuristic for one unit of the acting team: attack if a
   * foe is in range, otherwise move toward the nearest foe, then attack.
   * Used by the enemy AI and by the headless simulator for both sides.
   */
  runUnitAi(unitId: string): boolean {
    const unit = this.units.get(unitId);
    if (!this.canAct(unit)) {
      return false;
    }
    if (UNIT_TYPES[unit.typeId].isFlagship) {
      return false;
    }
    this.aiAct(unit);
    return true;
  }

  // -------------------------------------------------------------------
  // Turn flow
  // -------------------------------------------------------------------

  /** Ends whichever phase is active. */
  endTurn(): boolean {
    if (this.phase === 'player') {
      return this.endPlayerTurn();
    }
    if (this.phase === 'enemy') {
      this.finishEnemyTurn();
      return true;
    }
    this.reject('Battle ended');
    return false;
  }

  /**
   * Ends the player phase. With autoEnemyAi the enemy queue is processed via
   * tickAi(); otherwise the caller drives enemy units and calls endTurn().
   */
  endPlayerTurn(): boolean {
    if (this.phase !== 'player') {
      this.reject('Not player phase');
      return false;
    }

    this.events.emit('turn:end', { team: 'player', turnNumber: this.turnNumber });
    this.phase = 'enemy';
    this.selectedUnitId = null;
    this.events.emit('unit:selected', { unitId: null });

    // Reinforcements arrive before anything else happens in the enemy phase.
    this.spawnWave();
    if (this.phase !== 'enemy') {
      return true;
    }

    this.beginTurn('enemy');
    if (this.phase !== 'enemy') {
      return true;
    }

    this.aiQueue = this.autoEnemyAi
      ? [...this.units.values()]
          .filter((u) => u.alive && u.team === 'enemy' && !UNIT_TYPES[u.typeId].isFlagship)
          .map((u) => u.id)
      : [];

    if (this.autoEnemyAi && this.aiQueue.length === 0) {
      this.finishEnemyTurn();
    }
    return true;
  }

  /**
   * Advances the built-in enemy AI by one unit. Call on a throttle.
   * @returns true while enemy phase is still running
   */
  tickAi(): boolean {
    if (this.phase !== 'enemy' || !this.autoEnemyAi) {
      return false;
    }

    while (this.aiQueue.length > 0) {
      const id = this.aiQueue.shift()!;
      const unit = this.units.get(id);
      if (unit && unit.alive) {
        this.aiAct(unit);
        break;
      }
    }

    if (this.phase !== 'enemy') {
      this.aiQueue = [];
      return false;
    }
    if (this.aiQueue.length === 0) {
      this.finishEnemyTurn();
      return false;
    }
    return true;
  }

  private finishEnemyTurn(): void {
    if (this.phase !== 'enemy') {
      return;
    }
    this.events.emit('turn:end', { team: 'enemy', turnNumber: this.turnNumber });
    this.resetTurnFlags();
    this.turnNumber += 1;

    if (Number.isFinite(this.maxTurns) && this.turnNumber > this.maxTurns) {
      this.endBattle(null, 'turn_limit');
      return;
    }

    this.phase = 'player';
    this.beginTurn('player');
  }

  /**
   * Common turn-start hook: resets flank tracking, pays income, emits
   * `turn:start`, regenerates flagship shields and lets structures fire.
   */
  private beginTurn(team: Team): void {
    this.attacksThisTurn.clear();

    this.energy[team] += this.incomeFor(team);
    this.events.emit('energy:changed', { team, energy: this.energy[team] });
    this.events.emit('turn:start', {
      team,
      turnNumber: this.turnNumber,
      energy: this.energy[team],
    });

    for (const u of this.units.values()) {
      if (!u.alive || u.team !== team || !UNIT_TYPES[u.typeId].isFlagship) {
        continue;
      }
      if (u.shieldRegen > 0 && u.shield < u.maxShield) {
        u.shield = Math.min(u.maxShield, u.shield + u.shieldRegen);
        this.events.emit('unit:updated', { unitId: u.id });
      }
      const target = this.pickAiTarget(u);
      if (target && hexDistance(u, target) <= this.effectiveRange(u)) {
        this.resolveAttack(u, target);
        if (this.phase === 'ended') {
          return;
        }
      }
    }
  }

  // -------------------------------------------------------------------
  // Spawning
  // -------------------------------------------------------------------

  private spawnWave(): void {
    if (!this.waveSchedule) {
      return;
    }
    const wave = getWave(this.waveSchedule, this.turnNumber, this.loopWaves);
    if (wave.length === 0) {
      return;
    }
    const flagship = this.getFlagship('enemy');
    if (!flagship || !flagship.alive) {
      return;
    }

    const living = [...this.units.values()].filter(
      (u) => u.alive && u.team === 'enemy' && !UNIT_TYPES[u.typeId].isFlagship,
    ).length;
    const room = Math.max(0, MAX_ENEMY_FIELD_SHIPS - living);
    if (room === 0) {
      return;
    }

    const spawned: BattleUnit[] = [];
    for (const typeId of wave.slice(0, room)) {
      const hex = this.findSpawnHex(flagship);
      if (!hex) {
        break;
      }
      spawned.push({ ...this.spawnUnit('enemy', typeId, hex, 'wave') });
    }

    if (spawned.length > 0) {
      this.events.emit('wave:spawned', {
        turnNumber: this.turnNumber,
        team: 'enemy',
        units: spawned,
      });
    }
  }

  private spawnUnit(team: Team, typeId: UnitId, hex: Axial, source: 'wave' | 'recruit'): BattleUnit {
    this.spawnCounter += 1;
    const id = `${source === 'wave' ? 'w' : 'r'}${this.turnNumber}_${team[0]}${this.spawnCounter}`;
    const unit = this.buildUnit({ id, typeId, team, q: hex.q, r: hex.r }, false);
    this.units.set(id, unit);
    this.events.emit('unit:spawned', { unit: { ...unit }, source });
    return unit;
  }

  /**
   * Nearest free grid hex to `center` by hexDistance (ring 1 first, then
   * outward). Ties resolve in ring order, so the result is deterministic.
   */
  private findSpawnHex(center: Axial): Axial | null {
    const maxRadius = this.grid.cols + this.grid.rows;
    for (let radius = 1; radius <= maxRadius; radius++) {
      const ring = getHexesInRange(center, radius).filter(
        (h) => hexDistance(center, h) === radius && this.grid.has(h.q, h.r) && !this.isOccupied(h.q, h.r),
      );
      if (ring.length > 0) {
        return ring[0];
      }
    }
    return null;
  }

  // -------------------------------------------------------------------
  // AI heuristic
  // -------------------------------------------------------------------

  private aiAct(unit: BattleUnit): void {
    let target = this.pickAiTarget(unit);
    if (!unit.hasAttacked && target && hexDistance(unit, target) <= this.effectiveRange(unit)) {
      this.resolveAttack(unit, target);
      return;
    }

    const nearest = this.pickAiTarget(unit);
    if (!nearest) {
      return;
    }

    if (!unit.hasMoved && unit.moveRange > 0) {
      const stepTarget = this.bestAiMove(unit, nearest);
      if (stepTarget) {
        const from = { q: unit.q, r: unit.r };
        const path = findPath(
          this.grid,
          from,
          stepTarget,
          (q, r) => this.isOccupied(q, r),
          unit.moveRange,
        );
        if (path && path.length >= 2) {
          unit.q = stepTarget.q;
          unit.r = stepTarget.r;
          unit.hasMoved = true;
          this.events.emit('unit:moved', {
            unitId: unit.id,
            from,
            to: { ...stepTarget },
            path,
          });
        }
      }
    }

    if (this.phase === 'ended' || unit.hasAttacked) {
      return;
    }

    target = this.pickAiTarget(unit);
    if (target && hexDistance(unit, target) <= this.effectiveRange(unit)) {
      this.resolveAttack(unit, target);
    }
  }

  private bestAiMove(unit: BattleUnit, focus: BattleUnit): Axial | null {
    const reachable = getReachable(
      this.grid,
      { q: unit.q, r: unit.r },
      unit.moveRange,
      (q, r) => this.isOccupied(q, r),
    );
    if (reachable.length === 0) {
      return null;
    }

    let best: Axial | null = null;
    let bestScore = Infinity;

    for (const cell of reachable) {
      const dist = hexDistance(cell, focus);
      // Range depends on the destination's terrain (asteroid cover shortens it).
      const rangeThere = this.effectiveRange({ q: cell.q, r: cell.r, range: unit.range });
      const inRange = dist <= rangeThere ? 0 : 1;
      const score = inRange * 1000 + dist;
      if (score < bestScore) {
        bestScore = score;
        best = cell;
      }
    }

    return best;
  }

  /** Nearest living foe; ties broken by lowest HP. */
  private pickAiTarget(unit: BattleUnit): BattleUnit | null {
    const foes = [...this.units.values()].filter((t) => t.alive && t.team !== unit.team);
    if (foes.length === 0) {
      return null;
    }
    foes.sort((a, b) => {
      const da = hexDistance(unit, a);
      const db = hexDistance(unit, b);
      if (da !== db) {
        return da - db;
      }
      return a.hp - b.hp;
    });
    return foes[0];
  }

  // -------------------------------------------------------------------
  // Combat
  // -------------------------------------------------------------------

  /**
   * Final damage of `attacker` against `target` with a flank multiplier
   * applied, then ASTEROID cover (-40%, rounded down).
   */
  computeDamage(
    attacker: Pick<BattleUnit, 'damage'>,
    target: Pick<BattleUnit, 'q' | 'r'>,
    multiplier = 1,
  ): number {
    let dmg = attacker.damage * multiplier;
    if (this.grid.getType(target.q, target.r) === HexType.ASTEROID) {
      dmg = dmg * (1 - ASTEROID_DAMAGE_REDUCTION);
    }
    return Math.max(0, Math.floor(dmg));
  }

  /**
   * Shield absorbs first, overflow hits the hull (GDD §5). Flanking: when a
   * second attacker of the same team hits from the hex opposite to a previous
   * attacker this phase, both attacks are ×FLANK_MULTIPLIER — the earlier one
   * retroactively via `combat:flank`.
   */
  private resolveAttack(attacker: BattleUnit, target: BattleUnit): void {
    attacker.hasAttacked = true;

    const records = this.attacksThisTurn.get(target.id) ?? [];
    const partner = records.find(
      (rec) => rec.team === attacker.team && areOppositeNeighbors(target, attacker, rec.hex),
    );

    const multiplier = partner ? FLANK_MULTIPLIER : 1;
    const damage = this.computeDamage(attacker, target, multiplier);
    this.applyDamage(target, damage);

    this.events.emit('unit:attacked', {
      attackerId: attacker.id,
      targetId: target.id,
      damage,
      remainingHp: target.hp,
      remainingShield: target.shield,
      flanked: partner !== undefined,
    });

    if (partner) {
      const first = this.units.get(partner.attackerId);
      if (first) {
        const base = this.computeDamage(first, target, 1);
        const boosted = this.computeDamage(first, target, FLANK_MULTIPLIER);
        const bonus = Math.max(0, boosted - base);
        if (bonus > 0) {
          this.applyDamage(target, bonus);
        }
        this.events.emit('combat:flank', {
          targetId: target.id,
          attackerIds: [partner.attackerId, attacker.id],
          bonusDamage: bonus,
        });
      }
    }

    records.push({ attackerId: attacker.id, hex: { q: attacker.q, r: attacker.r }, team: attacker.team });
    this.attacksThisTurn.set(target.id, records);

    if (target.hp <= 0) {
      target.alive = false;
      target.hp = 0;
      this.events.emit('unit:died', { unitId: target.id });
      this.checkBattleEnd();
    }
  }

  private applyDamage(target: BattleUnit, amount: number): void {
    let remaining = amount;
    if (target.shield > 0) {
      const absorbed = Math.min(target.shield, remaining);
      target.shield -= absorbed;
      remaining -= absorbed;
    }
    target.hp = Math.max(0, target.hp - remaining);
  }

  // -------------------------------------------------------------------
  // End conditions
  // -------------------------------------------------------------------

  /**
   * A team is defeated when its flagship is destroyed (GDD §2), or — on maps
   * without an flagship — when it has no living units left.
   */
  private isDefeated(team: Team): boolean {
    const all = [...this.units.values()].filter((u) => u.team === team);
    const flagships = all.filter((u) => UNIT_TYPES[u.typeId].isFlagship);
    if (flagships.length > 0) {
      return flagships.every((u) => !u.alive);
    }
    return !all.some((u) => u.alive);
  }

  private checkBattleEnd(): void {
    const playerLost = this.isDefeated('player');
    const enemyLost = this.isDefeated('enemy');
    if (!playerLost && !enemyLost) {
      return;
    }
    const hasflagships = [...this.units.values()].some((u) => UNIT_TYPES[u.typeId].isFlagship);
    this.endBattle(playerLost ? 'enemy' : 'player', hasflagships ? 'flagship' : 'elimination');
  }

  private endBattle(winner: Team | null, reason: BattleEndReason): void {
    this.phase = 'ended';
    this.aiQueue = [];
    this.selectedUnitId = null;
    this.endInfo = { winner, reason };
    this.events.emit('battle:ended', { winner, reason, turnNumber: this.turnNumber });
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  private canAct(unit: BattleUnit | undefined): unit is BattleUnit {
    if (this.phase === 'ended') {
      this.reject('Battle ended');
      return false;
    }
    if (!unit || !unit.alive) {
      this.reject('Invalid unit');
      return false;
    }
    if (unit.team !== this.phase) {
      this.reject(`Not ${unit.team} phase`);
      return false;
    }
    return true;
  }

  private resetTurnFlags(): void {
    for (const u of this.units.values()) {
      if (u.alive) {
        u.hasMoved = false;
        u.hasAttacked = false;
      }
    }
  }

  private isOccupied(q: number, r: number): boolean {
    for (const u of this.units.values()) {
      if (u.alive && u.q === q && u.r === r) {
        return true;
      }
    }
    return false;
  }

  private reject(reason: string): void {
    this.events.emit('action:rejected', { reason });
  }
}

/** Convenience: occupied check key for external tools. */
export function unitCellKey(unit: Pick<BattleUnit, 'q' | 'r'>): string {
  return hexKey(unit.q, unit.r);
}
