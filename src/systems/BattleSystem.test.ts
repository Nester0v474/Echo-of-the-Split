import { describe, expect, it } from 'vitest';
import { BattleSystem } from './BattleSystem';
import { HexGrid, HexType, areOppositeNeighbors, getNeighbors } from './HexGrid';
import type { UnitSpawn } from '../entities/Unit';

/** Grid without flagships so battles end by elimination, no waves. */
function makeBattle(spawns: UnitSpawn[], grid = new HexGrid(9, 11)) {
  const b = new BattleSystem(grid, { waveSchedule: null, autoEnemyAi: false });
  b.start(spawns);
  return b;
}

describe('areOppositeNeighbors', () => {
  it('detects opposite pairs around a center', () => {
    const c = { q: 3, r: 5 };
    const n = getNeighbors(c.q, c.r);
    // Directions are listed in order; i and i+3 are opposite.
    for (let i = 0; i < 3; i++) {
      expect(areOppositeNeighbors(c, n[i], n[i + 3])).toBe(true);
      expect(areOppositeNeighbors(c, n[i], n[i + 1])).toBe(false);
      expect(areOppositeNeighbors(c, n[i], n[(i + 2) % 6])).toBe(false);
    }
  });

  it('rejects non-neighbours even when collinear', () => {
    const c = { q: 0, r: 0 };
    expect(areOppositeNeighbors(c, { q: 2, r: 0 }, { q: -2, r: 0 })).toBe(false);
    expect(areOppositeNeighbors(c, { q: 1, r: 0 }, { q: -2, r: 0 })).toBe(false);
  });
});

describe('flanking bonus', () => {
  const target = { q: 3, r: 5 };
  const baseSpawns = (): UnitSpawn[] => [
    { id: 'a1', typeId: 'scout', team: 'player', q: 4, r: 5, overrides: { damage: 10 } },
    { id: 'a2', typeId: 'scout', team: 'player', q: 2, r: 5, overrides: { damage: 10 } },
    { id: 't', typeId: 'cruiser', team: 'enemy', q: target.q, r: target.r, overrides: { hp: 100 } },
    // Far-away enemy so the battle does not end on elimination mid-test
    { id: 'spare', typeId: 'scout', team: 'enemy', q: 0, r: 0 },
  ];

  it('two attackers on opposite hexes with 10 damage each deal 30 total, not 20', () => {
    const b = makeBattle(baseSpawns());
    const flankEvents: number[] = [];
    b.events.on('combat:flank', (e) => flankEvents.push(e.bonusDamage));

    expect(b.attack('a1', 't')).toBe(true);
    expect(b.getUnit('t')!.hp).toBe(90);

    expect(b.attack('a2', 't')).toBe(true);
    expect(b.getUnit('t')!.hp).toBe(70);
    expect(flankEvents).toEqual([5]);
  });

  it('does not trigger for two adjacent attackers that are not opposite', () => {
    const spawns = baseSpawns();
    spawns[1] = { ...spawns[1], q: 3, r: 4 }; // neighbour, but 60° off, not 180°
    const b = makeBattle(spawns);
    b.attack('a1', 't');
    b.attack('a2', 't');
    expect(b.getUnit('t')!.hp).toBe(80);
  });

  it('does not accumulate across turns (first hit this turn, opposite hit next turn)', () => {
    const b = makeBattle(baseSpawns());
    const flankEvents: unknown[] = [];
    b.events.on('combat:flank', (e) => flankEvents.push(e));

    b.attack('a1', 't');
    expect(b.getUnit('t')!.hp).toBe(90);

    b.endTurn(); // enemy phase (manual, nothing happens)
    b.endTurn(); // back to player, turn 2 — flank table must be reset
    expect(b.getPhase()).toBe('player');

    b.attack('a2', 't');
    expect(b.getUnit('t')!.hp).toBe(80); // plain 10, no retroactive bonus
    expect(flankEvents).toHaveLength(0);
  });

  it('is scoped to one team: an enemy hit from the opposite hex does not pair with a player hit', () => {
    const b = makeBattle([
      { id: 'p_hit', typeId: 'scout', team: 'player', q: 4, r: 5, overrides: { damage: 10 } },
      { id: 't', typeId: 'cruiser', team: 'enemy', q: 3, r: 5, overrides: { hp: 100 } },
      // Enemy stands west of its own cruiser and fires at a player unit north of it.
      { id: 'e_ally', typeId: 'scout', team: 'enemy', q: 2, r: 5, overrides: { damage: 10 } },
      { id: 'p_victim', typeId: 'cruiser', team: 'player', q: 2, r: 4, overrides: { hp: 100 } },
    ]);
    b.attack('p_hit', 't');
    b.endTurn();
    expect(b.getPhase()).toBe('enemy');
    expect(b.attack('e_ally', 'p_victim')).toBe(true);
    expect(b.getUnit('p_victim')!.hp).toBe(90);
    expect(b.getUnit('t')!.hp).toBe(90);
  });
});

