import Phaser from 'phaser';
import { configureLayout } from './config/constants';
import { createGameConfig } from './config/gameConfig';
import { attachGame, ensureResumed, initPlatform } from './platform/yandex';
import { unlockAudio } from './systems/Audio';
import { mountOrientationGuard } from './ui/OrientationGuard';

async function boot(): Promise<void> {
  configureLayout();
  mountOrientationGuard();
  await initPlatform();
  attachGame(new Phaser.Game(createGameConfig()));
  ensureResumed();

  const unlock = (): void => {
    unlockAudio();
    ensureResumed();
    window.removeEventListener('pointerdown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
}

void boot();
