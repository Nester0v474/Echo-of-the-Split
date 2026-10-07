/**
 * Campaign: a tree of sector nodes leading to the final ship of the Cut-off.
 * Positions are fractions of the campaign map area (x: left → right = progress).
 */
import type { UnitId } from './units';

export interface MissionRules {
  /** Enemy reinforcements by schedule (GDD §8). */
  waves: boolean;
  /** Added to the difficulty's enemy shield regen. */
  enemyRegenDelta?: number;
  /** Pull both fleets toward the center so the first fight stays close. */
  closeQuarters?: boolean;
  /** Enemy flagship overrides (final boss is tougher). */
  enemyFlagshipShield?: number;
  enemyFlagshipHp?: number;
  /** Starting enemy ships, placed on ENEMY_SLOTS in order. */
  enemyFleet: readonly UnitId[];
  /** Starting player ships, placed on PLAYER_SLOTS in order. */
  playerFleet: readonly UnitId[];
  playerStartEnergy?: number;
}

export interface MissionDef {
  id: string;
  /** Node caption on the map. */
  title: string;
  /** Where in the sector. */
  place: string;
  /** 3-4 short lines shown in the briefing before the battle. */
  lore: readonly string[];
  /** Line shown on the node after it is completed. */
  outcome: string;
  /** Parent nodes. By default any one completed parent unlocks the node. */
  requires: readonly string[];
  requireAll?: boolean;
  x: number;
  y: number;
  final?: boolean;
  rules: MissionRules;
}

export const CAMPAIGN: readonly MissionDef[] = [
  {
    id: 'cassini',
    title: 'Маяк Кассини',
    place: 'Внешний рубеж, узел 1',
    lore: [
      'Врата Кассини погасли первыми — девять лет назад. С тех пор сектор молчит.',
      '«Эхо Раскола» прошла через последние живые врата. Назад дороги нет, пока не зажжём следующие.',
      'На маяке — глушилка Отрезанных и дежурный патруль. Снесите флагман глушилки, и ретранслятор оживёт.',
      'Разведчик берёт ресурсные гексы, артиллерия ломает щит с четырёх клеток.',
    ],
    outcome: 'Маяк горит. Первый сигнал ушёл в метрополию.',
    requires: [],
    x: 0.08,
    y: 0.5,
    rules: {
      waves: false,
      closeQuarters: true,
      enemyRegenDelta: -6,
      enemyFlagshipShield: 36,
      enemyFlagshipHp: 48,
      enemyFleet: ['fighter', 'scout'],
      playerFleet: ['fighter', 'scout', 'artillery'],
      playerStartEnergy: 5,
    },
  },
  {
    id: 'oberon',
    title: 'Верфь Оберона',
    place: 'Орбитальные доки',
    lore: [
      'На Обероне строили половину кораблей рукава. Теперь здесь клепают канонерки Отрезанных.',
      'Разведка видит артиллерию на стапелях — она простреливает подходы на четыре гекса.',
      'Прижимайтесь к астероидам: укрытие режет урон почти вдвое.',
    ],
    outcome: 'Верфь взята. Часть доков уже работает на нас.',
    requires: ['cassini'],
    x: 0.3,
    y: 0.25,
    rules: {
      waves: true,
      enemyFleet: ['artillery', 'fighter', 'scout', 'fighter'],
      playerFleet: ['fighter', 'scout', 'artillery'],
    },
  },
  {
    id: 'tycho',
    title: 'Пояс Тихо',
    place: 'Астероидное поле',
    lore: [
      'Пояс Тихо — каменная каша, в которой Отрезанные прячут крейсеры.',
      'Крейсер держит сотню корпуса. В лоб его не возьмёшь — только с двух сторон, фланговым залпом.',
      'Их флагман стоит глубоко. Готовьте артиллерию заранее.',
    ],
    outcome: 'Пояс зачищен. Маршрут через поле открыт.',
    requires: ['cassini'],
    x: 0.3,
    y: 0.75,
    rules: {
      waves: true,
      enemyFleet: ['cruiser', 'fighter', 'scout'],
      playerFleet: ['fighter', 'scout', 'artillery'],
    },
  },
  {
    id: 'sigma',
    title: 'Ретранслятор Сигма',
    place: 'Узел связи',
    lore: [
      'Сигма — сердце сети этого сектора. Зажжём его — заговорят сразу четыре колонии.',
      'Отрезанные это понимают. Подкрепления пойдут каждым ходом.',
      'Не растягивайте флот: флагман прикрывает себя сам, но только в двух гексах.',
    ],
    outcome: 'Ретранслятор в сети. Четыре колонии вышли на связь.',
    requires: ['oberon'],
    x: 0.52,
    y: 0.18,
    rules: {
      waves: true,
      enemyRegenDelta: 1,
      enemyFleet: ['fighter', 'fighter', 'artillery', 'scout'],
      playerFleet: ['fighter', 'fighter', 'scout', 'artillery'],
    },
  },
  {
    id: 'erebus',
    title: 'Карантин Эреба',
    place: 'Закрытая колония',
    lore: [
      'Журналы Эреба читаются без расшифровки. Врата здесь погасила не глушилка Отрезанных.',
      'Их отключила метрополия. Сектор сочли нерентабельным и списали вместе с людьми.',
      'Отрезанные правы в своей ненависти. Но глушилка на орбите всё ещё держит колонию в темноте.',
      'Зажгите врата. С остальным разберёмся потом.',
    ],
    outcome: 'Эреб в сети. Экипаж знает правду — и молчит пока.',
    requires: ['tycho'],
    x: 0.52,
    y: 0.82,
    rules: {
      waves: true,
      enemyFleet: ['cruiser', 'artillery', 'fighter'],
      playerFleet: ['fighter', 'fighter', 'scout', 'artillery'],
    },
  },
  {
    id: 'ash',
    title: 'Станция Пепел',
    place: 'Передовая база Отрезанных',
    lore: [
      'Пепел — последняя станция перед их столицей. Здесь собрано всё, что у Отрезанных осталось.',
      'Два крейсера на входе, артиллерия за ними. Подкрепления не кончаются — не затягивайте.',
      'Копите энергию первые два хода. Залп нужен один — но полный.',
    ],
    outcome: 'Станция сгорела. Путь к Ковчегу свободен.',
    requires: ['sigma', 'erebus'],
    x: 0.74,
    y: 0.5,
    rules: {
      waves: true,
      enemyRegenDelta: 2,
      enemyFleet: ['cruiser', 'cruiser', 'artillery', 'fighter'],
      playerFleet: ['cruiser', 'fighter', 'scout', 'artillery'],
      playerStartEnergy: 4,
    },
  },
  {
    id: 'ark',
    title: 'Ковчег',
    place: 'Флагман Отрезанных',
    lore: [
      '«Ковчег» — колониальный транспорт, который так и не долетел. Отрезанные сделали из него крепость.',
      'Щит в полтора раза толще нашего и регенерирует быстрее. Его не пробить без флангов.',
      'За ним — главные врата сектора. Зажжём их — и сеть снова целая.',
      'Что делать с сетью дальше — решать вам.',
    ],
    outcome: 'Ковчег пал. Сеть сектора восстановлена.',
    requires: ['ash'],
    x: 0.93,
    y: 0.5,
    final: true,
    rules: {
      waves: true,
      enemyRegenDelta: 3,
      enemyFlagshipShield: 120,
      enemyFlagshipHp: 160,
      enemyFleet: ['cruiser', 'artillery', 'artillery', 'fighter'],
      playerFleet: ['cruiser', 'fighter', 'fighter', 'artillery'],
      playerStartEnergy: 6,
    },
  },
];