describe('ASTEROID hex', () => {
  it('reduces incoming damage by 40% rounded down', () => {
    const grid = new HexGrid(9, 11);
    grid.setType(3, 5, HexType.ASTEROID);
    const b = makeBattle(
      [
        { id: 'a', typeId: 'scout', team: 'player', q: 4, r: 5, overrides: { damage: 6 } },
        { id: 't', typeId: 'cruiser', team: 'enemy', q: 3, r: 5, overrides: { hp: 100 } },
      ],
      grid,
    );
    b.attack('a', 't');
    // 6 * 0.6 = 3.6 -> 3
    expect(b.getUnit('t')!.hp).toBe(97);
  });

  it('shortens the attacker range by one (minimum 1)', () => {
    const grid = new HexGrid(9, 11);
    grid.setType(1, 5, HexType.ASTEROID);
    const b = makeBattle(
      [
        // artillery range 4 -> 3 on asteroid; target at distance 4
        { id: 'art', typeId: 'artillery', team: 'player', q: 1, r: 5 },
        { id: 'far', typeId: 'cruiser', team: 'enemy', q: 5, r: 5 },
        { id: 'near', typeId: 'cruiser', team: 'enemy', q: 4, r: 5 },
        // scout range 1 stays 1
        { id: 'sc', typeId: 'scout', team: 'player', q: 1, r: 6 },
      ],
      grid,
    );
    grid.setType(1, 6, HexType.ASTEROID);

    expect(b.effectiveRange(b.getUnit('art')!)).toBe(3);
    expect(b.effectiveRange(b.getUnit('sc')!)).toBe(1);
    expect(b.getAttackTargets('art').map((u) => u.id)).toEqual(['near']);
    expect(b.attack('art', 'far')).toBe(false);
    expect(b.attack('art', 'near')).toBe(true);
  });
});

describe('wave schedule', () => {
  it('spawns scheduled reinforcements next to the enemy flagship at the start of the enemy phase', () => {
    const grid = new HexGrid(9, 11);
    const b = new BattleSystem(grid, {
      autoEnemyAi: false,
      waveSchedule: { 2: ['scout'], 3: ['fighter', 'artillery'] },
    });
    const waves: Array<{ turn: number; types: string[] }> = [];
    b.events.on('wave:spawned', (e) =>
      waves.push({ turn: e.turnNumber, types: e.units.map((u) => u.typeId) }),
    );
    b.start([
      { id: 'p_base', typeId: 'flagship', team: 'player', q: -1, r: 10 },
      { id: 'e_base', typeId: 'flagship', team: 'enemy', q: 4, r: 0 },
      { id: 'p1', typeId: 'scout', team: 'player', q: 0, r: 9 },
    ]);

    b.endTurn(); // -> enemy, turn 1: no wave
    b.endTurn(); // -> player, turn 2
    b.endTurn(); // -> enemy, turn 2: scout
    b.endTurn(); // -> player, turn 3
    b.endTurn(); // -> enemy, turn 3: fighter + artillery

    expect(waves).toEqual([
      { turn: 2, types: ['scout'] },
      { turn: 3, types: ['fighter', 'artillery'] },
    ]);

    const spawned = b.getUnits().filter((u) => u.id.startsWith('w'));
    expect(spawned).toHaveLength(3);
    for (const u of spawned) {
      expect(u.team).toBe('enemy');
      expect(Math.abs(u.q - 4) + Math.abs(u.r - 0)).toBeLessThanOrEqual(2);
      expect(grid.has(u.q, u.r)).toBe(true);
    }
    // No two units share a hex
    const keys = new Set(b.getUnits().filter((u) => u.alive).map((u) => `${u.q},${u.r}`));
    expect(keys.size).toBe(b.getUnits().filter((u) => u.alive).length);
  });
});

