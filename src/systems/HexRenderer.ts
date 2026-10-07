/**
 * HexRenderer — draws the battlefield overlay on top of a single background
 * image. The grid is NOT made of tile sprites: it is one thin stroked outline,
 * and all highlights / paths / badges are separate lightweight Graphics.
 *
 * Every world coordinate comes from `hexGrid.axialToPixel` so camera
 * scroll / zoom keep working — no hard-coded pixel offsets here.
 *
 * Layer order (bottom → top), see RenderDepth:
 *   background → grid outline → highlights / path / badges → unit sprites → VFX
 */
import Phaser from 'phaser';
import { HexType, type HexGrid, type Axial } from './HexGrid';

export const RenderDepth = {
  BACKGROUND: 0,
  TERRAIN: 0.5,
  GRID: 1,
  HIGHLIGHT: 2,
  HOVER_HINT: 3,
  PATH: 4,
  UNIT: 10,
  /** Above units: the oversized flagship sprite must not hide neighbours' HP. */
  BADGE: 11,
  VFX: 20,
  UI: 100,
} as const;

export const GRID_LINE_COLOR = 0x7dd8e8;
export const GRID_LINE_ALPHA = 0.22;
export const COLOR_MOVE = 0x4fe89a;
export const COLOR_ATTACK = 0xff6b6b;
export const COLOR_PATH = 0x4fe89a;

const BADGE_W = 30;
const BADGE_H = 16;
const BADGE_RADIUS = 4;
const BADGE_GAP = 6;
const BADGE_BG_ENEMY = 0x3a1414;
const BADGE_BG_ALLY = 0x14351a;
const BADGE_BG_SHIELD = 0x12304a;
const BADGE_BG_DAMAGE = 0x3a1414;
const BADGE_TEXT = '#e8f4ff';
const BADGE_TEXT_SHIELD = '#8fd3ff';
const BADGE_TEXT_DAMAGE = '#ffb3a7';

/** Per-scene registry so clearHighlights() can drop everything at once. */
interface SceneOverlayState {
  highlights: Phaser.GameObjects.Graphics[];
  hoverHint: Phaser.GameObjects.Graphics | null;
  path: Phaser.GameObjects.Graphics | null;
  damagePreview: HpBadge | null;
}

const sceneState = new WeakMap<Phaser.Scene, SceneOverlayState>();

function stateOf(scene: Phaser.Scene): SceneOverlayState {
  let s = sceneState.get(scene);
  if (!s) {
    s = { highlights: [], hoverHint: null, path: null, damagePreview: null };
    sceneState.set(scene, s);
    // Drop references when the scene shuts down so nothing leaks between battles.
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => sceneState.delete(scene));
  }
  return s;
}

function toPoints(corners: Array<{ x: number; y: number }>): Phaser.Geom.Point[] {
  return corners.map((c) => new Phaser.Geom.Point(c.x, c.y));
}

// ---------------------------------------------------------------------------
// Grid outline
// ---------------------------------------------------------------------------

/**
 * One Graphics object for the whole battle: a 1px outline per hex, no fill.
 * Draw once on scene create; highlights never touch this object.
 */
