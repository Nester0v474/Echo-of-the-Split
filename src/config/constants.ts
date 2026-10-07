/** Logical resolution: Full HD on computer/tablet, compact landscape on phones. */
export let GAME_WIDTH = 1920;
export let GAME_HEIGHT = 1080;

/** Right-hand HUD column (fleet panel); the battlefield is centered in the rest. */
export let HUD_WIDTH = 480;
export let FIELD_WIDTH = GAME_WIDTH - HUD_WIDTH;

/** Distance from hex center to vertex (pointy-top). */
export let HEX_SIZE = 50;

/** Shortest viewport side below this uses the phone layout. */
export const PHONE_SHORT_SIDE = 600;

/** Landscape map: wide and short (player on the left, enemy on the right). */
export const HEX_COLS = 15;
export const HEX_ROWS = 9;

/** Canvas-generated atlas for VFX (projectile / explosion). */
export const ATLAS_KEY = 'game_atlas';

/** External unit atlas (assets/atlases/units.png + units.json). */
export const UNITS_ATLAS_KEY = 'units';
export const UNITS_ATLAS_PNG = 'assets/atlases/units.png';
export const UNITS_ATLAS_JSON = 'assets/atlases/units.json';

/** AI thinks at most once per this interval (ms). */
export const AI_THROTTLE_MS = 200;

// ---- Battle rules (GDD §2, §3, §4, §6, §9) ----

/** Headless simulator only — live battles have no turn cap. */
export const MAX_TURNS = 8;
/** Energy per turn from the flagship itself. */
export const BASE_INCOME = 3;
/** Extra energy per held RESOURCE hex. */
export const RESOURCE_INCOME = 2;
/** Both attacks of a flanking pair deal damage × this. */
export const FLANK_MULTIPLIER = 1.5;
/** Fraction of incoming damage absorbed by an ASTEROID hex. */
export const ASTEROID_DAMAGE_REDUCTION = 0.4;

export function isPhoneViewport(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return Math.min(window.innerWidth, window.innerHeight) < PHONE_SHORT_SIDE;
}

export function isPhoneLayout(): boolean {
  return GAME_WIDTH < 1600;
}

/** Call once before constructing Phaser.Game so scenes read the right sizes. */
export function configureLayout(): void {
  if (isPhoneViewport()) {
    GAME_WIDTH = 1280;
    GAME_HEIGHT = 720;
    HUD_WIDTH = 320;
    HEX_SIZE = 36;
  } else {
    GAME_WIDTH = 1920;
    GAME_HEIGHT = 1080;
    HUD_WIDTH = 480;
    HEX_SIZE = 50;
  }
  FIELD_WIDTH = GAME_WIDTH - HUD_WIDTH;
}