export const CAMPAIGN_BY_ID: Record<string, MissionDef> = Object.fromEntries(
  CAMPAIGN.map((m) => [m.id, m]),
);

/** Visual state of a map node. FINAL overrides the others for painting. */
export type CampaignNodeVisual = 'current' | 'available' | 'completed' | 'locked' | 'final';

export function isMissionUnlocked(mission: MissionDef, completed: ReadonlySet<string>): boolean {
  if (mission.requires.length === 0) {
    return true;
  }
  return mission.requireAll
    ? mission.requires.every((id) => completed.has(id))
    : mission.requires.some((id) => completed.has(id));
}

/** Last completed mission — the player's current position on the graph. */
export function getCurrentMissionId(completedInOrder: readonly string[]): string | null {
  return completedInOrder.length > 0 ? completedInOrder[completedInOrder.length - 1]! : null;
}

/**
 * Every unlocked incomplete node. Completing one branch (Оберон) does not
 * close the other (Тихо / Эреб).
 */
export function getAvailableMissionIds(completedInOrder: readonly string[]): readonly string[] {
  const completed = new Set(completedInOrder);
  return CAMPAIGN.filter(
    (mission) => !completed.has(mission.id) && isMissionUnlocked(mission, completed),
  ).map((mission) => mission.id);
}

/** Furthest unlocked node — after a finished branch this is Пепел, not a leftover side node. */
export function getRecommendedMissionId(completedInOrder: readonly string[]): string | null {
  const available = getAvailableMissionIds(completedInOrder);
  if (available.length === 0) {
    return null;
  }
  return [...available].sort((a, b) => {
    const dx = CAMPAIGN_BY_ID[b]!.x - CAMPAIGN_BY_ID[a]!.x;
    if (Math.abs(dx) > 0.001) {
      return dx;
    }
    return CAMPAIGN_BY_ID[a]!.y - CAMPAIGN_BY_ID[b]!.y;
  })[0]!;
}

export function isMissionAvailable(mission: MissionDef, completedInOrder: readonly string[]): boolean {
  return getAvailableMissionIds(completedInOrder).includes(mission.id);
}

export function canEnterMission(mission: MissionDef, completedInOrder: readonly string[]): boolean {
  return isMissionAvailable(mission, completedInOrder);
}

export function getCampaignNodeVisual(
  mission: MissionDef,
  completedInOrder: readonly string[],
): CampaignNodeVisual {
  if (mission.final) {
    return 'final';
  }
  if (completedInOrder.includes(mission.id)) {
    return getCurrentMissionId(completedInOrder) === mission.id ? 'current' : 'completed';
  }
  if (isMissionAvailable(mission, completedInOrder)) {
    return 'available';
  }
  return 'locked';
}

export function isCampaignEdgeCompleted(
  parentId: string,
  childId: string,
  completed: ReadonlySet<string>,
): boolean {
  return completed.has(parentId) && completed.has(childId);
}
