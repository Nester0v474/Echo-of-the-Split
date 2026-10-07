/**
 * BattleScene - rendering + input for one battle.
 *
 * Layers (bottom -> top), see RenderDepth in HexRenderer:
 *   background image -> grid outline (one Graphics) -> highlights / path / badges
 *   -> unit sprites (atlas 'units') -> VFX (pooled projectile / explosion).
 *
 * All world positions go through `grid.axialToPixel`, so camera scroll / zoom
 * will not break positioning.
 */
import Phaser from 'phaser';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  FIELD_WIDTH,
  HUD_WIDTH,
  HEX_SIZE,
  ATLAS_KEY,
  UNITS_ATLAS_KEY,
  UNITS_ATLAS_PNG,
  UNITS_ATLAS_JSON,
  AI_THROTTLE_MS,
} from '../config/constants';
import {
  BattleBackground,
  BATTLE_BACKGROUNDS,
  BACKGROUND_FALLBACK_COLOR,
} from '../config/backgrounds';
import { spriteKeys, ENEMY_TINT } from '../config/spriteKeys';
import { UNIT_TYPES } from '../config/units';
import { DEMO_MAP, buildMissionSpawns, createGridFromMap, generateBattleTerrain } from '../config/battleMap';
import { CAMPAIGN_BY_ID } from '../config/campaign';
import { WAVE_SCHEDULE } from '../config/waveSchedule';
import { STR, UNIT_NAMES_RU } from '../config/strings';
import type { BattleUnit } from '../entities/Unit';
import { BattleSystem } from '../systems/BattleSystem';
import { HexGrid, hexKey, type Axial } from '../systems/HexGrid';
import { ensureMusic, loadAudio, playSfx } from '../systems/Audio';
import { difficultyMods, getSettings } from '../systems/Settings';
import { markMissionCompleted } from '../systems/Progress';
import { hasSeenTutorial, showTutorial } from '../ui/TutorialOverlay';
import {
  RenderDepth,
  COLOR_MOVE,
  COLOR_ATTACK,
  renderGridOutline,
  renderHexTypes,
  flashHex,
  highlightHex,
  clearHighlights,
  showAttackHint,
  clearAttackHint,
  drawPath,
  drawMovementPath,
  clearMovementPath,
  showHpBadge,
  showDamagePreview,
  clearDamagePreview,
  clearAllOverlays,
  type HpBadge,
} from '../systems/HexRenderer';
import { ObjectPool } from '../systems/ObjectPool';
import { FleetPanel } from '../ui/FleetPanel';
import { hideBattleChrome, showBattleChrome, updateBattleChrome } from '../ui/BattleChrome';
import { hideBattleEnd, showBattleEnd } from '../ui/BattleEndOverlay';
import { SettingsPanel } from '../ui/SettingsPanel';

interface ActiveProjectile {
  sprite: Phaser.GameObjects.Image;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  duration: number;
  onArrive: () => void;
}

interface ActiveExplosion {
  sprite: Phaser.GameObjects.Image;
  t: number;
  frameIndex: number;
}

/** Render-side state of one unit; the badge lives here and is reused. */
interface UnitView {
  sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
  badge: HpBadge;
}

export interface BattleLaunch {
  missionId?: string;
}

export class BattleScene extends Phaser.Scene {
  private grid!: HexGrid;
  private battle!: BattleSystem;
  private background: BattleBackground = BattleBackground.ASTEROIDS;
  private missionId: string | null = null;

  private unitViews = new Map<string, UnitView>();
  private hoveredKey: string | null = null;

  private projectilePool!: ObjectPool<Phaser.GameObjects.Image>;
  private explosionPool!: ObjectPool<Phaser.GameObjects.Image>;
  private activeProjectiles: ActiveProjectile[] = [];
  private activeExplosions: ActiveExplosion[] = [];

  private aiAccumMs = 0;
  private unsubs: Array<() => void> = [];
  private fleetPanel!: FleetPanel;
  private settings!: SettingsPanel;
  private leaving = false;

  constructor() {
    super('BattleScene');
  }

  init(data: BattleLaunch = {}): void {
    this.missionId = data.missionId ?? null;
    this.leaving = false;
  }

  // ---------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------

