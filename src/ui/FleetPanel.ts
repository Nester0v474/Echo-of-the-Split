/**
 * FleetPanel — the flagship's "castle" screen: one stat card per ship class
 * with HIRE and UPGRADE buttons, flagship shield/hull and current energy.
 * Pure Phaser UI; all rules go through BattleSystem.
 */
import Phaser from 'phaser';
import { UNITS_ATLAS_KEY } from '../config/constants';
import { spriteKeys } from '../config/spriteKeys';
import { RECRUITABLE, UNIT_TYPES, type UnitId } from '../config/units';
import { rejectText, STR } from '../config/strings';
import type { BattleSystem } from '../systems/BattleSystem';
import { RenderDepth } from '../systems/HexRenderer';

const FONT = 'system-ui, sans-serif';
const COLOR_TEXT = '#e6f0ff';
const COLOR_MUTED = '#8ea2c0';
const COLOR_ACCENT = '#7dd8e8';
const COLOR_ENERGY = '#ffd36b';
const COLOR_HIRE = 0x22c55e;
const COLOR_UPGRADE = 0x3b82f6;
const COLOR_DISABLED = 0x2a3042;

const CARD_GAP = 8;

class Button {
  readonly root: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private readonly color: number;
  private enabled = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    w: number,
    h: number,
    text: string,
    color: number,
    onClick: () => void,
  ) {
    this.color = color;
    this.bg = scene.add
      .rectangle(0, 0, w, h, color, 1)
      .setStrokeStyle(1, 0xffffff, 0.18)
      .setInteractive({ useHandCursor: true });
    this.label = scene.add
      .text(0, 0, text, { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: COLOR_TEXT })
      .setOrigin(0.5);
    this.root = scene.add.container(x + w / 2, y + h / 2, [this.bg, this.label]);

    this.bg.on('pointerover', () => this.enabled && this.bg.setFillStyle(this.color, 0.8));
    this.bg.on('pointerout', () => this.enabled && this.bg.setFillStyle(this.color, 1));
    this.bg.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      if (this.enabled) {
        onClick();
      }
    });
  }

  setText(text: string): void {
    this.label.setText(text);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.bg.setFillStyle(enabled ? this.color : COLOR_DISABLED, 1);
    this.bg.setStrokeStyle(enabled ? 2 : 1, 0xffffff, enabled ? 0.7 : 0.12);
    this.label.setAlpha(enabled ? 1 : 0.45);
    this.label.setColor(enabled ? '#ffffff' : '#8ea2c0');
    if (enabled) {
      this.bg.setInteractive({ useHandCursor: true });
    } else {
      this.bg.disableInteractive();
    }
  }
}

interface Card {
  typeId: UnitId;
  frame: Phaser.GameObjects.Graphics;
  stats: Phaser.GameObjects.Text;
  level: Phaser.GameObjects.Text;
  hire: Button;
  upgrade: Button;
  y: number;
  w: number;
  h: number;
}

export class FleetPanel {
  readonly root: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly battle: BattleSystem;
  private readonly x: number;
  private readonly width: number;
  private readonly height: number;

  private readonly energyText: Phaser.GameObjects.Text;
  private readonly flagshipText: Phaser.GameObjects.Text;
  private readonly message: Phaser.GameObjects.Text;
  private readonly cards: Card[] = [];
  private lastRejection = '';
  private messageTween: Phaser.Tweens.Tween | null = null;
  private unsub: () => void;