describe('flagship: recruit and upgrades', () => {
  function flagshipBattle() {
    const b = new BattleSystem(new HexGrid(9, 11), {
      autoEnemyAi: false,
      waveSchedule: null,
      startingEnergy: 20,
    });
    b.start([
      { id: 'p_flag', typeId: 'flagship', team: 'player', q: -1, r: 10 },
      { id: 'e_flag', typeId: 'flagship', team: 'enemy', q: 4, r: 0 },
      { id: 'sc', typeId: 'scout', team: 'player', q: 0, r: 8 },
    ]);
    return b;
  }

  it('recruits next to the flagship, charges energy, unit acts next turn', () => {
    const b = flagshipBattle();
    const before = b.getEnergy('player'); // 20 + income 3
    const u = b.recruit('player', 'fighter');
    expect(u).not.toBeNull();
    expect(b.getEnergy('player')).toBe(before - 5);
    expect(Math.abs(u!.q - -1) + Math.abs(u!.r - 10)).toBeLessThanOrEqual(2);
    expect(u!.hasMoved && u!.hasAttacked).toBe(true);
    expect(b.getMoveTargets(u!.id)).toEqual([]);
  });

  it('upgrade raises class stats for living ships and future recruits', () => {
    const b = flagshipBattle();
    const energy = b.getEnergy('player');
    expect(b.getUpgradeCost('player', 'scout')).toBe(3);
    expect(b.upgradeUnitType('player', 'scout')).toBe(true);
    expect(b.getEnergy('player')).toBe(energy - 3);
    expect(b.getUpgradeLevel('player', 'scout')).toBe(1);

    const existing = b.getUnit('sc')!;
    expect(existing.hp).toBe(36);
    expect(existing.maxHp).toBe(36);
    expect(existing.damage).toBe(8);

    const fresh = b.recruit('player', 'scout')!;
    expect(fresh.hp).toBe(36);
    expect(fresh.damage).toBe(8);

    // Enemy scouts are unaffected.
    expect(b.getClassStats('enemy', 'scout')).toEqual({ hp: 30, damage: 6, level: 0 });
    // Next level costs more.
    expect(b.getUpgradeCost('player', 'scout')).toBe(5);
  });

  it('rejects upgrades at max level or without energy', () => {
    const b = new BattleSystem(new HexGrid(9, 11), { autoEnemyAi: false, waveSchedule: null });
    b.start([
      { id: 'p_flag', typeId: 'flagship', team: 'player', q: -1, r: 10 },
      { id: 'e_flag', typeId: 'flagship', team: 'enemy', q: 4, r: 0 },
    ]);
    // Only 3 energy on turn 1: cruiser upgrade (6) is unaffordable.
    expect(b.upgradeUnitType('player', 'cruiser')).toBe(false);
    expect(b.upgradeUnitType('player', 'scout')).toBe(true); // costs exactly 3
    expect(b.upgradeUnitType('player', 'flagship')).toBe(false); // no track
  });
});

describe('turn limit', () => {
  it('does not end the battle when no turn cap is set', () => {
    const b = new BattleSystem(new HexGrid(9, 11), {
      autoEnemyAi: false,
      waveSchedule: null,
    });
    b.start([
      { id: 'p', typeId: 'scout', team: 'player', q: 0, r: 9 },
      { id: 'e', typeId: 'scout', team: 'enemy', q: 4, r: 0 },
    ]);
    for (let i = 0; i < 20; i++) {
      b.endTurn();
    }
    expect(b.getPhase()).not.toBe('ended');
    expect(b.getTurnNumber()).toBeGreaterThan(8);
  });

  it('ends in a draw when an explicit maxTurns is exceeded', () => {
    const b = new BattleSystem(new HexGrid(9, 11), {
      autoEnemyAi: false,
      waveSchedule: null,
      maxTurns: 2,
    });
    let ended: { winner: unknown; reason: string } | null = null;
    b.events.on('battle:ended', (e) => (ended = { winner: e.winner, reason: e.reason }));
    b.start([
      { id: 'p', typeId: 'scout', team: 'player', q: 0, r: 9 },
      { id: 'e', typeId: 'scout', team: 'enemy', q: 4, r: 0 },
    ]);
    b.endTurn();
    b.endTurn(); // turn 2
    b.endTurn();
    b.endTurn(); // would be turn 3 > 2
    expect(b.getPhase()).toBe('ended');
    expect(ended).toEqual({ winner: null, reason: 'turn_limit' });
  });
});
