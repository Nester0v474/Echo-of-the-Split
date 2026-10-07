/**
 * Headless battle simulator — no Phaser, drives BattleSystem directly.
 *
 *   npm run simulate                 # 200 symmetric battles on DEMO_MAP
 *   npm run simulate -- --runs 500   # more runs
 *   npm run simulate -- --waves      # enemy also receives GDD §8 waves
 *   npm run simulate -- --turns 10   # override the turn limit
 *   npm run simulate -- --seed 7     # deterministic tie-breaking
 *
 * Both sides use the same controller (see `SimController`):
 *   - save energy for the first 2 turns, then buy by priority
 *     artillery > cruiser > fighter > scout while affordable;
 *   - every ship: attack if a foe is in range, else move toward the nearest
 *     foe and attack if possible (BattleSystem.runUnitAi).
 */
import { DEMO_MAP, createGridFromMap, type BattleMap } from '../config/battleMap';
import { MAX_TURNS } from '../config/constants';
import { UNIT_TYPES } from '../config/units';
import { WAVE_SCHEDULE } from '../config/waveSchedule';
import type { Team } from '../entities/Unit';
import { BattleSystem, RECRUIT_PRIORITY, type BattleEndReason } from '../systems/BattleSystem';

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export interface SimController {
  /** Called once per phase for the acting team, before endTurn(). */
  playTurn(battle: BattleSystem, team: Team, rng: () => number): void;
}

const SAVE_TURNS = 2;

export const heuristicController: SimController = {
  playTurn(battle, team, rng) {
    // 1. Economy
    if (battle.getTurnNumber() > SAVE_TURNS) {
      let bought = true;
      while (bought && battle.getPhase() === team) {
        bought = false;
        for (const typeId of RECRUIT_PRIORITY) {
          if (battle.getEnergy(team) >= UNIT_TYPES[typeId].cost) {
            if (battle.recruit(team, typeId)) {
              bought = true;
            }
            break;
          }
        }
      }
    }

    // 2. Ships — shuffle so identical fleets don't always act in spawn order.
    const ships = battle
      .getUnits()
      .filter((u) => u.alive && u.team === team && !UNIT_TYPES[u.typeId].isFlagship);
    shuffle(ships, rng);
    for (const u of ships) {
      if (battle.getPhase() !== team) {
        break;
      }
      battle.runUnitAi(u.id);
    }
  },
};

// ---------------------------------------------------------------------------
// Single battle
// ---------------------------------------------------------------------------

export interface SimResult {
  winner: Team | null;
  reason: BattleEndReason;
  endTurn: number;
  /** Ships (non-structures) lost by each side. */
  losses: Record<Team, number>;
  /** Ships fielded by each side, including recruits and waves. */
  fielded: Record<Team, number>;
}

export interface SimOptions {
  map?: BattleMap;
  waves?: boolean;
  maxTurns?: number;
  controller?: SimController;
  rng?: () => number;
}

export function simulateBattle(opts: SimOptions = {}): SimResult {
  const map = opts.map ?? DEMO_MAP;
  const controller = opts.controller ?? heuristicController;
  const rng = opts.rng ?? Math.random;

  const grid = createGridFromMap(map);
  const battle = new BattleSystem(grid, {
    autoEnemyAi: false,
    waveSchedule: opts.waves ? WAVE_SCHEDULE : null,
    maxTurns: opts.maxTurns ?? MAX_TURNS,
  });

  const losses: Record<Team, number> = { player: 0, enemy: 0 };
  const fielded: Record<Team, number> = { player: 0, enemy: 0 };
  battle.events.on('unit:died', ({ unitId }) => {
    const u = battle.getUnit(unitId);
    if (u && !UNIT_TYPES[u.typeId].isFlagship) {
      losses[u.team] += 1;
    }
  });
  battle.events.on('unit:spawned', ({ unit }) => {
    fielded[unit.team] += 1;
  });

  battle.start(map.spawns);
  for (const s of map.spawns) {
    if (!UNIT_TYPES[s.typeId].isFlagship) {
      fielded[s.team] += 1;
    }
  }

  // Safety valve against a controller that never ends its phase.
  let guard = 0;
  while (battle.getPhase() !== 'ended' && guard++ < 10_000) {
    const team = battle.getPhase() as Team;
    controller.playTurn(battle, team, rng);
    if (battle.getPhase() === team) {
      battle.endTurn();
    }
  }

  const end = battle.getEndInfo() ?? { winner: null, reason: 'turn_limit' as const };
  return {
    winner: end.winner,
    reason: end.reason,
    endTurn: Math.min(battle.getTurnNumber(), battle.maxTurns),
    losses,
    fielded,
  };
}

