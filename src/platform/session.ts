/** Local session: saves in the browser, pause when the tab is hidden. */
import type Phaser from 'phaser';
import { applyAudioVolume, setAudioSuspended } from '../systems/Audio';
import { hydrateProgress } from '../systems/Progress';
import { hydrateSettings } from '../systems/Settings';
import { bindStore } from './persist';

let game: Phaser.Game | null = null;

export function attachGame(instance: Phaser.Game): void {
  game = instance;
  const syncScale = (): void => {
    requestAnimationFrame(() => instance.scale.refresh());
  };
  document.addEventListener('fullscreenchange', syncScale);
  document.addEventListener('webkitfullscreenchange', syncScale);
}

function pauseGame(): void {
  setAudioSuspended(true);
  game?.loop.sleep();
}

function resumeGame(): void {
  setAudioSuspended(false);
  applyAudioVolume();
  game?.loop.wake();
}

export function ensureResumed(): void {
  if (!document.hidden) {
    resumeGame();
  }
}

function onVisibility(): void {
  if (document.hidden) {
    pauseGame();
  } else {
    resumeGame();
  }
}

export function initPlatform(): void {
  bindStore({
    getItem(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      localStorage.setItem(key, value);
    },
    removeItem(key) {
      localStorage.removeItem(key);
    },
  });
  hydrateProgress();
  hydrateSettings();
  applyAudioVolume();
  document.addEventListener('visibilitychange', onVisibility);
  ensureResumed();
}