export function renderGridOutline(
  scene: Phaser.Scene,
  hexGrid: HexGrid,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(RenderDepth.GRID);
  g.lineStyle(1, GRID_LINE_COLOR, GRID_LINE_ALPHA);
  for (const { q, r } of hexGrid.cells.values()) {
    g.strokePoints(toPoints(hexGrid.cornerPoints(q, r)), true, true);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Terrain (static, drawn once under the grid outline)
// ---------------------------------------------------------------------------

export const COLOR_ASTEROID = 0x9aa3b2;
export const COLOR_RESOURCE = 0xffb454;

/**
 * One Graphics for all non-neutral hexes: ASTEROID — grey fill with hatching
 * (GDD §10 "астероидное поле — серое с текстурой штриховки"), RESOURCE — warm
 * accent fill with a small diamond marker.
 */
export function renderHexTypes(
  scene: Phaser.Scene,
  hexGrid: HexGrid,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(RenderDepth.TERRAIN);
  const size = hexGrid.size;

  for (const { q, r } of hexGrid.cells.values()) {
    const type = hexGrid.getType(q, r);
    if (type === HexType.NEUTRAL) {
      continue;
    }
    const pts = toPoints(hexGrid.cornerPoints(q, r));
    const c = hexGrid.axialToPixel(q, r);

    if (type === HexType.ASTEROID) {
      g.fillStyle(COLOR_ASTEROID, 0.16);
      g.fillPoints(pts, true, true);
      // Diagonal hatching clipped to the inner hex (short strokes, 45°).
      g.lineStyle(1, COLOR_ASTEROID, 0.35);
      const inner = size * 0.72;
      const step = size * 0.22;
      for (let d = -inner; d <= inner; d += step) {
        // Line x - y = d, clipped to the circle of radius `inner`.
        const half = Math.sqrt(Math.max(0, inner * inner - (d * d) / 2));
        const mx = d / 2;
        const my = -d / 2;
        const ux = Math.SQRT1_2;
        const uy = Math.SQRT1_2;
        g.lineBetween(
          c.x + mx - ux * half,
          c.y + my - uy * half,
          c.x + mx + ux * half,
          c.y + my + uy * half,
        );
      }
      g.lineStyle(1, COLOR_ASTEROID, 0.5);
      g.strokePoints(pts, true, true);
    } else if (type === HexType.RESOURCE) {
      g.fillStyle(COLOR_RESOURCE, 0.14);
      g.fillPoints(pts, true, true);
      g.lineStyle(1, COLOR_RESOURCE, 0.55);
      g.strokePoints(pts, true, true);
      const m = size * 0.22;
      g.fillStyle(COLOR_RESOURCE, 0.9);
      g.fillPoints(
        [
          new Phaser.Geom.Point(c.x, c.y - m),
          new Phaser.Geom.Point(c.x + m, c.y),
          new Phaser.Geom.Point(c.x, c.y + m),
          new Phaser.Geom.Point(c.x - m, c.y),
        ],
        true,
        true,
      );
    }
  }
  return g;
}

/**
 * Short-lived ring pulse on `hex` (used for wave arrivals). Self-destroys.
 */
export function flashHex(
  scene: Phaser.Scene,
  hexGrid: HexGrid,
  hex: Axial,
  color: number,
  durationMs = 700,
): Phaser.GameObjects.Graphics {
  // Draw in local space around the hex center so the scale tween pulses outward.
  const c = hexGrid.axialToPixel(hex.q, hex.r);
  const local = hexGrid
    .cornerPoints(hex.q, hex.r)
    .map((p) => new Phaser.Geom.Point(p.x - c.x, p.y - c.y));
  const g = scene.add.graphics({ x: c.x, y: c.y }).setDepth(RenderDepth.PATH);
  g.fillStyle(color, 0.35);
  g.fillPoints(local, true, true);
  g.lineStyle(2, color, 1);
  g.strokePoints(local, true, true);
  scene.tweens.add({
    targets: g,
    alpha: 0,
    scaleX: 1.15,
    scaleY: 1.15,
    duration: durationMs,
    ease: 'Cubic.Out',
    onComplete: () => g.destroy(),
  });
  return g;
}

// ---------------------------------------------------------------------------
// Highlights
// ---------------------------------------------------------------------------

/**
 * Fill (alpha ≈ 0.18) + 1.5px outline (alpha 1) of one hex in `color`.
 * The returned Graphics is tracked and destroyed by clearHighlights().
 */
export function highlightHex(
  scene: Phaser.Scene,
  hexGrid: HexGrid,
  hex: Axial,
  color: number,
  alpha = 0.18,
): Phaser.GameObjects.Graphics {
  const pts = toPoints(hexGrid.cornerPoints(hex.q, hex.r));
  const g = scene.add.graphics().setDepth(RenderDepth.HIGHLIGHT);
  g.fillStyle(color, alpha);
  g.fillPoints(pts, true, true);
  g.lineStyle(1.5, color, 1);
  g.strokePoints(pts, true, true);
  stateOf(scene).highlights.push(g);
  return g;
}

/** Destroys every highlight created via highlightHex(). */
export function clearHighlights(scene: Phaser.Scene): void {
  const s = stateOf(scene);
  for (const g of s.highlights) {
    g.destroy();
  }
  s.highlights.length = 0;
}

/**
 * Hover hint over an enemy: stroke-only red outline (alpha 0.6), independent
 * of the selection highlights. Only one hint exists at a time.
 */
export function showAttackHint(
  scene: Phaser.Scene,
  hexGrid: HexGrid,
  hex: Axial,
  color: number = COLOR_ATTACK,
  alpha = 0.6,
): Phaser.GameObjects.Graphics {
  const s = stateOf(scene);
  clearAttackHint(scene);
  const g = scene.add.graphics().setDepth(RenderDepth.HOVER_HINT);
  g.lineStyle(1.5, color, alpha);
  g.strokePoints(toPoints(hexGrid.cornerPoints(hex.q, hex.r)), true, true);
  s.hoverHint = g;
  return g;
}

export function clearAttackHint(scene: Phaser.Scene): void {
  const s = stateOf(scene);
  s.hoverHint?.destroy();
  s.hoverHint = null;
}

// ---------------------------------------------------------------------------
// Movement / attack path
// ---------------------------------------------------------------------------

/**
 * Dashed polyline through hex centers with an arrow head at the end.
 * Replaces any previous path; use clearMovementPath() to remove it.
 */
export function drawPath(
  scene: Phaser.Scene,
  hexGrid: HexGrid,
  hexes: readonly Axial[],
  color: number = COLOR_PATH,
): Phaser.GameObjects.Graphics | null {
  clearMovementPath(scene);
  if (hexes.length < 2) {
    return null;
  }

  const dash = hexGrid.size * 0.2;
  const gap = hexGrid.size * 0.14;
  const headLen = hexGrid.size * 0.3;
  const headHalf = hexGrid.size * 0.16;

  const g = scene.add.graphics().setDepth(RenderDepth.PATH);
  g.lineStyle(2, color, 0.95);

  const pts = hexes.map((h) => hexGrid.axialToPixel(h.q, h.r));

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const isLast = i === pts.length - 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) {
      continue;
    }
    const ux = dx / len;
    const uy = dy / len;
    // Leave room for the arrow head on the final segment.
    const usable = isLast ? len - headLen : len;

    let d = 0;
    while (d < usable) {
      const d2 = Math.min(d + dash, usable);
      g.beginPath();
      g.moveTo(a.x + ux * d, a.y + uy * d);
      g.lineTo(a.x + ux * d2, a.y + uy * d2);
      g.strokePath();
      d = d2 + gap;
    }

    if (isLast) {
      const tipX = b.x;
      const tipY = b.y;
      const baseX = tipX - ux * headLen;
      const baseY = tipY - uy * headLen;
      g.fillStyle(color, 1);
      g.fillTriangle(
        tipX,
        tipY,
        baseX + -uy * headHalf,
        baseY + ux * headHalf,
        baseX - -uy * headHalf,
        baseY - ux * headHalf,
      );
    }
  }

  stateOf(scene).path = g;
  return g;
}

