/**
 * Sector map: a branching mission tree that ends at the Cut-off flagship «Ковчег».
 */
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, UNITS_ATLAS_KEY, isPhoneLayout } from '../config/constants';
import { BATTLE_BACKGROUNDS, BattleBackground } from '../config/backgrounds';
import {
  CAMPAIGN,
  CAMPAIGN_BY_ID,
  canEnterMission,
  getAvailableMissionIds,
  getCampaignNodeVisual,
  getCurrentMissionId,
  getRecommendedMissionId,
  isCampaignEdgeCompleted,
  isMissionAvailable,
  type CampaignNodeVisual,
  type MissionDef,
} from '../config/campaign';
import { ENEMY_TINT, spriteKeys } from '../config/spriteKeys';
import { STR } from '../config/strings';
import { ensureMusic, loadAudio, playSfx } from '../systems/Audio';
import { getCompletedMissionIds, getEnding, setEnding } from '../systems/Progress';
import { FONT } from '../ui/UiKit';
import { SettingsPanel } from '../ui/SettingsPanel';
import { hideBattleChrome } from '../ui/BattleChrome';
import {
  hideCampaignChrome,
  setCampaignEpilogueVisible,
  setCampaignFightVisible,
  showCampaignChrome,
} from '../ui/CampaignChrome';

const MAP_PAD = 80;
const TOOLTIP_ID = 'campaign-node-tooltip';
const COLOR_CURRENT = 0x7dd8e8;
const COLOR_AVAILABLE = 0x5797a2;
const COLOR_LOCKED_STROKE = 0x3a4558;
const COLOR_FINAL = 0xffb454;

interface NodeView {
  root: Phaser.GameObjects.Container;
  hex: Phaser.GameObjects.Graphics;
  baseX: number;
  baseY: number;
  visual: CampaignNodeVisual;
}

export class CampaignScene extends Phaser.Scene {
  private settings!: SettingsPanel;
  private briefing!: Phaser.GameObjects.Container;
  private briefTitle!: Phaser.GameObjects.Text;
  private briefPlace!: Phaser.GameObjects.Text;
  private briefLore!: Phaser.GameObjects.Text;
  private briefState!: Phaser.GameObjects.Text;
  private selected: MissionDef | null = null;
  private selectedMark!: Phaser.GameObjects.Graphics;
  private mapW = 1280;
  private nodeViews = new Map<string, NodeView>();
  private tooltip!: HTMLDivElement;

  constructor() {
    super('CampaignScene');
  }

