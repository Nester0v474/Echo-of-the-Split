import Phaser from 'phaser';
import { createGameAtlas } from '../assets/createGameAtlas';
import { UNITS_ATLAS_JSON, UNITS_ATLAS_KEY, UNITS_ATLAS_PNG } from '../config/constants';
import { BATTLE_BACKGROUNDS, BattleBackground } from '../config/backgrounds';
import { loadAudio } from '../systems/Audio';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    const bg = BATTLE_BACKGROUNDS[BattleBackground.ASTEROIDS];
    this.load.image(bg.key, bg.path);
    this.load.atlas(UNITS_ATLAS_KEY, UNITS_ATLAS_PNG, UNITS_ATLAS_JSON);
  }

  create(): void {
    createGameAtlas(this);
    void loadAudio();
    this.scene.start('MenuScene');
  }
}
