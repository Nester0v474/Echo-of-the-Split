import { describe, expect, it } from 'vitest';
import { DEMO_MAP, buildMissionSpawns, createGridFromMap } from './battleMap';
import { CAMPAIGN_BY_ID } from './campaign';
import { UNIT_TYPES } from './units';
import { BattleSystem } from '../systems/BattleSystem';
import { hexDistance } from '../systems/HexGrid';

function drainAi(battle: BattleSystem): void {
  while (battle.tickAi()) {
    /* process one enemy unit per call */
  }
}

function rushPlayer(battle: BattleSystem): void {
  const enemyFlag = battle.getFlagship('enemy');
  if (!enemyFlag) {
    return;
  }
  const ships = battle
    .getUnits()
    .filter((u) => u.alive && u.team === 'player' && !UNIT_TYPES[u.typeId].isFlagship)
    .sort((a, b) => UNIT_TYPES[b.typeId].damage - UNIT_TYPES[a.typeId].damage);

  for (const ship of ships) {
    const inFlagRange = hexDistance(ship, enemyFlag) <= ship.range;
    if (inFlagRange && !ship.hasAttacked) {
      battle.attack(ship.id, enemyFlag.id);
      continue;
    }
    const moves = battle.getMoveTargets(ship.id);
    if (moves.length > 0) {
      moves.sort((a, b) => hexDistance(a, enemyFlag) - hexDistance(b, enemyFlag));
      const step = moves[0]!;
      battle.moveUnit(ship.id, step.q, step.r);
    }
    const live = battle.getUnit(ship.id);
    const flag = battle.getFlagship('enemy');
    if (live && flag && hexDistance(live, flag) <= live.range) {
      battle.attack(ship.id, flag.id);
    }
  }
}

describe('Cassini pace', () => {
  it('can be won within 8 turns by rushing the enemy flagship', () => {
    const mission = CAMPAIGN_BY_ID.cassini;
    const battle = new BattleSystem(createGridFromMap(DEMO_MAP), {
      autoEnemyAi: true,
      waveSchedule: null,
      maxTurns: 8,
      startingEnergyByTeam: { player: mission.rules.playerStartEnergy ?? 0, enemy: 0 },
      shieldRegenByTeam: { player: UNIT_TYPES.flagship.shieldRegen, enemy: 8 },
    });
    battle.start(buildMissionSpawns(mission));

    let ended: { winner: string | null; reason: string; turnNumber: number } | null = null;
    battle.events.on('battle:ended', (info) => {
      ended = info;
    });

    for (let i = 0; i < 8 && !ended; i++) {
      rushPlayer(battle);
      battle.endPlayerTurn();
      drainAi(battle);
    }

    expect(ended).not.toBeNull();
    expect(ended!.winner).toBe('player');
    expect(ended!.turnNumber).toBeLessThanOrEqual(8);
  });
});
