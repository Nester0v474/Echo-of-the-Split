import { describe, expect, it } from 'vitest';
import { DEMO_MAP, generateBattleTerrain, terrainCounts } from './battleMap';
import { hexKey } from '../systems/HexGrid';

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('battle terrain', () => {
  it('drops one resource and one asteroid per difficulty step', () => {
    expect(terrainCounts('easy')).toEqual({ resources: 4, asteroids: 3 });
    expect(terrainCounts('normal')).toEqual({ resources: 3, asteroids: 2 });
    expect(terrainCounts('hard')).toEqual({ resources: 2, asteroids: 1 });
  });

  it('places the requested counts and never overlaps ships or itself', () => {
    const reserved = DEMO_MAP.spawns;
    const reservedKeys = new Set(reserved.map((cell) => hexKey(cell.q, cell.r)));
    const terrain = generateBattleTerrain({
      difficulty: 'normal',
      reserved,
      rng: seeded(42),
    });

    expect(terrain.resources).toHaveLength(3);
    expect(terrain.asteroids).toHaveLength(2);

    const keys = [...terrain.resources, ...terrain.asteroids].map((cell) => hexKey(cell.q, cell.r));
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(reservedKeys.has(key)).toBe(false);
    }
  });

  it('changes layout when the rng changes', () => {
    const a = generateBattleTerrain({ difficulty: 'easy', reserved: DEMO_MAP.spawns, rng: seeded(1) });
    const b = generateBattleTerrain({ difficulty: 'easy', reserved: DEMO_MAP.spawns, rng: seeded(99) });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});
