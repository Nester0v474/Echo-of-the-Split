import type { UnitId } from './units';

export interface UnitSpriteDef {
  /** Frame facing right (player side), name inside assets/atlases/units.json. */
  frame: string;
  /**
   * Same ship turned 180 degrees (faces left). Enemy ships use it so both
   * fleets look at each other. Falls back to `frame` + flipX when missing.
   */
  turnedFrame?: string;
  /**
   * Optional dedicated enemy recolour. If the atlas has it, it is used
   * without tint; otherwise the enemy gets ENEMY_TINT.
   */
  enemyFrame?: string;
  /**
   * Sprite's longest side as a multiple of the hex size (center to vertex).
   * Keeps ships inside their hex regardless of source PNG resolution.
   */
  fit: number;
}

/** Enemy faction tint when the atlas has no separate enemy frames. */
export const ENEMY_TINT = 0xff8866;

/**
 * Explicit unit id -> atlas frame map. Frame names must match units.json
 * exactly; the scene warns and draws a placeholder if a frame is missing.
 */
export const spriteKeys: Record<UnitId, UnitSpriteDef> = {
  scout: { frame: 'scout', turnedFrame: 'scout_sw', enemyFrame: 'scout_enemy', fit: 1.35 },
  fighter: { frame: 'fighter', turnedFrame: 'fighter_sw', enemyFrame: 'fighter_enemy', fit: 1.4 },
  cruiser: { frame: 'cruiser', turnedFrame: 'cruiser_sw', enemyFrame: 'cruiser_enemy', fit: 1.55 },
  artillery: { frame: 'artillery', turnedFrame: 'artillery_sw', enemyFrame: 'artillery_enemy', fit: 1.5 },
  // The flagship is deliberately larger than its hex - it is the "castle".
  flagship: { frame: 'flagship', turnedFrame: 'flagship_sw', enemyFrame: 'flagship_enemy', fit: 2.6 },
};
