import type { UnitId } from './units';

/** Enemy reinforcements that arrive at the start of the enemy phase (GDD §8). */
export type WaveSchedule = Readonly<Record<number, readonly UnitId[]>>;

/** First seven turns: a scripted opening. Later turns keep looping. */
export const WAVE_SCHEDULE: WaveSchedule = {
  2: ['scout'],
  3: ['fighter'],
  4: ['fighter'],
  5: ['scout'],
  6: ['artillery'],
  7: ['fighter'],
};

/** Living enemy ships (not the flagship) allowed on the field at once. */
export const MAX_ENEMY_FIELD_SHIPS = 5;

export function getWave(schedule: WaveSchedule, turnNumber: number, loop = false): readonly UnitId[] {
  if (Object.prototype.hasOwnProperty.call(schedule, turnNumber)) {
    return schedule[turnNumber] ?? [];
  }
  if (!loop || turnNumber < 2) {
    return [];
  }
  return loopWave(turnNumber);
}

/**
 * After the opening: one ship most turns, a rest every fourth, heavy ships rarely.
 * Player income can answer this without the field flooding.
 */
export function loopWave(turnNumber: number): readonly UnitId[] {
  const beat = turnNumber - 2;
  const slot = ((beat % 4) + 4) % 4;
  const cycle = Math.floor(beat / 4);
  if (slot === 2) {
    return [];
  }
  if (slot === 0) {
    return ['scout'];
  }
  if (slot === 1) {
    return cycle % 2 === 0 ? ['fighter'] : ['scout'];
  }
  if (cycle > 0 && cycle % 4 === 3) {
    return ['cruiser'];
  }
  if (cycle % 2 === 1) {
    return ['artillery'];
  }
  return ['fighter'];
}

export interface UpcomingWave {
  turn: number;
  /** 0 = arrives when the player ends this turn. */
  inTurns: number;
  types: readonly UnitId[];
}

/**
 * Next reinforcement after the current moment.
 * Waves spawn at the start of the enemy phase of `turn`.
 */
export function getUpcomingWave(
  schedule: WaveSchedule | null | undefined,
  turnNumber: number,
  phase: 'player' | 'enemy' | 'ended',
  loop = false,
): UpcomingWave | null {
  if (!schedule || phase === 'ended') {
    return null;
  }
  const minTurn = phase === 'player' ? turnNumber : turnNumber + 1;
  const limit = minTurn + 12;
  for (let turn = minTurn; turn <= limit; turn++) {
    const types = getWave(schedule, turn, loop);
    if (types.length > 0) {
      return { turn, inTurns: turn - turnNumber, types };
    }
  }
  return null;
}
