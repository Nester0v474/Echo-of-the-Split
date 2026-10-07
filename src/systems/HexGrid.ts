import { HEX_SIZE } from '../config/constants';

export type Axial = { q: number; r: number };

export type Vec2 = { x: number; y: number };

/** Axial neighbor offsets for pointy-top hexes. */
const AXIAL_DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

/** Terrain type of a map cell (GDD §3). */
export enum HexType {
  NEUTRAL = 'NEUTRAL',
  /** +2 energy per turn to the team holding it. */
  RESOURCE = 'RESOURCE',
  /** Cover: incoming damage -40%, own attack range -1 (min 1). */
  ASTEROID = 'ASTEROID',
}

export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

export function parseHexKey(key: string): Axial {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

/** Pointy-top axial → pixel (origin at hex 0,0 center). */
export function axialToPixel(q: number, r: number, size: number = HEX_SIZE): Vec2 {
  const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const y = size * ((3 / 2) * r);
  return { x, y };
}

/** Round fractional cube coords to nearest hex. */
export function cubeRound(fracX: number, fracY: number, fracZ: number): Axial {
  let rx = Math.round(fracX);
  let ry = Math.round(fracY);
  let rz = Math.round(fracZ);

  const xDiff = Math.abs(rx - fracX);
  const yDiff = Math.abs(ry - fracY);
  const zDiff = Math.abs(rz - fracZ);

  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return { q: rx === 0 ? 0 : rx, r: rz === 0 ? 0 : rz };
}

/** Pixel → nearest pointy-top axial hex. */
export function pixelToAxial(x: number, y: number, size: number = HEX_SIZE): Axial {
  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / size;
  const r = ((2 / 3) * y) / size;
  return cubeRound(q, -q - r, r);
}

export function getNeighbors(q: number, r: number): Axial[] {
  return AXIAL_DIRECTIONS.map((d) => ({ q: q + d.q, r: r + d.r }));
}

/**
 * True when `a` and `b` are both neighbours of `center` and sit on opposite
 * sides of it (a - center === center - b). Used for the flanking bonus.
 */
export function areOppositeNeighbors(center: Axial, a: Axial, b: Axial): boolean {
  if (hexDistance(center, a) !== 1 || hexDistance(center, b) !== 1) {
    return false;
  }
  return a.q - center.q === center.q - b.q && a.r - center.r === center.r - b.r;
}

/** Axial distance between two hexes. */
export function hexDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** All axial hexes within `radius` of `center` (inclusive). */
export function getHexesInRange(center: Axial, radius: number): Axial[] {
  const results: Axial[] = [];
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      results.push({ q: center.q + q, r: center.r + r });
    }
  }
  return results;
}

/**
 * Rectangular map stored as axial coords (odd-r → axial).
 * Cells live in a Map keyed by "q,r".
 */
export class HexGrid {
  readonly cells: Map<string, Axial>;
  readonly cols: number;
  readonly rows: number;
  /** Distance from hex center to vertex, px. */
  readonly size: number;
  /** World-space position of hex (0,0) center. Set once by the scene. */
  private originX = 0;
  private originY = 0;

  constructor(cols: number, rows: number, size: number = HEX_SIZE) {
    this.cols = cols;
    this.rows = rows;
    this.size = size;
    this.cells = new Map();

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // odd-r offset → axial
        const q = col - (row - (row & 1)) / 2;
        const r = row;
        this.cells.set(hexKey(q, r), { q, r });
      }
    }
  }

  has(q: number, r: number): boolean {
    return this.cells.has(hexKey(q, r));
  }

  get(q: number, r: number): Axial | undefined {
    return this.cells.get(hexKey(q, r));
  }

  /** Cells default to NEUTRAL; only non-neutral cells are stored. */
  private readonly types = new Map<string, HexType>();

  setType(q: number, r: number, type: HexType): void {
    if (!this.has(q, r)) {
      throw new Error(`setType: hex (${q},${r}) is outside the grid`);
    }
    if (type === HexType.NEUTRAL) {
      this.types.delete(hexKey(q, r));
    } else {
      this.types.set(hexKey(q, r), type);
    }
  }

  getType(q: number, r: number): HexType {
    return this.types.get(hexKey(q, r)) ?? HexType.NEUTRAL;
  }

  /** All cells of the given non-neutral type. */
  cellsOfType(type: HexType): Axial[] {
    const out: Axial[] = [];
    for (const [key, t] of this.types) {
      if (t === type) {
        out.push(parseHexKey(key));
      }
    }
    return out;
  }

  /** Place hex (0,0) center at the given world position. */
  setOrigin(x: number, y: number): void {
    this.originX = x;
    this.originY = y;
  }

  /** Center the whole grid inside a viewport of the given size. */
  centerIn(viewportWidth: number, viewportHeight: number): void {
    const b = this.getPixelBounds(this.size);
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    this.setOrigin((viewportWidth - w) / 2 - b.minX, (viewportHeight - h) / 2 - b.minY);
  }

  /**
   * Axial → world pixel center of the hex (origin + hex size applied).
   * Renderers must use this instead of raw pixel math.
   */
  axialToPixel(q: number, r: number): Vec2 {
    const p = axialToPixel(q, r, this.size);
    return { x: p.x + this.originX, y: p.y + this.originY };
  }

  /** World pixel → nearest axial hex (may be outside the grid, check `has`). */
  pixelToAxial(x: number, y: number): Axial {
    return pixelToAxial(x - this.originX, y - this.originY, this.size);
  }

  /** Six world-space corner points of a hex, starting top-right, clockwise. */
  cornerPoints(q: number, r: number): Vec2[] {
    const c = this.axialToPixel(q, r);
    return hexCorners(this.size).map((o) => ({ x: c.x + o.x, y: c.y + o.y }));
  }

  /** Pixel bounds of all cell centers (plus hex radius). */
  getPixelBounds(size: number = HEX_SIZE): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const { q, r } of this.cells.values()) {
      const { x, y } = axialToPixel(q, r, size);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    return {
      minX: minX - size,
      maxX: maxX + size,
      minY: minY - size,
      maxY: maxY + size,
    };
  }
}

/** Six corner offsets for a pointy-top hex centered at origin. */
export function hexCorners(size: number = HEX_SIZE): Vec2[] {
  const corners: Vec2[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners.push({
      x: size * Math.cos(angle),
      y: size * Math.sin(angle),
    });
  }
  return corners;
}