  preload(): void {
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.warn(`[BattleScene] asset failed to load: ${file.key} (${file.src})`);
    });
    this.loadBattleBackground(this.background);
    if (!this.textures.exists(UNITS_ATLAS_KEY)) {
      this.load.atlas(UNITS_ATLAS_KEY, UNITS_ATLAS_PNG, UNITS_ATLAS_JSON);
    }
  }

  create(): void {
    const mission = this.missionId ? CAMPAIGN_BY_ID[this.missionId] : undefined;
    const mods = difficultyMods();
    const enemyRegen = mods.enemyShieldRegen + (mission?.rules.enemyRegenDelta ?? 0);

    const spawns = mission ? buildMissionSpawns(mission) : DEMO_MAP.spawns;
    const terrain = generateBattleTerrain({
      difficulty: getSettings().difficulty,
      reserved: spawns,
    });
    this.grid = createGridFromMap({ ...DEMO_MAP, ...terrain, spawns }, HEX_SIZE);
    // Battlefield lives left of the HUD column.
    this.grid.centerIn(FIELD_WIDTH, GAME_HEIGHT);
    this.battle = new BattleSystem(this.grid, {
      waveSchedule: mission && !mission.rules.waves ? null : WAVE_SCHEDULE,
      startingEnergyByTeam: { player: mission?.rules.playerStartEnergy ?? 0, enemy: 0 },
      shieldRegenByTeam: { player: UNIT_TYPES.flagship.shieldRegen, enemy: enemyRegen },
    });

    this.createBackground();
    renderHexTypes(this, this.grid);
    renderGridOutline(this, this.grid);
    this.createPools();
    this.bindBattleEvents();

    this.fleetPanel = new FleetPanel(this, this.battle, FIELD_WIDTH, 0, HUD_WIDTH, GAME_HEIGHT);
    this.settings = new SettingsPanel(this);
    showBattleChrome({
      onSettings: () => {
        playSfx('ui');
        this.settings.show();
      },
      onMenu: () => {
        playSfx('ui');
        this.leaveBattle('MenuScene');
      },
      onEndTurn: () => {
        playSfx('ui');
        this.battle.endPlayerTurn();
      },
      onFleet: () => this.setFleetPanelVisible(!this.fleetPanel.isVisible()),
    });

    this.battle.start(spawns);
    this.fleetPanel.refresh();
    this.refreshStatus();
    void loadAudio().then(() => ensureMusic());

    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerdown', this.onPointerDown, this);

    if (!hasSeenTutorial()) {
      showTutorial();
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
  }

  update(_time: number, delta: number): void {
    this.updateProjectiles(delta);
    this.updateExplosions(delta);
    this.tickAiThrottled(delta);
  }

  shutdown(): void {
    hideBattleChrome();
    hideBattleEnd();
    document.getElementById('battle-tutorial')?.remove();
    for (const off of this.unsubs) {
      off();
    }
    this.unsubs = [];
    this.unitViews.clear();
    this.hoveredKey = null;
    this.fleetPanel?.destroy();
    this.settings?.destroy();
  }

  private leaveBattle(dest: string): void {
    if (this.leaving) {
      return;
    }
    this.leaving = true;
    hideBattleEnd();
    hideBattleChrome();
    this.scene.start(dest);
  }

  private setFleetPanelVisible(visible: boolean): void {
    this.fleetPanel.setVisible(visible);
    if (visible) {
      this.fleetPanel.refresh();
    }
    this.refreshStatus();
  }

  // ---------------------------------------------------------------------
  // Background
  // ---------------------------------------------------------------------

  /** Queue the background image for `type`; call from preload(). */
  loadBattleBackground(type: BattleBackground): void {
    this.background = type;
    const def = BATTLE_BACKGROUNDS[type];
    if (!this.textures.exists(def.key)) {
      this.load.image(def.key, def.path);
    }
  }

  private createBackground(): void {
    const def = BATTLE_BACKGROUNDS[this.background];
    if (this.textures.exists(def.key)) {
      this.add
        .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, def.key)
        .setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
        .setDepth(RenderDepth.BACKGROUND);
      return;
    }
    console.warn(
      `[BattleScene] background "${def.path}" not found - using flat fill 0x${BACKGROUND_FALLBACK_COLOR.toString(16).padStart(6, '0')}`,
    );
    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, BACKGROUND_FALLBACK_COLOR)
      .setDepth(RenderDepth.BACKGROUND);
  }

  // ---------------------------------------------------------------------
  // Pools (VFX from the canvas atlas)
  // ---------------------------------------------------------------------

  private createPools(): void {
    this.projectilePool = new ObjectPool(
      () =>
        this.add
          .image(0, 0, ATLAS_KEY, 'projectile')
          .setVisible(false)
          .setActive(false)
          .setDepth(RenderDepth.VFX),
      (img) => {
        img.setVisible(false).setActive(false);
      },
      8,
    );

    this.explosionPool = new ObjectPool(
      () =>
        this.add
          .image(0, 0, ATLAS_KEY, 'explosion_0')
          .setVisible(false)
          .setActive(false)
          .setDepth(RenderDepth.VFX + 1),
      (img) => {
        img.setVisible(false).setActive(false).setFrame('explosion_0');
      },
      8,
    );
  }

  // ---------------------------------------------------------------------
  // Battle events -> visuals
  // ---------------------------------------------------------------------

  private bindBattleEvents(): void {
    const ev = this.battle.events;
    this.unsubs.push(
      ev.on('battle:started', ({ units }) => {
        for (const u of units) {
          this.upsertUnitView(u);
        }
      }),
      ev.on('unit:selected', ({ unitId }) => {
        this.clearSelectionVisuals();
        if (unitId) {
          playSfx('select');
          this.drawSelectionHighlights(unitId);
        }
      }),
      ev.on('unit:moved', ({ unitId }) => {
        playSfx('move');
        const u = this.battle.getUnit(unitId);
        if (u) {
          this.upsertUnitView(u);
        }
        this.refreshSelectionHighlights();
      }),
      ev.on('unit:attacked', ({ attackerId, targetId }) => {
        playSfx('attack');
        const a = this.battle.getUnit(attackerId);
        const t = this.battle.getUnit(targetId);
        if (a && t) {
          this.spawnProjectile(a, t);
          this.updateBadge(t);
        }
        this.refreshSelectionHighlights();
      }),
      ev.on('unit:updated', ({ unitId }) => {
        const u = this.battle.getUnit(unitId);
        if (u) {
          this.updateBadge(u);
        }
      }),
      ev.on('combat:flank', ({ targetId }) => {
        const t = this.battle.getUnit(targetId);
        if (t) {
          this.updateBadge(t);
          flashHex(this, this.grid, t, COLOR_ATTACK, 500);
        }
      }),
      ev.on('unit:spawned', ({ unit, source }) => {
        this.upsertUnitView(unit);
        if (source === 'recruit') {
          if (unit.team === 'player') {
            playSfx('hire');
          }
          flashHex(this, this.grid, unit, unit.team === 'player' ? COLOR_MOVE : ENEMY_TINT, 700);
        }
      }),
      ev.on('upgrade:purchased', ({ team, typeId, level }) => {
        if (team === 'player') {
          playSfx('hire');
          this.showBanner(STR.upgraded(UNIT_TYPES[typeId].name, level), '#7dd8e8');
        }
        for (const unit of this.battle.getUnits()) {
          if (unit.alive && unit.team === team && unit.typeId === typeId) {
            this.updateBadge(unit);
            flashHex(this, this.grid, unit, team === 'player' ? COLOR_MOVE : ENEMY_TINT, 700);
            const view = this.unitViews.get(unit.id);
            if (view) {
              this.tweens.add({
                targets: view.sprite,
                scaleX: view.sprite.scaleX * 1.12,
                scaleY: view.sprite.scaleY * 1.12,
                yoyo: true,
                duration: 140,
                repeat: 1,
              });
            }
          }
        }
      }),
      ev.on('wave:spawned', ({ units }) => {
        // Reinforcements: pulse each spawn hex so the arrival reads as an action.
        for (const u of units) {
          flashHex(this, this.grid, u, ENEMY_TINT, 900);
        }
        this.showBanner(STR.reinforcements(units.length), '#ff8866');
      }),
      ev.on('energy:changed', () => this.refreshStatus()),
      ev.on('unit:died', ({ unitId }) => {
        playSfx('explode');
        const view = this.unitViews.get(unitId);
        if (view) {
          view.sprite.setVisible(false);
          view.badge.setVisible(false);
        }
      }),
      ev.on('turn:start', ({ team }) => {
        if (team === 'player') {
          this.aiAccumMs = 0;
        }
        // Nothing may stay highlighted between turns.
        clearAllOverlays(this);
        this.hoveredKey = null;
        this.refreshStatus();
      }),
      ev.on('battle:ended', ({ winner, reason }) => {
        clearAllOverlays(this);
        const won = winner === 'player';
        const label = won ? STR.victory : reason === 'turn_limit' ? STR.timeOut : STR.defeat;
        playSfx(won ? 'win' : 'lose');
        this.fleetPanel.refresh();
        if (won && this.missionId) {
          markMissionCompleted(this.missionId);
        }
        this.showEndOverlay(label, won);
      }),
    );
  }

  private refreshStatus(): void {
    if (!this.battle) {
      return;
    }
    const phase = this.battle.getPhase();
    const phaseLabel =
      phase === 'player' ? STR.yourTurn : phase === 'enemy' ? STR.enemyTurn : STR.battleOver;
    const upcoming = this.battle.getUpcomingWave();
    const names = upcoming ? upcoming.types.map((id) => UNIT_NAMES_RU[id]).join(', ') : '';
    updateBattleChrome({
      energy: this.battle.getEnergy('player'),
      phaseLabel,
      waveText: upcoming ? STR.waveForecast(upcoming.inTurns, names) : '',
      fleetOpen: this.fleetPanel?.isVisible() ?? true,
      canEndTurn: phase === 'player',
    });
    this.fleetPanel?.refresh();
  }

  /** Centered one-line notice that fades out. */
  private showBanner(text: string, color: string): void {
    const t = this.add
      .text(FIELD_WIDTH / 2, 96, text, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '26px',
        fontStyle: 'bold',
        color,
      })
      .setOrigin(0.5)
      .setDepth(RenderDepth.UI);
    this.tweens.add({
      targets: t,
      alpha: 0,
      y: 76,
      delay: 900,
      duration: 500,
      onComplete: () => t.destroy(),
    });
  }

  private showEndOverlay(label: string, won: boolean): void {
    showBattleEnd({
      title: label,
      won,
      campaign: Boolean(this.missionId),
      onCampaign: () => {
        playSfx('ui');
        this.leaveBattle('CampaignScene');
      },
      onRetry: () => {
        if (this.leaving) {
          return;
        }
        playSfx('ui');
        this.leaving = true;
        hideBattleEnd();
        this.scene.restart({ missionId: this.missionId ?? undefined });
      },
      onMenu: () => {
        playSfx('ui');
        this.leaveBattle('MenuScene');
      },
    });
  }

  // ---------------------------------------------------------------------
  // Unit views
  // ---------------------------------------------------------------------

  /** Create or re-position the sprite + badge of a unit. */
  private upsertUnitView(unit: BattleUnit): void {
    const { x, y } = this.grid.axialToPixel(unit.q, unit.r);
    let view = this.unitViews.get(unit.id);

    if (!view) {
      const sprite = this.createUnitSprite(unit);
      const badge = showHpBadge(this, this.grid, unit, unit.hp, unit.team === 'enemy');
      view = { sprite, badge };
      this.unitViews.set(unit.id, view);
    }

    view.sprite.setPosition(x, y).setVisible(unit.alive);
    view.badge.moveTo(unit);
    view.badge.setVisible(unit.alive);
    this.updateBadge(unit);
  }

  /**
   * Sprite from the 'units' atlas. Enemy frames are used when present in
   * units.json; otherwise the base frame gets ENEMY_TINT. A missing frame
   * yields a loud console.warn + a visible placeholder rectangle.
   */
  private createUnitSprite(
    unit: BattleUnit,
  ): Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle {
    const def = spriteKeys[unit.typeId];
    const isEnemy = unit.team === 'enemy';
    const atlas = this.textures.exists(UNITS_ATLAS_KEY)
      ? this.textures.get(UNITS_ATLAS_KEY)
      : null;

    const hasEnemyFrame = !!(atlas && def.enemyFrame && atlas.has(def.enemyFrame));
    const hasTurnedFrame = !!(atlas && def.turnedFrame && atlas.has(def.turnedFrame));
    // Both fleets use the 180° SW frames (NE source sprites face down-left).
    let frame = hasTurnedFrame ? def.turnedFrame! : def.frame;
    if (isEnemy && hasEnemyFrame) {
      frame = def.enemyFrame!;
    }

    if (!atlas || !atlas.has(frame)) {
      console.warn(
        `[BattleScene] frame "${frame}" for unit type "${unit.typeId}" not found in atlas "${UNITS_ATLAS_KEY}" - drawing placeholder`,
      );
      const size = this.grid.size * 1.1;
      return this.add
        .rectangle(0, 0, size, size, isEnemy ? 0xff3366 : 0x33ff99)
        .setStrokeStyle(2, 0xffffff)
        .setDepth(RenderDepth.UNIT);
    }

    const sprite = this.add.sprite(0, 0, UNITS_ATLAS_KEY, frame).setDepth(RenderDepth.UNIT);
    const longest = Math.max(sprite.frame.width, sprite.frame.height);
    sprite.setScale((this.grid.size * def.fit) / longest);
    if (!hasTurnedFrame && !hasEnemyFrame) {
      sprite.setAngle(180);
    }
    if (isEnemy && !hasEnemyFrame) {
      sprite.setTint(ENEMY_TINT);
    }
    return sprite;
  }

  /**
   * flagship: show shield while it is above 0, then hull. Two separate pools,
   * never summed. Ships: hull only.
   */
  private updateBadge(unit: BattleUnit): void {
    const view = this.unitViews.get(unit.id);
    if (!view) {
      return;
    }
    if (unit.maxShield > 0 && unit.shield > 0) {
      view.badge.updateText(unit.shield, 'shield');
    } else {
      view.badge.updateText(unit.hp, 'hp');
    }
  }

  // ---------------------------------------------------------------------
  // Selection highlights
  // ---------------------------------------------------------------------

  /** Green for reachable hexes, red on top for enemies in attack range. */
  private drawSelectionHighlights(unitId: string): void {
    for (const cell of this.battle.getMoveTargets(unitId)) {
      highlightHex(this, this.grid, cell, COLOR_MOVE);
    }
    for (const t of this.battle.getAttackTargets(unitId)) {
      highlightHex(this, this.grid, t, COLOR_ATTACK);
    }
  }

  private refreshSelectionHighlights(): void {
    this.clearSelectionVisuals();
    const id = this.battle.getSelectedUnitId();
    if (id) {
      this.drawSelectionHighlights(id);
    }
  }

  /** Highlights + preview path/damage; the hover hint is handled by pointer. */
  private clearSelectionVisuals(): void {
    clearHighlights(this);
    clearMovementPath(this);
    clearDamagePreview(this);
  }

  // ---------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.settings?.isOpen()) {
      return;
    }
    const overPanel = this.fleetPanel.containsPoint(pointer.worldX, pointer.worldY);
    const axial = this.grid.pixelToAxial(pointer.worldX, pointer.worldY);
    const key = !overPanel && this.grid.has(axial.q, axial.r) ? hexKey(axial.q, axial.r) : null;
    if (key === this.hoveredKey) {
      return;
    }
    this.hoveredKey = key;

    clearAttackHint(this);
    clearMovementPath(this);
    clearDamagePreview(this);

    if (!key || this.battle.getPhase() !== 'player') {
      return;
    }

    const occupant = this.battle.getUnitAt(axial.q, axial.r);
    if (occupant?.team === 'enemy') {
      showAttackHint(this, this.grid, axial);
    }

    const selectedId = this.battle.getSelectedUnitId();
    if (!selectedId) {
      return;
    }
    const selected = this.battle.getUnit(selectedId);
    if (!selected) {
      return;
    }

    if (!getSettings().showPaths) {
      return;
    }

    if (occupant?.team === 'enemy') {
      const inRange = this.battle
        .getAttackTargets(selectedId)
        .some((t) => t.id === occupant.id);
      if (inRange) {
        drawMovementPath(this, this.grid, selected, axial, COLOR_ATTACK);
        // Reflects asteroid cover on the target hex.
        showDamagePreview(this, this.grid, axial, this.battle.computeDamage(selected, occupant));
      }
      return;
    }

    if (!occupant) {
      const path = this.battle.previewPath(selectedId, axial.q, axial.r);
      if (path) {
        drawPath(this, this.grid, path, COLOR_MOVE);
      }
    }
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.settings?.isOpen()) {
      return;
    }
    if (this.battle.getPhase() !== 'player') {
      return;
    }
    // Clicks on the HUD column are handled by the panel's own buttons.
    if (this.fleetPanel.containsPoint(pointer.worldX, pointer.worldY)) {
      return;
    }

    const axial: Axial = this.grid.pixelToAxial(pointer.worldX, pointer.worldY);
    if (!this.grid.has(axial.q, axial.r)) {
      return;
    }

    const occupant = this.battle.getUnitAt(axial.q, axial.r);
    const selectedId = this.battle.getSelectedUnitId();

    if (occupant?.team === 'player' && UNIT_TYPES[occupant.typeId].isFlagship) {
      // "Entering" the flagship: open the recruit / upgrade screen.
      this.battle.selectUnit(null);
      playSfx('ui');
      this.setFleetPanelVisible(true);
      this.fleetPanel.pulse();
      return;
    }

    if (occupant?.team === 'player') {
      // Re-clicking the selected unit deselects it.
      this.battle.selectUnit(occupant.id === selectedId ? null : occupant.id);
      return;
    }

    if (selectedId && occupant?.team === 'enemy') {
      this.battle.attack(selectedId, occupant.id);
      return;
    }

    if (selectedId && !occupant) {
      if (!this.battle.moveUnit(selectedId, axial.q, axial.r)) {
        // Click on an unreachable empty hex drops the selection.
        this.battle.selectUnit(null);
      }
    }
  }

  // ---------------------------------------------------------------------
  // AI + VFX
  // ---------------------------------------------------------------------

  private tickAiThrottled(delta: number): void {
    if (this.battle.getPhase() !== 'enemy') {
      this.aiAccumMs = 0;
      return;
    }

    this.aiAccumMs += delta;
    if (this.aiAccumMs < AI_THROTTLE_MS) {
      return;
    }
    this.aiAccumMs = 0;
    this.battle.tickAi();
  }

  private spawnProjectile(attacker: BattleUnit, target: BattleUnit): void {
    const from = this.grid.axialToPixel(attacker.q, attacker.r);
    const to = this.grid.axialToPixel(target.q, target.r);
    const sprite = this.projectilePool.acquire();
    sprite.setPosition(from.x, from.y).setVisible(true).setActive(true).setFrame('projectile');

    this.activeProjectiles.push({
      sprite,
      x0: from.x,
      y0: from.y,
      x1: to.x,
      y1: to.y,
      t: 0,
      duration: 220,
      onArrive: () => this.spawnExplosion(to.x, to.y),
    });
  }

  private spawnExplosion(x: number, y: number): void {
    const sprite = this.explosionPool.acquire();
    sprite.setPosition(x, y).setVisible(true).setActive(true).setFrame('explosion_0');
    this.activeExplosions.push({ sprite, t: 0, frameIndex: 0 });
  }

  private updateProjectiles(delta: number): void {
    for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
      const p = this.activeProjectiles[i];
      p.t += delta;
      const u = Math.min(1, p.t / p.duration);
      p.sprite.setPosition(p.x0 + (p.x1 - p.x0) * u, p.y0 + (p.y1 - p.y0) * u);

      if (u >= 1) {
        p.onArrive();
        this.projectilePool.release(p.sprite);
        this.activeProjectiles.splice(i, 1);
      }
    }
  }

  private updateExplosions(delta: number): void {
    const frameMs = 60;
    for (let i = this.activeExplosions.length - 1; i >= 0; i--) {
      const e = this.activeExplosions[i];
      e.t += delta;
      const frameIndex = Math.min(3, Math.floor(e.t / frameMs));
      if (frameIndex !== e.frameIndex) {
        e.frameIndex = frameIndex;
        e.sprite.setFrame(`explosion_${frameIndex}`);
      }
      if (e.t >= frameMs * 4) {
        this.explosionPool.release(e.sprite);
        this.activeExplosions.splice(i, 1);
      }
    }
  }
}