// ---------------------------------------------------------------------------
// Batch + report
// ---------------------------------------------------------------------------

export interface SimStats {
  runs: number;
  playerWins: number;
  enemyWins: number;
  draws: number;
  avgEndTurn: number;
  /** Mean ships lost by the winning side (decided battles only). */
  avgWinnerLosses: number;
  avgPlayerLosses: number;
  avgEnemyLosses: number;
  byReason: Record<BattleEndReason, number>;
}

export function simulateMany(runs: number, opts: SimOptions = {}): SimStats {
  const stats: SimStats = {
    runs,
    playerWins: 0,
    enemyWins: 0,
    draws: 0,
    avgEndTurn: 0,
    avgWinnerLosses: 0,
    avgPlayerLosses: 0,
    avgEnemyLosses: 0,
    byReason: { flagship: 0, elimination: 0, turn_limit: 0 },
  };
  let turnSum = 0;
  let winnerLossSum = 0;
  let decided = 0;
  let pLoss = 0;
  let eLoss = 0;

  for (let i = 0; i < runs; i++) {
    const r = simulateBattle(opts);
    turnSum += r.endTurn;
    pLoss += r.losses.player;
    eLoss += r.losses.enemy;
    stats.byReason[r.reason] += 1;
    if (r.winner === 'player') {
      stats.playerWins += 1;
    } else if (r.winner === 'enemy') {
      stats.enemyWins += 1;
    } else {
      stats.draws += 1;
    }
    if (r.winner) {
      decided += 1;
      winnerLossSum += r.losses[r.winner];
    }
  }

  stats.avgEndTurn = turnSum / runs;
  stats.avgWinnerLosses = decided > 0 ? winnerLossSum / decided : 0;
  stats.avgPlayerLosses = pLoss / runs;
  stats.avgEnemyLosses = eLoss / runs;
  return stats;
}

export function formatStats(s: SimStats, label: string): string {
  const pct = (n: number) => `${((100 * n) / s.runs).toFixed(1)}%`;
  const lines = [
    `=== ${label} (${s.runs} runs) ===`,
    `player wins : ${pct(s.playerWins)}  (${s.playerWins})`,
    `enemy wins  : ${pct(s.enemyWins)}  (${s.enemyWins})`,
    `turn limit  : ${pct(s.draws)}  (${s.draws})`,
    `avg end turn: ${s.avgEndTurn.toFixed(2)}`,
    `avg ships lost by winner: ${s.avgWinnerLosses.toFixed(2)}`,
    `avg ships lost player/enemy: ${s.avgPlayerLosses.toFixed(2)} / ${s.avgEnemyLosses.toFixed(2)}`,
    `end reasons: flagship ${s.byReason.flagship}, elimination ${s.byReason.elimination}, turn_limit ${s.byReason.turn_limit}`,
  ];
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function shuffle<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/** Small deterministic PRNG (mulberry32). */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The project tsconfig targets the browser (no @types/node); read argv via globalThis.
const nodeProcess = (globalThis as { process?: { argv?: string[]; env?: Record<string, string | undefined> } })
  .process;
const argv: readonly string[] = nodeProcess?.argv ?? [];

function readArg(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/**
 * vite-node strips the script path from argv, so "am I the entry?" is decided
 * by environment: run under Node (not the browser) and not inside vitest.
 */
const isDirectRun =
  nodeProcess !== undefined && typeof window === 'undefined' && !nodeProcess.env?.VITEST;

if (isDirectRun) {
  const runs = Number(readArg('runs') ?? 200);
  const waves = argv.includes('--waves');
  const maxTurns = readArg('turns') ? Number(readArg('turns')) : undefined;
  const seedArg = readArg('seed');
  const rng = seedArg !== undefined ? seededRng(Number(seedArg)) : Math.random;

  const t0 = Date.now();
  const stats = simulateMany(runs, { waves, maxTurns, rng });
  const label = waves ? 'symmetric AI + enemy waves (GDD §8)' : 'symmetric AI, no waves';
  console.log(formatStats(stats, label));
  console.log(`(${Date.now() - t0} ms)`);
}