  create(): void {
    hideBattleChrome();
    document.getElementById('battle-tutorial')?.remove();
    const bg = BATTLE_BACKGROUNDS[BattleBackground.ASTEROIDS];
    if (this.textures.exists(bg.key)) {
      this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, bg.key).setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    } else {
      this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x070a14);
    }
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x04070e, 0.35);

    this.mapW = Math.round(GAME_WIDTH * 0.667);
    const compact = isPhoneLayout();

    this.add
      .text(48, 22, STR.campaignTitle, {
        fontFamily: FONT,
        fontSize: compact ? '28px' : '40px',
        fontStyle: 'bold',
        color: '#7dd8e8',
      })
      .setOrigin(0, 0);
    this.add
      .text(48, compact ? 54 : 78, STR.campaignHint, {
        fontFamily: FONT,
        fontSize: compact ? '14px' : '18px',
        color: '#8ea2c0',
        wordWrap: { width: this.mapW - 220 },
      })
      .setOrigin(0, 0);

    showCampaignChrome({
      onBack: () => {
        playSfx('ui');
        this.scene.start('MenuScene');
      },
      onSettings: () => {
        playSfx('ui');
        this.settings.show();
      },
      onFight: () => {
        if (this.selected && canEnterMission(this.selected, getCompletedMissionIds())) {
          playSfx('ui');
          this.scene.start('BattleScene', { missionId: this.selected.id });
        }
      },
      onEpilogueA: () => {
        playSfx('ui');
        setEnding('metropolis');
        this.showEpilogue('metropolis');
      },
      onEpilogueB: () => {
        playSfx('ui');
        setEnding('free');
        this.showEpilogue('free');
      },
    });

    this.tooltip = this.mountTooltip();
    this.selectedMark = this.add.graphics();
    this.drawTree();
    this.hideOrphanAtlasSprites();
    this.buildBriefing();
    this.autoSelectMission();
    this.settings = new SettingsPanel(this);
    void loadAudio().then(() => ensureMusic());

    const completed = getCompletedMissionIds();
    const ending = getEnding();
    if (completed.includes('ark') && ending) {
      this.showEpilogue(ending);
    } else if (completed.includes('ark') && !ending) {
      this.showEpilogueChoice();
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
  }

  private shutdown(): void {
    hideCampaignChrome();
    this.hideTooltip();
    this.tooltip.remove();
    this.tweens.killAll();
  }

  private mapPoint(m: MissionDef): { x: number; y: number } {
    return {
      x: MAP_PAD + m.x * (this.mapW - MAP_PAD * 2),
      y: 180 + m.y * (GAME_HEIGHT - 260),
    };
  }

  private drawTree(): void {
    const completedIds = getCompletedMissionIds();
    const completed = new Set(completedIds);
    const g = this.add.graphics();

    for (const m of CAMPAIGN) {
      const to = this.mapPoint(m);
      for (const parentId of m.requires) {
        const parent = CAMPAIGN_BY_ID[parentId];
        if (!parent) {
          continue;
        }
        const from = this.mapPoint(parent);
        if (isCampaignEdgeCompleted(parent.id, m.id, completed)) {
          g.lineStyle(3.5, COLOR_CURRENT, 0.6);
        } else {
          const unlocked = isMissionAvailable(m, completedIds);
          g.lineStyle(3, unlocked ? COLOR_CURRENT : COLOR_LOCKED_STROKE, unlocked ? 0.7 : 0.28);
        }
        g.beginPath();
        g.moveTo(from.x, from.y);
        g.lineTo(to.x, to.y);
        g.strokePath();
      }
    }

    for (const m of CAMPAIGN) {
      this.nodeViews.set(m.id, this.buildNode(m, completedIds));
    }
  }

  private buildNode(m: MissionDef, completedIds: readonly string[]): NodeView {
    const { x, y } = this.mapPoint(m);
    const visual = getCampaignNodeVisual(m, completedIds);
    const r = m.final ? 46 : 28;
    const palette = this.palette(visual);

    const hex = this.make.graphics({}, false);
    if (visual === 'current') {
      this.drawHex(hex, 0, 0, r + 10, COLOR_CURRENT, COLOR_CURRENT, 0.22);
    }
    this.drawHex(hex, 0, 0, r, palette.fill, palette.stroke, palette.alpha);
    if (visual === 'final') {
      this.drawHex(hex, 0, 0, r + 10, 0x000000, COLOR_FINAL, 0.85);
    }

    const kids: Phaser.GameObjects.GameObject[] = [hex];
    const portrait = this.makeFinalPortrait(r, visual);
    if (portrait) {
      kids.push(portrait);
    }

    const title = this.make
      .text(
        {
          x: 0,
          y: r + 16,
          text: m.final ? `${STR.finalNode}\n${m.title}` : m.title,
          style: {
            fontFamily: FONT,
            fontSize: m.final ? '18px' : '16px',
            fontStyle: 'bold',
            color: palette.label,
            align: 'center',
          },
        },
        false,
      )
      .setOrigin(0.5, 0);
    kids.push(title);

    const hit = this.add.circle(0, 0, r + 8, 0xffffff, 0.01);
    hit.setInteractive({ useHandCursor: true });
    kids.push(hit);

    const root = this.add.container(x, y, kids);
    const view: NodeView = { root, hex, baseX: x, baseY: y, visual };
    hit.on('pointerdown', () => this.onNodeClick(m));
    hit.on('pointerover', () => this.onNodeOver(m, view));
    hit.on('pointerout', () => this.onNodeOut(view));

    if (visual === 'available') {
      this.tweens.add({
        targets: root,
        alpha: { from: 0.7, to: 1 },
        duration: 1000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    return view;
  }

  private palette(visual: CampaignNodeVisual): {
    fill: number;
    stroke: number;
    alpha: number;
    label: string;
  } {
    switch (visual) {
      case 'current':
        return { fill: 0x12304a, stroke: COLOR_CURRENT, alpha: 1, label: '#e6f0ff' };
      case 'available':
        return { fill: 0x0e2438, stroke: COLOR_AVAILABLE, alpha: 1, label: '#c5d8e6' };
      case 'completed':
        return { fill: 0x102018, stroke: 0x3d6b58, alpha: 0.95, label: '#7aa88f' };
      case 'final':
        return { fill: 0x20140c, stroke: COLOR_FINAL, alpha: 1, label: '#e6f0ff' };
      default:
        return { fill: 0x10141c, stroke: COLOR_LOCKED_STROKE, alpha: 0.45, label: '#5a6a80' };
    }
  }

  /**
   * Final-node portrait only. Built with `make` so Phaser never parks the atlas
   * frame at world (0, 0) — that leftover was the orange block in the corner.
   */
  private makeFinalPortrait(r: number, visual: CampaignNodeVisual): Phaser.GameObjects.Image | null {
    if (visual !== 'final' || !this.textures.exists(UNITS_ATLAS_KEY)) {
      return null;
    }
    const atlas = this.textures.get(UNITS_ATLAS_KEY);
    const frame = spriteKeys.flagship.frame;
    if (!atlas.has(frame)) {
      return null;
    }
    const ship = this.make.image({ x: 0, y: 0, key: UNITS_ATLAS_KEY, frame }, false);
    ship.setTint(ENEMY_TINT);
    const longest = Math.max(ship.width, ship.height, 1);
    ship.setScale((r * 1.7) / longest);
    return ship;
  }

  /** Hide a units-atlas image stuck at the origin (missing-frame / add-list leak). */
  private hideOrphanAtlasSprites(): void {
    for (const obj of this.children.list) {
      if (
        obj instanceof Phaser.GameObjects.Image &&
        obj.texture.key === UNITS_ATLAS_KEY &&
        obj.x === 0 &&
        obj.y === 0
      ) {
        obj.setVisible(false).setActive(false);
      }
    }
  }

  private drawHex(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    r: number,
    fill: number,
    stroke: number,
    alpha: number,
  ): void {
    const pts: Phaser.Geom.Point[] = [];
    for (let i = 0; i < 6; i++) {
      const a = ((60 * i - 30) * Math.PI) / 180;
      pts.push(new Phaser.Geom.Point(x + r * Math.cos(a), y + r * Math.sin(a)));
    }
    g.fillStyle(fill, alpha);
    g.fillPoints(pts, true, true);
    g.lineStyle(2.5, stroke, alpha);
    g.strokePoints(pts, true, true);
  }

  private onNodeClick(m: MissionDef): void {
    playSfx('ui');
    this.selectMission(m);
    const completedIds = getCompletedMissionIds();
    if (!canEnterMission(m, completedIds) && getCurrentMissionId(completedIds) !== m.id && !completedIds.includes(m.id)) {
      this.shakeNode(m.id);
    }
  }

  private onNodeOver(m: MissionDef, view: NodeView): void {
    if (!this.sys.game.device.os.desktop || !canEnterMission(m, getCompletedMissionIds())) {
      return;
    }
    this.tweens.add({
      targets: view.root,
      scaleX: 1.05,
      scaleY: 1.05,
      duration: 120,
      ease: 'Sine.easeOut',
    });
    this.showTooltip(m, view);
  }

  private onNodeOut(view: NodeView): void {
    this.tweens.add({
      targets: view.root,
      scaleX: 1,
      scaleY: 1,
      duration: 120,
      ease: 'Sine.easeOut',
    });
    this.hideTooltip();
  }

  private shakeNode(id: string): void {
    const view = this.nodeViews.get(id);
    if (!view) {
      return;
    }
    this.tweens.killTweensOf(view.root);
    view.root.setPosition(view.baseX, view.baseY);
    view.root.setScale(1);
    this.tweens.add({
      targets: view.root,
      x: view.baseX + 7,
      duration: 40,
      yoyo: true,
      repeat: 4,
      onComplete: () => {
        view.root.setPosition(view.baseX, view.baseY);
        if (view.visual === 'available') {
          this.tweens.add({
            targets: view.root,
            alpha: { from: 0.7, to: 1 },
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        }
      },
    });
  }

  private mountTooltip(): HTMLDivElement {
    document.getElementById(TOOLTIP_ID)?.remove();
    const el = document.createElement('div');
    el.id = TOOLTIP_ID;
    el.className = 'campaign-tooltip';
    el.hidden = true;
    (document.getElementById('game-container') ?? document.body).appendChild(el);
    return el;
  }

  private showTooltip(m: MissionDef, view: NodeView): void {
    const canvas = this.game.canvas;
    const host = this.tooltip.parentElement;
    if (!canvas || !host) {
      return;
    }
    const canvasRect = canvas.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const left = canvasRect.left - hostRect.left + view.baseX * (canvasRect.width / GAME_WIDTH);
    const top = canvasRect.top - hostRect.top + view.baseY * (canvasRect.height / GAME_HEIGHT);
    this.tooltip.textContent = m.title;
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
    this.tooltip.hidden = false;
  }

  private hideTooltip(): void {
    this.tooltip.hidden = true;
  }

  private buildBriefing(): void {
    const w = GAME_WIDTH - this.mapW - 24;
    const x = this.mapW + 8;
    const bg = this.add.graphics();
    bg.fillStyle(0x070a14, 0.88);
    bg.fillRoundedRect(0, 0, w, GAME_HEIGHT - 32, 12);
    bg.lineStyle(1.5, 0x7dd8e8, 0.3);
    bg.strokeRoundedRect(0, 0, w, GAME_HEIGHT - 32, 12);

    const compact = isPhoneLayout();
    this.briefTitle = this.add.text(28, 28, STR.briefing, {
      fontFamily: FONT,
      fontSize: compact ? '22px' : '28px',
      fontStyle: 'bold',
      color: '#7dd8e8',
      wordWrap: { width: w - 56 },
    });
    this.briefPlace = this.add.text(28, compact ? 60 : 72, '', {
      fontFamily: FONT,
      fontSize: compact ? '14px' : '16px',
      color: '#ffd36b',
    });
    this.briefState = this.add.text(28, compact ? 84 : 100, '', {
      fontFamily: FONT,
      fontSize: compact ? '13px' : '15px',
      color: '#8ea2c0',
    });
    this.briefLore = this.add.text(28, compact ? 114 : 140, STR.campaignHint, {
      fontFamily: FONT,
      fontSize: compact ? '15px' : '18px',
      color: '#cfe3ff',
      wordWrap: { width: w - 56 },
      lineSpacing: compact ? 5 : 8,
    });

    this.briefing = this.add.container(x, 16, [
      bg,
      this.briefTitle,
      this.briefPlace,
      this.briefState,
      this.briefLore,
    ]);
  }

  private selectMission(m: MissionDef): void {
    this.selected = m;
    const completedIds = getCompletedMissionIds();
    const done = completedIds.includes(m.id);
    const enterable = canEnterMission(m, completedIds);
    const current = getCurrentMissionId(completedIds) === m.id;

    this.briefTitle.setText(m.title);
    this.briefPlace.setText(m.place);
    this.briefState.setText(done ? STR.completed : enterable ? STR.available : current ? STR.completed : STR.locked);
    this.briefState.setColor(done || current ? '#4fe89a' : enterable ? '#7dd8e8' : '#8ea2c0');

    const lines = [...m.lore];
    if (done) {
      lines.push('', m.outcome);
    }
    this.briefLore.setText(lines.join('\n\n'));
    setCampaignFightVisible(enterable);
    setCampaignEpilogueVisible(false);
    this.markSelected(m);
  }

  private autoSelectMission(): void {
    const completed = getCompletedMissionIds();
    const nextId = getRecommendedMissionId(completed) ?? getAvailableMissionIds(completed)[0] ?? 'cassini';
    const mission = CAMPAIGN_BY_ID[nextId];
    if (mission) {
      this.selectMission(mission);
    }
  }

  private markSelected(m: MissionDef): void {
    const p = this.mapPoint(m);
    const r = m.final ? 58 : 40;
    this.selectedMark.clear();
    this.drawHex(this.selectedMark, p.x, p.y, r, 0x000000, 0xffffff, 0.95);
  }

  private showEpilogueChoice(): void {
    this.briefTitle.setText(STR.epilogueTitle);
    this.briefPlace.setText('');
    this.briefState.setText('');
    this.briefLore.setText('Ковчег пал. Врата сектора снова живые. Кому они принадлежат — решать вам.');
    setCampaignFightVisible(false);
    setCampaignEpilogueVisible(true);
  }

  private showEpilogue(ending: 'metropolis' | 'free'): void {
    const texts = ending === 'metropolis' ? STR.epilogueTextA : STR.epilogueTextB;
    this.briefTitle.setText(STR.epilogueTitle);
    this.briefPlace.setText('');
    this.briefState.setText('');
    this.briefLore.setText(texts.join('\n\n'));
    setCampaignFightVisible(false);
    setCampaignEpilogueVisible(true);
  }
}
