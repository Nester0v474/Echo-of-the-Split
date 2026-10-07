import { describe, expect, it } from 'vitest';
import { WAVE_SCHEDULE, getUpcomingWave, getWave } from './waveSchedule';

describe('getUpcomingWave', () => {
  it('on player turn 1 points at the first scheduled wave', () => {
    expect(getUpcomingWave(WAVE_SCHEDULE, 1, 'player', true)).toEqual({
      turn: 2,
      inTurns: 1,
      types: ['scout'],
    });
  });

  it('on player turn 2 says the wave arrives this turn', () => {
    expect(getUpcomingWave(WAVE_SCHEDULE, 2, 'player', true)).toEqual({
      turn: 2,
      inTurns: 0,
      types: ['scout'],
    });
  });

  it('after that wave has spawned looks at the next one', () => {
    expect(getUpcomingWave(WAVE_SCHEDULE, 2, 'enemy', true)).toEqual({
      turn: 3,
      inTurns: 1,
      types: ['fighter'],
    });
  });

  it('keeps forecasting after the opening script', () => {
    const next = getUpcomingWave(WAVE_SCHEDULE, 7, 'enemy', true);
    expect(next).not.toBeNull();
    expect(next!.turn).toBeGreaterThan(7);
    expect(next!.types.length).toBeGreaterThan(0);
  });

  it('returns null when waves are off or the battle ended', () => {
    expect(getUpcomingWave(null, 1, 'player', true)).toBeNull();
    expect(getUpcomingWave({ 2: ['scout'] }, 3, 'player', false)).toBeNull();
    expect(getUpcomingWave(WAVE_SCHEDULE, 1, 'ended', true)).toBeNull();
  });
});

describe('loopWave', () => {
  it('does not empty out after turn 7 and rests every fourth beat', () => {
    const later = [8, 9, 10, 11, 12, 13, 14, 15].map((turn) => getWave(WAVE_SCHEDULE, turn, true));
    expect(later.some((wave) => wave.length > 0)).toBe(true);
    expect(later.filter((wave) => wave.length === 0).length).toBeGreaterThan(0);
    expect(later.every((wave) => wave.length <= 1)).toBe(true);
  });
});
