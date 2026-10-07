export type UnitId = 'scout' | 'fighter' | 'cruiser' | 'artillery' | 'flagship';

/** Team-wide upgrade track for one ship class, bought at the flagship. */
export interface UpgradeTrack {
  maxLevel: number;
  /** Energy cost of level 1; each next level costs `costStep` more. */
  baseCost: number;
  costStep: number;
  hpPerLevel: number;
  damagePerLevel: number;
}

export interface UnitTypeDef {
  id: UnitId;
  name: string;
  /** Short role description for the recruit card. */
  role: string;
  /** Hull points (for the flagship — hull, taken only after the shield is gone). */
  hp: number;
  damage: number;
  /** Attack range in hexes. */
  range: number;
  /** Movement range in hexes per turn. */
  moveRange: number;
  cost: number;
  /** Shield points; damage hits the shield first. 0 for ships. */
  shield: number;
  /** Shield restored at the start of each owner's turn. */
  shieldRegen: number;
  /**
   * The flagship: never moves, is not selectable, fires automatically at the
   * start of the owner's turn, recruits and upgrades the fleet. Losing it
   * loses the battle.
   */
  isFlagship: boolean;
  upgrade: UpgradeTrack;
}

const NO_UPGRADE: UpgradeTrack = { maxLevel: 0, baseCost: 0, costStep: 0, hpPerLevel: 0, damagePerLevel: 0 };

/** Balance from GDD §4 / §5. */
export const UNIT_TYPES: Record<UnitId, UnitTypeDef> = {
  scout: {
    id: 'scout',
    name: 'Разведчик',
    role: 'Быстрый, захватывает ресурсные гексы',
    hp: 30,
    damage: 6,
    range: 1,
    moveRange: 3,
    cost: 3,
    shield: 0,
    shieldRegen: 0,
    isFlagship: false,
    upgrade: { maxLevel: 3, baseCost: 3, costStep: 2, hpPerLevel: 6, damagePerLevel: 2 },
  },
  fighter: {
    id: 'fighter',
    name: 'Истребитель',
    role: 'Универсальный корабль линии',
    hp: 55,
    damage: 12,
    range: 2,
    moveRange: 2,
    cost: 5,
    shield: 0,
    shieldRegen: 0,
    isFlagship: false,
    upgrade: { maxLevel: 3, baseCost: 4, costStep: 2, hpPerLevel: 8, damagePerLevel: 3 },
  },
  artillery: {
    id: 'artillery',
    name: 'Артиллерия',
    role: 'Дальний бой, ломает щиты, хрупкая',
    hp: 40,
    damage: 20,
    range: 4,
    moveRange: 1,
    cost: 7,
    shield: 0,
    shieldRegen: 0,
    isFlagship: false,
    upgrade: { maxLevel: 3, baseCost: 5, costStep: 2, hpPerLevel: 6, damagePerLevel: 4 },
  },
  cruiser: {
    id: 'cruiser',
    name: 'Крейсер',
    role: 'Танк, держит фронт',
    hp: 100,
    damage: 14,
    range: 2,
    moveRange: 2,
    cost: 9,
    shield: 0,
    shieldRegen: 0,
    isFlagship: false,
    upgrade: { maxLevel: 3, baseCost: 6, costStep: 2, hpPerLevel: 15, damagePerLevel: 3 },
  },
  flagship: {
    id: 'flagship',
    name: 'Флагман',
    role: 'Мобильная база: нанимает и улучшает флот',
    hp: 120,
    damage: 10,
    range: 2,
    moveRange: 0,
    cost: 0,
    shield: 80,
    shieldRegen: 12,
    isFlagship: true,
    upgrade: NO_UPGRADE,
  },
};

export const UNIT_TYPE_LIST: readonly UnitTypeDef[] = Object.values(UNIT_TYPES);

/** Ship classes a flagship can recruit, in card order. */
export const RECRUITABLE: readonly UnitId[] = ['scout', 'fighter', 'artillery', 'cruiser'];

/** Energy cost of raising `typeId` from `level` to `level + 1`, or null at cap. */
export function upgradeCost(typeId: UnitId, level: number): number | null {
  const u = UNIT_TYPES[typeId].upgrade;
  if (level >= u.maxLevel) {
    return null;
  }
  return u.baseCost + u.costStep * level;
}
