/** Player settings persisted in browser storage. */
import { persistGet, persistSet } from '../platform/persist';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface GameSettings {
  difficulty: Difficulty;
  /** 0..1 master volume for generated SFX. */
  volume: number;
  /** Hover path / damage previews on the battlefield. */
  showPaths: boolean;
}

export interface DifficultyMods {
  enemyShieldRegen: number;
}

export const DIFFICULTY_MODS: Record<Difficulty, DifficultyMods> = {
  easy: { enemyShieldRegen: 10 },
  normal: { enemyShieldRegen: 12 },
  hard: { enemyShieldRegen: 15 },
};

const KEY = 'hex-tactics.settings.v1';

const DEFAULTS: GameSettings = { difficulty: 'normal', volume: 0.7, showPaths: true };

let cache: GameSettings | null = null;

export function hydrateSettings(): void {
  cache = null;
  getSettings();
}

export function getSettings(): GameSettings {
  if (cache) {
    return cache;
  }
  const raw = persistGet(KEY);
  let loaded: Partial<GameSettings> = {};
  if (raw) {
    try {
      loaded = JSON.parse(raw) as Partial<GameSettings>;
    } catch {
      loaded = {};
    }
  }
  cache = { ...DEFAULTS, ...loaded };
  return cache;
}

export function updateSettings(patch: Partial<GameSettings>): GameSettings {
  cache = { ...getSettings(), ...patch };
  persistSet(KEY, JSON.stringify(cache));
  return cache;
}

export function difficultyMods(): DifficultyMods {
  return DIFFICULTY_MODS[getSettings().difficulty];
}
