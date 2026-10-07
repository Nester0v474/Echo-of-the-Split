import { describe, expect, it } from 'vitest';
import {
  axialToPixel,
  pixelToAxial,
  hexDistance,
  getNeighbors,
  getHexesInRange,
  HexGrid,
  hexKey,
} from './HexGrid';

describe('axialToPixel / pixelToAxial', () => {
  it('maps origin to (0, 0)', () => {
    expect(axialToPixel(0, 0, 40)).toEqual({ x: 0, y: 0 });
  });

  it('round-trips integer axial coordinates', () => {
    const samples = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 0, r: 1 },
      { q: -2, r: 3 },
      { q: 4, r: -1 },
      { q: -3, r: -2 },
    ];

    for (const hex of samples) {
      const pixel = axialToPixel(hex.q, hex.r, 40);
      const back = pixelToAxial(pixel.x, pixel.y, 40);
      expect(back).toEqual(hex);
    }
  });

  it('resolves a pixel near a hex center to that hex', () => {
    const center = axialToPixel(2, -1, 40);
    expect(pixelToAxial(center.x + 3, center.y - 2, 40)).toEqual({ q: 2, r: -1 });
  });

  it('uses pointy-top vertical spacing of 1.5 * size', () => {
    const a = axialToPixel(0, 0, 40);
    const b = axialToPixel(0, 1, 40);
    expect(b.y - a.y).toBeCloseTo(60, 10);
  });
});

describe('hexDistance', () => {
  it('is zero for the same hex', () => {
    expect(hexDistance({ q: 3, r: -2 }, { q: 3, r: -2 })).toBe(0);
  });

  it('is one for each neighbor', () => {
    const origin = { q: 0, r: 0 };
    for (const n of getNeighbors(0, 0)) {
      expect(hexDistance(origin, n)).toBe(1);
    }
  });

  it('matches known distances', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: -1 })).toBe(2);
    expect(hexDistance({ q: 0, r: 0 }, { q: -3, r: 2 })).toBe(3);
    expect(hexDistance({ q: 1, r: -2 }, { q: -2, r: 3 })).toBe(5);
  });

  it('is symmetric', () => {
    const a = { q: 4, r: -3 };
    const b = { q: -1, r: 2 };
    expect(hexDistance(a, b)).toBe(hexDistance(b, a));
  });
});

describe('getHexesInRange', () => {
  it('returns only the center at radius 0', () => {
    expect(getHexesInRange({ q: 1, r: 1 }, 0)).toEqual([{ q: 1, r: 1 }]);
  });

  it('returns 1 + 6 cells at radius 1', () => {
    const cells = getHexesInRange({ q: 0, r: 0 }, 1);
    expect(cells).toHaveLength(7);
    for (const c of cells) {
      expect(hexDistance({ q: 0, r: 0 }, c)).toBeLessThanOrEqual(1);
    }
  });
});

describe('HexGrid Map storage', () => {
  it('stores a 9x11 rectangle with "q,r" keys', () => {
    const grid = new HexGrid(9, 11);
    expect(grid.cells.size).toBe(99);
    expect(grid.has(0, 0)).toBe(true);
    expect(grid.cells.has(hexKey(0, 0))).toBe(true);
  });
});
