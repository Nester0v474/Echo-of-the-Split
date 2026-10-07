import Phaser from 'phaser';
import { ATLAS_KEY } from '../config/constants';

const CELL = 64;

interface FrameSpec {
  name: string;
  draw: (ctx: CanvasRenderingContext2D, size: number) => void;
}

/**
 * Builds one small canvas atlas for procedural VFX (projectile, explosion).
 * Hex tiles and unit silhouettes are no longer generated here: the grid is a
 * stroked outline (HexRenderer) and units come from assets/atlases/units.png.
 */
export function createGameAtlas(scene: Phaser.Scene): void {
  // Recreate on reload so changes always apply (HMR / Boot restart).
  if (scene.textures.exists(ATLAS_KEY)) {
    scene.textures.remove(ATLAS_KEY);
  }

  const frames: FrameSpec[] = [
    { name: 'projectile', draw: drawProjectile },
    { name: 'explosion_0', draw: (c, s) => drawExplosion(c, s, 0.35) },
    { name: 'explosion_1', draw: (c, s) => drawExplosion(c, s, 0.6) },
    { name: 'explosion_2', draw: (c, s) => drawExplosion(c, s, 0.9) },
    { name: 'explosion_3', draw: (c, s) => drawExplosion(c, s, 0.45) },
  ];

  const cols = 5;
  const rows = Math.ceil(frames.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * CELL;
  canvas.height = rows * CELL;
  const ctx = canvas.getContext('2d')!;

  frames.forEach((frame, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    ctx.save();
    ctx.translate(col * CELL, row * CELL);
    frame.draw(ctx, CELL);
    ctx.restore();
  });

  const texture = scene.textures.addCanvas(ATLAS_KEY, canvas);
  if (!texture) {
    throw new Error(`Failed to create atlas ${ATLAS_KEY}`);
  }

  frames.forEach((frame, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    texture.add(frame.name, 0, col * CELL, row * CELL, CELL, CELL);
  });

  // Default frame so Image(atlas) without frame still works
  texture.add('__BASE', 0, 0, 0, canvas.width, canvas.height);
}

function drawProjectile(ctx: CanvasRenderingContext2D, size: number): void {
  const cx = size / 2;
  const cy = size / 2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 8);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.4, '#ffe08a');
  g.addColorStop(1, 'rgba(255,140,40,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, Math.PI * 2);
  ctx.fill();
}

function drawExplosion(ctx: CanvasRenderingContext2D, size: number, t: number): void {
  const cx = size / 2;
  const cy = size / 2;
  const r = 6 + t * 18;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(255,240,180,${0.9 * (1.1 - t)})`);
  g.addColorStop(0.45, `rgba(255,120,40,${0.7 * (1 - t)})`);
  g.addColorStop(1, 'rgba(80,20,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}