  constructor(scene: Phaser.Scene, battle: BattleSystem, x: number, y: number, width: number, height: number) {
    this.scene = scene;
    this.battle = battle;
    this.x = x;
    this.width = width;
    this.height = height;

    const bg = scene.add.graphics();
    bg.fillStyle(0x070a14, 0.88);
    bg.fillRect(0, 0, width, height);
    bg.lineStyle(2, 0x7dd8e8, 0.35);
    bg.lineBetween(0, 0, 0, height);

    const compact = height < 900 || width < 400;
    const title = scene.add.text(16, 12, STR.flagshipTitle, {
      fontFamily: FONT,
      fontSize: compact ? '16px' : '22px',
      fontStyle: 'bold',
      color: COLOR_ACCENT,
      wordWrap: { width: width - 90 },
    });
    this.flagshipText = scene.add.text(16, compact ? 40 : 52, '', {
      fontFamily: FONT,
      fontSize: compact ? '13px' : '16px',
      color: COLOR_MUTED,
      wordWrap: { width: width - 32 },
    });
    this.energyText = scene.add
      .text(width - 16, 12, '', { fontFamily: FONT, fontSize: compact ? '22px' : '28px', fontStyle: 'bold', color: COLOR_ENERGY })
      .setOrigin(1, 0);
    const hint = scene.add.text(16, compact ? 64 : 80, STR.recruitHint, {
      fontFamily: FONT,
      fontSize: compact ? '11px' : '13px',
      color: COLOR_MUTED,
      wordWrap: { width: width - 32 },
    });

    this.message = scene.add
      .text(width / 2, height - 24, '', { fontFamily: FONT, fontSize: '15px', color: '#ff8e8e' })
      .setOrigin(0.5)
      .setAlpha(0);

    this.root = scene.add
      .container(x, y, [bg, title, this.flagshipText, this.energyText, hint, this.message])
      .setDepth(RenderDepth.UI);

    const header = compact ? 92 : 120;
    const footer = 28;
    const cardH = Math.floor((height - header - footer - CARD_GAP * (RECRUITABLE.length - 1)) / RECRUITABLE.length);
    let cy = header;
    for (const typeId of RECRUITABLE) {
      this.cards.push(this.buildCard(typeId, 16, cy, this.width - 32, Math.max(118, cardH)));
      cy += Math.max(118, cardH) + CARD_GAP;
    }

    this.unsub = battle.events.on('action:rejected', ({ reason }) => {
      this.lastRejection = rejectText(reason);
    });

    this.refresh();
  }

  // ------------------------------------------------------------------

  private buildCard(typeId: UnitId, cx: number, cy: number, cardW: number, cardH: number): Card {
    const def = UNIT_TYPES[typeId];
    const s = this.scene;
    const compact = cardW < 380 || cardH < 170;
    const portraitSize = compact ? 52 : 96;
    const textX = cx + (compact ? 72 : 130);

    const frame = s.add.graphics();
    this.drawCardFrame(frame, cx, cy, cardW, cardH, false);
    this.root.add(frame);

    const portraitX = cx + (compact ? 34 : 62);
    const portraitY = cy + cardH / 2 - 8;
    const spriteDef = spriteKeys[typeId];
    const atlas = s.textures.exists(UNITS_ATLAS_KEY) ? s.textures.get(UNITS_ATLAS_KEY) : null;
    if (atlas && atlas.has(spriteDef.frame)) {
      const portraitFrame =
        spriteDef.turnedFrame && atlas.has(spriteDef.turnedFrame) ? spriteDef.turnedFrame : spriteDef.frame;
      const img = s.add.image(portraitX, portraitY, UNITS_ATLAS_KEY, portraitFrame);
      img.setScale(portraitSize / Math.max(img.width, img.height));
      if (portraitFrame === spriteDef.frame) {
        img.setAngle(180);
      }
      this.root.add(img);
    } else {
      this.root.add(s.add.rectangle(portraitX, portraitY, 56, 56, 0x33ff99).setStrokeStyle(2, 0xffffff));
    }

    const name = s.add.text(textX, cy + 8, def.name.toUpperCase(), {
      fontFamily: FONT,
      fontSize: compact ? '15px' : '20px',
      fontStyle: 'bold',
      color: COLOR_TEXT,
    });
    const cost = s.add
      .text(cx + cardW - 12, cy + 8, `${def.cost} ${STR.energyUnit}`, {
        fontFamily: FONT,
        fontSize: compact ? '14px' : '18px',
        fontStyle: 'bold',
        color: COLOR_ENERGY,
      })
      .setOrigin(1, 0);
    const role = s.add.text(textX, cy + (compact ? 28 : 40), def.role, {
      fontFamily: FONT,
      fontSize: compact ? '11px' : '13px',
      color: COLOR_MUTED,
      wordWrap: { width: cardW - (textX - cx) - 12 },
    });
    const stats = s.add.text(textX, cy + (compact ? 46 : 66), '', {
      fontFamily: FONT,
      fontSize: compact ? '12px' : '15px',
      color: COLOR_TEXT,
      lineSpacing: 2,
    });
    const level = s.add.text(textX, cy + (compact ? 72 : 118), '', {
      fontFamily: FONT,
      fontSize: compact ? '11px' : '13px',
      color: COLOR_ACCENT,
      wordWrap: { width: cardW - (textX - cx) - 12 },
    });

    const btnH = compact ? 30 : 38;
    const btnY = cy + cardH - btnH - 8;
    const btnArea = cardW - (textX - cx) - 12;
    const upgradeW = Math.floor(btnArea * 0.52);
    const hireW = btnArea - upgradeW - 8;
    const upgrade = new Button(s, textX, btnY, upgradeW, btnH, STR.upgrade, COLOR_UPGRADE, () => this.onUpgrade(typeId));
    const hire = new Button(s, textX + upgradeW + 8, btnY, hireW, btnH, STR.hire, COLOR_HIRE, () => this.onHire(typeId));

    this.root.add([name, cost, role, stats, level, upgrade.root, hire.root]);
    return { typeId, frame, stats, level, hire, upgrade, y: cy, w: cardW, h: cardH };
  }

