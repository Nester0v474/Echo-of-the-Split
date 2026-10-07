import type { UnitSpawn } from '../entities/Unit';
import { HexGrid, HexType, hexKey, type Axial } from '../systems/HexGrid';
import type { Difficulty } from '../systems/Settings';
import { HEX_COLS, HEX_ROWS } from './constants';
import type { MissionDef } from './campaign';
import type { UnitId } from './units';

/** Static description of one battle map: size, terrain and starting units. */
export interface BattleMap {
  cols: number;
  rows: number;
  asteroids: readonly Axial[];
  resources: readonly Axial[];
  spawns: readonly UnitSpawn[];
}

/** odd-r offset (col,row) -> axial, matches HexGrid cell generation. */
function at(col: number, row: number): Axial {
  return { q: col - (row - (row & 1)) / 2, r: row };
}

function spawn(id: string, typeId: UnitSpawn['typeId'], team: UnitSpawn['team'], col: number, row: number): UnitSpawn {
  return { id, typeId, team, ...at(col, row) };
}

/** Flagship hexes and ship slots (closest to the flagship first). */
export const PLAYER_FLAGSHIP = at(0, 4);
export const ENEMY_FLAGSHIP = at(14, 4);
export const PLAYER_SLOTS: readonly Axial[] = [at(1, 3), at(1, 5), at(2, 4), at(2, 2), at(2, 6), at(3, 4)];
export const ENEMY_SLOTS: readonly Axial[] = [at(13, 3), at(13, 5), at(12, 4), at(12, 2), at(12, 6), at(11, 4)];

/** First-mission layout: fleets start close enough to finish in 6–8 turns. */
export const CLOSE_PLAYER_FLAGSHIP = at(4, 4);
export const CLOSE_ENEMY_FLAGSHIP = at(10, 4);
export const CLOSE_PLAYER_SLOTS: readonly Axial[] = [at(5, 3), at(5, 5), at(6, 4), at(6, 2), at(6, 6), at(7, 4)];
export const CLOSE_ENEMY_SLOTS: readonly Axial[] = [at(9, 3), at(9, 5), at(8, 4), at(8, 2), at(8, 6), at(7, 5)];

/**
 * Demo / test map shared by BattleScene and the headless simulator.
 * Landscape 15x9: player flagship on the far left, enemy on the far right.
 */
export const DEMO_MAP: BattleMap = {
  cols: HEX_COLS,
  rows: HEX_ROWS,
  // Mid-field cover reachable by both sides.
  asteroids: [at(7, 4), at(6, 2), at(8, 6)],
  // GDD §9 normal difficulty: 4 resource hexes, two per half.
  resources: [at(4, 1), at(4, 7), at(10, 1), at(10, 7)],
  spawns: [
    spawn('p_flag', 'flagship', 'player', 0, 4),
    spawn('p1', 'fighter', 'player', 1, 3),
    spawn('p2', 'scout', 'player', 1, 5),
    spawn('p3', 'artillery', 'player', 2, 4),

    spawn('e_flag', 'flagship', 'enemy', 14, 4),
    spawn('e1', 'fighter', 'enemy', 13, 3),
    spawn('e2', 'cruiser', 'enemy', 13, 5),
    spawn('e3', 'scout', 'enemy', 12, 4),
    spawn('e4', 'fighter', 'enemy', 12, 2),
  ],
};

function layoutFor(mission: MissionDef): {
  playerFlag: Axial;
  enemyFlag: Axial;
  playerSlots: readonly Axial[];
  enemySlots: readonly Axial[];
} {
  if (mission.rules.closeQuarters) {
    return {
      playerFlag: CLOSE_PLAYER_FLAGSHIP,
      enemyFlag: CLOSE_ENEMY_FLAGSHIP,
      playerSlots: CLOSE_PLAYER_SLOTS,
      enemySlots: CLOSE_ENEMY_SLOTS,
    };
  }
  return {
    playerFlag: PLAYER_FLAGSHIP,
    enemyFlag: ENEMY_FLAGSHIP,
    playerSlots: PLAYER_SLOTS,
    enemySlots: ENEMY_SLOTS,
  };
}

