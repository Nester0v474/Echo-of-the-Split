/**
 * Yandex Games SDK wrapper. On the platform `/sdk.js` is the real loader.
 * Locally (or if the script 404s) we fall back to a compatible stub.
 */
import type Phaser from 'phaser';
import { applyAudioVolume, setAudioSuspended } from '../systems/Audio';
import { hydrateProgress } from '../systems/Progress';
import { hydrateSettings } from '../systems/Settings';
import { bindStore, type PersistStore } from './persist';

export interface YgStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface YgSdk {
  features?: {
    LoadingAPI?: { ready: () => void };
    GameplayAPI?: { start: () => void; stop: () => void };
  };
  getStorage?: () => Promise<YgStorage>;
  adv?: {
    showFullscreenAdv: (opts?: {
      callbacks?: {
        onOpen?: () => void;
        onClose?: (wasShown: boolean) => void;
        onError?: (error: unknown) => void;
      };
    }) => void;
  };
  on?: (event: string, handler: () => void) => void;
  off?: (event: string, handler: () => void) => void;
}

declare global {
  interface Window {
    YaGames?: { init: (opts?: { signed?: boolean }) => Promise<YgSdk> };
  }
}

let sdk: YgSdk | null = null;
let store: YgStorage | null = null;
let game: Phaser.Game | null = null;
let readySent = false;
let gameplayOn = false;

function memoryStorage(): YgStorage {
  const mem = new Map<string, string>();
  const ls = (): Storage | null => {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      return null;
    }
  };
  return {
    getItem(key) {
      if (mem.has(key)) {
        return mem.get(key) ?? null;
      }
      return ls()?.getItem(key) ?? null;
    },
    setItem(key, value) {
      mem.set(key, value);
      ls()?.setItem(key, value);
    },
    removeItem(key) {
      mem.delete(key);
      ls()?.removeItem(key);
    },
  };
}

function stubSdk(): YgSdk {
  const storage = memoryStorage();
  return {
    features: {
      LoadingAPI: { ready: () => undefined },
      GameplayAPI: { start: () => undefined, stop: () => undefined },
    },
    getStorage: () => Promise.resolve(storage),
    adv: {
      showFullscreenAdv: (opts) => {
        opts?.callbacks?.onClose?.(false);
      },
    },
    on: () => undefined,
    off: () => undefined,
  };
}

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
  gameplayStop();
}

function resumeGame(): void {
  setAudioSuspended(false);
  applyAudioVolume();
  game?.loop.wake();
}

/** Wake the loop if the tab is visible (iframe can start hidden, then stay asleep). */
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

export async function initPlatform(): Promise<void> {
  try {
    const api = window.YaGames;
    sdk = api ? await api.init() : stubSdk();
  } catch {
    sdk = stubSdk();
  }

  try {
    store = sdk.getStorage ? await sdk.getStorage() : memoryStorage();
  } catch {
    store = memoryStorage();
  }
  bindStore((store ?? memoryStorage()) as PersistStore);

  hydrateProgress();
  hydrateSettings();
  applyAudioVolume();

  document.addEventListener('visibilitychange', onVisibility);
  sdk.on?.('game_api_pause', pauseGame);
  sdk.on?.('game_api_resume', resumeGame);
  ensureResumed();
}

export function markGameReady(): void {
  if (readySent) {
    return;
  }
  readySent = true;
  try {
    sdk?.features?.LoadingAPI?.ready();
  } catch {
    /* platform may omit the feature */
  }
}

export function gameplayStart(): void {
  if (gameplayOn || document.hidden) {
    return;
  }
  gameplayOn = true;
  try {
    sdk?.features?.GameplayAPI?.start();
  } catch {
    /* optional */
  }
}

export function gameplayStop(): void {
  if (!gameplayOn) {
    return;
  }
  gameplayOn = false;
  try {
    sdk?.features?.GameplayAPI?.stop();
  } catch {
    /* optional */
  }
}

export function showFullscreenAdv(): Promise<void> {
  return new Promise((resolve) => {
    const adv = sdk?.adv;
    if (!adv?.showFullscreenAdv) {
      resolve();
      return;
    }
    let settled = false;
    const done = () => {
      if (settled) {
        return;
      }
      settled = true;
      resumeGame();
      resolve();
    };
    pauseGame();
    try {
      adv.showFullscreenAdv({
        callbacks: {
          onClose: () => done(),
          onError: () => done(),
        },
      });
    } catch {
      done();
    }
    window.setTimeout(done, 8000);
  });
}
