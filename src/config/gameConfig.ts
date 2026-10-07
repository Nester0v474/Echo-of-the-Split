import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { MenuScene } from '../scenes/MenuScene';
import { CampaignScene } from '../scenes/CampaignScene';
import { BattleScene } from '../scenes/BattleScene';
import { GAME_WIDTH, GAME_HEIGHT } from './constants';

export {
  GAME_WIDTH,
  GAME_HEIGHT,
  HEX_SIZE,
  HEX_COLS,
  HEX_ROWS,
} from './constants';

export function createGameConfig(): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#0a0a12',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      fullscreenTarget: 'game-container',
    },
    scene: [BootScene, MenuScene, CampaignScene, BattleScene],
  };
}
