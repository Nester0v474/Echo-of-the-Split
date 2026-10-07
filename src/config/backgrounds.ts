/** Battle backdrops — one full-viewport image each (1920×1080), never tiled. */
export enum BattleBackground {
  ASTEROIDS = 'ASTEROIDS',
  STATION_BAY = 'STATION_BAY',
  NEBULA_FIELD = 'NEBULA_FIELD',
}

export interface BattleBackgroundDef {
  /** Phaser texture key. */
  key: string;
  /** Path relative to the served root. */
  path: string;
}

export const BATTLE_BACKGROUNDS: Record<BattleBackground, BattleBackgroundDef> = {
  [BattleBackground.ASTEROIDS]: {
    key: 'battle_bg_asteroids',
    path: 'assets/backgrounds/asteroids.png',
  },
  [BattleBackground.STATION_BAY]: {
    key: 'battle_bg_station_bay',
    path: 'assets/backgrounds/station_bay.png',
  },
  [BattleBackground.NEBULA_FIELD]: {
    key: 'battle_bg_nebula_field',
    path: 'assets/backgrounds/nebula_field.png',
  },
};

/** Dark-space fill used when a background file is missing on disk. */
export const BACKGROUND_FALLBACK_COLOR = 0x070a14;
