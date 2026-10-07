import type { UnitId } from '../config/units';

export type Team = 'player' | 'enemy';

/** Runtime battle unit — plain data, no rendering. */
export interface BattleUnit {
  id: string;
  typeId: UnitId;
  team: Team;
  q: number;
  r: number;
  /** Hull. For the flagship this is damaged only after `shield` hits 0. */
  hp: number;
  maxHp: number;
  /** Separate pool from `hp` — never sum the two. 0 for ships. */
  shield: number;
  maxShield: number;
  shieldRegen: number;
  damage: number;
  range: number;
  moveRange: number;
  hasMoved: boolean;
  hasAttacked: boolean;
  alive: boolean;
}

export interface UnitSpawn {
  id: string;
  typeId: UnitId;
  team: Team;
  q: number;
  r: number;
  /** Stat overrides on top of UNIT_TYPES — for tests and scripted scenarios. */
  overrides?: Partial<Pick<BattleUnit, 'hp' | 'damage' | 'range' | 'moveRange' | 'shield'>>;
}