/** Dashed straight line from one hex center to another with an arrow head. */
export function drawMovementPath(
  scene: Phaser.Scene,
  hexGrid: HexGrid,
  fromHex: Axial,
  toHex: Axial,
  color: number = COLOR_PATH,
): Phaser.GameObjects.Graphics | null {
  return drawPath(scene, hexGrid, [fromHex, toHex], color);
}

export function clearMovementPath(scene: Phaser.Scene): void {
  const s = stateOf(scene);
  s.path?.destroy();
  s.path = null;
}

// ---------------------------------------------------------------------------
// HP badge
// ---------------------------------------------------------------------------

export type BadgeMode = 'hp' | 'shield' | 'damage';

/**
 * Rounded 30×16 badge above the top vertex of a hex. Create once per unit,
 * then call updateText() / moveTo() — the object is never recreated on HP change.
 */
export class HpBadge {
  readonly container: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly hexGrid: HexGrid;
  private isEnemy: boolean;
  private mode: BadgeMode = 'hp';
  private stackIndex: number;

  constructor(
    scene: Phaser.Scene,
    hexGrid: HexGrid,
    hex: Axial,
    value: number | string,
    isEnemy: boolean,
    /** 0 = directly above the hex, 1 = one badge row higher, … */
    stackIndex = 0,
  ) {
    this.hexGrid = hexGrid;
    this.isEnemy = isEnemy;
    this.stackIndex = stackIndex;

    this.bg = scene.add.graphics();
    this.label = scene.add
      .text(0, 0, String(value), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: BADGE_TEXT,
      })
      .setOrigin(0.5)
      .setResolution(2);