  private drawCardFrame(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    highlight: boolean,
  ): void {
    g.clear();
    g.fillStyle(0x0e1424, 0.95);
    g.fillRoundedRect(x, y, w, h, 10);
    g.lineStyle(1.5, highlight ? 0x4fe89a : 0x7dd8e8, highlight ? 0.9 : 0.3);
    g.strokeRoundedRect(x, y, w, h, 10);
  }

  // ------------------------------------------------------------------

  private onHire(typeId: UnitId): void {
    const unit = this.battle.recruit('player', typeId);
    if (!unit) {
      this.showMessage(this.lastRejection || STR.reject['Not enough energy']);
    } else {
      this.flashCard(typeId);
    }
    this.refresh();
  }

  private onUpgrade(typeId: UnitId): void {
    if (!this.battle.upgradeUnitType('player', typeId)) {
      this.showMessage(this.lastRejection || STR.reject['Not enough energy']);
    } else {
      this.flashCard(typeId);
    }
    this.refresh();
  }

  private flashCard(typeId: UnitId): void {
    const card = this.cards.find((c) => c.typeId === typeId);
    if (!card) {
      return;
    }
    this.drawCardFrame(card.frame, 16, card.y, card.w, card.h, true);
    this.scene.time.delayedCall(350, () => this.drawCardFrame(card.frame, 16, card.y, card.w, card.h, false));
  }

  private showMessage(text: string): void {
    this.message.setText(text).setAlpha(1);
    this.messageTween?.stop();
    this.messageTween = this.scene.tweens.add({ targets: this.message, alpha: 0, delay: 1400, duration: 400 });
  }

  // ------------------------------------------------------------------

  /** Re-read energy, flagship status and card stats/levels from the battle. */
  refresh(): void {
    const energy = this.battle.getEnergy('player');
    const playerPhase = this.battle.getPhase() === 'player';
    this.energyText.setText(`${energy} ${STR.energyUnit}`);

    const flag = this.battle.getFlagship('player');
    this.flagshipText.setText(
      flag
        ? `${STR.shield} ${flag.shield}/${flag.maxShield}    ${STR.hull} ${flag.hp}/${flag.maxHp}`
        : STR.flagshipLost,
    );

    for (const card of this.cards) {
      const def = UNIT_TYPES[card.typeId];
      const st = this.battle.getClassStats('player', card.typeId);
      card.stats.setText(
        `${STR.statHp} ${st.hp}     ${STR.statDmg} ${st.damage}\n${STR.statRange} ${def.range}     ${STR.statMove} ${def.moveRange}`,
      );

      const cost = this.battle.getUpgradeCost('player', card.typeId);
      const track = def.upgrade;
      card.level.setText(
        cost === null
          ? `${STR.level} ${st.level}/${track.maxLevel}  (${STR.maxed.toLowerCase()})`
          : `${STR.level} ${st.level}/${track.maxLevel}   ${STR.next}: +${track.hpPerLevel} ${STR.statHp}  +${track.damagePerLevel} ${STR.statDmg}`,
      );

      card.hire.setText(`${STR.hire}  ${def.cost} ${STR.energyUnit}`);
      card.hire.setEnabled(playerPhase && energy >= def.cost);

      card.upgrade.setText(cost === null ? STR.maxed : `${STR.upgrade}  ${cost} ${STR.energyUnit}`);
      card.upgrade.setEnabled(playerPhase && cost !== null && energy >= cost);
    }
  }

  setVisible(visible: boolean): void {
    this.root.setVisible(visible);
  }

  isVisible(): boolean {
    return this.root.visible;
  }

  /** True when a world point lies inside the (visible) panel. */
  containsPoint(wx: number, wy: number): boolean {
    return this.root.visible && wx >= this.x && wx <= this.x + this.width && wy >= 0 && wy <= this.height;
  }

  /** Brief attention pulse (e.g. when the player clicks the flagship). */
  pulse(): void {
    this.scene.tweens.add({ targets: this.root, alpha: 0.55, yoyo: true, duration: 120, repeat: 1 });
  }

  destroy(): void {
    this.unsub();
    this.root.destroy(true);
  }
}