/** Spawn list for a campaign mission on the demo terrain. */
export function buildMissionSpawns(mission: MissionDef): UnitSpawn[] {
  const r = mission.rules;
  const layout = layoutFor(mission);
  const out: UnitSpawn[] = [
    { id: 'p_flag', typeId: 'flagship', team: 'player', ...layout.playerFlag },
    {
      id: 'e_flag',
      typeId: 'flagship',
      team: 'enemy',
      ...layout.enemyFlag,
      overrides: {
        ...(r.enemyFlagshipShield !== undefined ? { shield: r.enemyFlagshipShield } : {}),
        ...(r.enemyFlagshipHp !== undefined ? { hp: r.enemyFlagshipHp } : {}),
      },
    },
  ];
  const place = (fleet: readonly UnitId[], slots: readonly Axial[], team: 'player' | 'enemy', prefix: string) => {
    fleet.slice(0, slots.length).forEach((typeId, i) => {
      out.push({ id: `${prefix}${i + 1}`, typeId, team, ...slots[i] });
    });
  };
  place(r.playerFleet, layout.playerSlots, 'player', 'p');
  place(r.enemyFleet, layout.enemySlots, 'enemy', 'e');
  return out;
}

/** Easy is the full set; each step up removes one resource and one asteroid. */
export function terrainCounts(difficulty: Difficulty): { resources: number; asteroids: number } {
  const step = difficulty === 'easy' ? 0 : difficulty === 'normal' ? 1 : 2;
  return {
    resources: Math.max(1, 4 - step),
    asteroids: Math.max(1, 3 - step),
  };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = out[i]!;
    out[i] = out[j]!;
    out[j] = swap;
  }
  return out;
}

/**
 * Fresh resource / asteroid layout for one battle. Never lands on a starting ship.
 * Resources prefer the flanks; asteroids prefer the middle.
 */
export function generateBattleTerrain(options: {
  difficulty: Difficulty;
  reserved: readonly Axial[];
  cols?: number;
  rows?: number;
  rng?: () => number;
}): { asteroids: Axial[]; resources: Axial[] } {
  const cols = options.cols ?? HEX_COLS;
  const rows = options.rows ?? HEX_ROWS;
  const rng = options.rng ?? Math.random;
  const counts = terrainCounts(options.difficulty);
  const blocked = new Set(options.reserved.map((cell) => hexKey(cell.q, cell.r)));

  const free: { col: number; axial: Axial }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const axial = at(col, row);
      if (!blocked.has(hexKey(axial.q, axial.r))) {
        free.push({ col, axial });
      }
    }
  }

  const taken = new Set<string>();
  const take = (pool: { col: number; axial: Axial }[]): Axial | null => {
    while (pool.length > 0) {
      const cell = pool.pop()!;
      const key = hexKey(cell.axial.q, cell.axial.r);
      if (!taken.has(key)) {
        taken.add(key);
        return cell.axial;
      }
    }
    return null;
  };

  const left = shuffle(
    free.filter((cell) => cell.col <= 5),
    rng,
  );
  const right = shuffle(
    free.filter((cell) => cell.col >= 9),
    rng,
  );
  const mid = shuffle(
    free.filter((cell) => cell.col >= 6 && cell.col <= 8),
    rng,
  );
  const leftover = shuffle(free, rng);

  const resources: Axial[] = [];
  for (let i = 0; i < counts.resources; i++) {
    const pick = (i % 2 === 0 ? take(left) : take(right)) ?? take(leftover);
    if (pick) {
      resources.push(pick);
    }
  }

  const asteroids: Axial[] = [];
  for (let i = 0; i < counts.asteroids; i++) {
    const pick = take(mid) ?? take(leftover);
    if (pick) {
      asteroids.push(pick);
    }
  }

  return { asteroids, resources };
}

/** Builds a HexGrid with the map's terrain applied. */
export function createGridFromMap(map: BattleMap, hexSize?: number): HexGrid {
  const grid = new HexGrid(map.cols, map.rows, hexSize);
  for (const a of map.asteroids) {
    grid.setType(a.q, a.r, HexType.ASTEROID);
  }
  for (const r of map.resources) {
    grid.setType(r.q, r.r, HexType.RESOURCE);
  }
  return grid;
}