    this.container = scene.add
      .container(0, 0, [this.bg, this.label])
      .setDepth(RenderDepth.BADGE);

    this.redrawBackground();
    this.moveTo(hex);
  }

  /** Change the displayed number without recreating anything. */
  updateText(value: number | string, mode: BadgeMode = this.mode): void {
    this.label.setText(String(value));
    if (mode !== this.mode) {
      this.mode = mode;
      this.redrawBackground();
    }
  }

  setEnemy(isEnemy: boolean): void {
    if (isEnemy !== this.isEnemy) {
      this.isEnemy = isEnemy;
      this.redrawBackground();
    }
  }

  /** Re-anchor above the top vertex of `hex` (via hexGrid.axialToPixel). */
  moveTo(hex: Axial): void {
    const c = this.hexGrid.axialToPixel(hex.q, hex.r);
    const topVertexY = c.y - this.hexGrid.size;
    const y = topVertexY - BADGE_GAP - BADGE_H / 2 - this.stackIndex * (BADGE_H + 2);
    this.container.setPosition(c.x, y);
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  destroy(): void {
    this.container.destroy(true);
  }

  private redrawBackground(): void {
    let fill: number;
    let textColor: string;
    switch (this.mode) {
      case 'shield':
        fill = BADGE_BG_SHIELD;
        textColor = BADGE_TEXT_SHIELD;
        break;
      case 'damage':
        fill = BADGE_BG_DAMAGE;
        textColor = BADGE_TEXT_DAMAGE;
        break;
      default:
        fill = this.isEnemy ? BADGE_BG_ENEMY : BADGE_BG_ALLY;
        textColor = BADGE_TEXT;
    }
    this.bg.clear();
    this.bg.fillStyle(fill, 0.92);
    this.bg.fillRoundedRect(-BADGE_W / 2, -BADGE_H / 2, BADGE_W, BADGE_H, BADGE_RADIUS);
    this.bg.lineStyle(1, 0xffffff, 0.12);
    this.bg.strokeRoundedRect(-BADGE_W / 2, -BADGE_H / 2, BADGE_W, BADGE_H, BADGE_RADIUS);
    this.label.setColor(textColor);
  }
}

/**
 * Creates an HP badge above `hex`. Store the returned badge on the unit view
 * and call badge.updateText() on HP changes.
 */
export function showHpBadge(
  scene: Phaser.Scene,
  hexGrid: HexGrid,
  hex: Axial,
  hpValue: number,
  isEnemy: boolean,
): HpBadge {
  return new HpBadge(scene, hexGrid, hex, hpValue, isEnemy);
}

/**
 * Transient "-N" badge above a target while the player is choosing an attack.
 * Sits one row above the target's HP badge. Only one preview at a time.
 */
export function showDamagePreview(
  scene: Phaser.Scene,
  hexGrid: HexGrid,
  hex: Axial,
  damage: number,
): HpBadge {
  const s = stateOf(scene);
  clearDamagePreview(scene);
  const badge = new HpBadge(scene, hexGrid, hex, `-${damage}`, true, 1);
  badge.updateText(`-${damage}`, 'damage');
  s.damagePreview = badge;
  return badge;
}

export function clearDamagePreview(scene: Phaser.Scene): void {
  const s = stateOf(scene);
  s.damagePreview?.destroy();
  s.damagePreview = null;
}

/** Everything transient: highlights, hover hint, path and damage preview. */
export function clearAllOverlays(scene: Phaser.Scene): void {
  clearHighlights(scene);
  clearAttackHint(scene);
  clearMovementPath(scene);
  clearDamagePreview(scene);
}
