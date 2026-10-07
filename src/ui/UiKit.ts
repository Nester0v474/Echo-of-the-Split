import Phaser from 'phaser';

export const FONT = 'system-ui, "Segoe UI", sans-serif';

export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  color: number,
  onClick: () => void,
): Phaser.GameObjects.Container {
  const bg = scene.add
    .rectangle(0, 0, w, h, color, 1)
    .setStrokeStyle(1, 0xffffff, 0.2)
    .setInteractive({ useHandCursor: true });
  const label = scene.add
    .text(0, 0, text, { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#e6f0ff' })
    .setOrigin(0.5);
  const root = scene.add.container(x, y, [bg, label]);
  bg.on('pointerover', () => bg.setFillStyle(color, 0.78));
  bg.on('pointerout', () => bg.setFillStyle(color, 1));
  bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
    ev.stopPropagation();
    onClick();
  });
  return root;
}

export function hudLabel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  opts: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  const label = scene.add
    .text(x, y, text, {
      fontFamily: FONT,
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#7dd8e8',
      backgroundColor: '#0e1a2ccc',
      padding: { x: 14, y: 6 },
      ...opts,
    })
    .setInteractive({ useHandCursor: true });
  label.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
    ev.stopPropagation();
  });
  return label;
}
