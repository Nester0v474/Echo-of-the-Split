import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_BY_ID,
  canEnterMission,
  getAvailableMissionIds,
  getCampaignNodeVisual,
  getCurrentMissionId,
  getRecommendedMissionId,
  isCampaignEdgeCompleted,
  isMissionAvailable,
  isMissionUnlocked,
} from './campaign';

describe('campaign graph states', () => {
  it('treats roots as available when nothing is completed', () => {
    expect(getCurrentMissionId([])).toBeNull();
    expect(getAvailableMissionIds([])).toEqual(['cassini']);
    expect(getCampaignNodeVisual(CAMPAIGN_BY_ID.cassini, [])).toBe('available');
    expect(getCampaignNodeVisual(CAMPAIGN_BY_ID.oberon, [])).toBe('locked');
    expect(getCampaignNodeVisual(CAMPAIGN_BY_ID.ark, [])).toBe('final');
    expect(canEnterMission(CAMPAIGN_BY_ID.cassini, [])).toBe(true);
    expect(canEnterMission(CAMPAIGN_BY_ID.ark, [])).toBe(false);
  });

  it('marks the last completed node as current and keeps both Cassini children open', () => {
    const progress = ['cassini'];
    expect(getCurrentMissionId(progress)).toBe('cassini');
    expect(getAvailableMissionIds(progress)).toEqual(['oberon', 'tycho']);
    expect(getCampaignNodeVisual(CAMPAIGN_BY_ID.cassini, progress)).toBe('current');
    expect(getCampaignNodeVisual(CAMPAIGN_BY_ID.oberon, progress)).toBe('available');
    expect(getCampaignNodeVisual(CAMPAIGN_BY_ID.sigma, progress)).toBe('locked');
    expect(canEnterMission(CAMPAIGN_BY_ID.cassini, progress)).toBe(false);
    expect(canEnterMission(CAMPAIGN_BY_ID.oberon, progress)).toBe(true);
  });

  it('does not lock Tycho after Oberon is completed', () => {
    const progress = ['cassini', 'oberon'];
    expect(getAvailableMissionIds(progress)).toEqual(['tycho', 'sigma']);
    expect(isMissionAvailable(CAMPAIGN_BY_ID.tycho, progress)).toBe(true);
    expect(isMissionAvailable(CAMPAIGN_BY_ID.sigma, progress)).toBe(true);
    expect(isCampaignEdgeCompleted('cassini', 'oberon', new Set(progress))).toBe(true);
    expect(isCampaignEdgeCompleted('cassini', 'tycho', new Set(progress))).toBe(false);
  });

  it('keeps Oberon open if the player took the Tycho branch first', () => {
    const progress = ['cassini', 'tycho'];
    expect(getAvailableMissionIds(progress)).toEqual(['oberon', 'erebus']);
    expect(isMissionAvailable(CAMPAIGN_BY_ID.oberon, progress)).toBe(true);
    expect(isMissionAvailable(CAMPAIGN_BY_ID.erebus, progress)).toBe(true);
  });

  it('unlocks Ash after either finished branch', () => {
    const bottom = ['cassini', 'tycho', 'erebus'];
    expect(isMissionUnlocked(CAMPAIGN_BY_ID.ash, new Set(bottom))).toBe(true);
    expect(canEnterMission(CAMPAIGN_BY_ID.ash, bottom)).toBe(true);
    expect(getRecommendedMissionId(bottom)).toBe('ash');
    expect(isMissionAvailable(CAMPAIGN_BY_ID.oberon, bottom)).toBe(true);

    const top = ['cassini', 'oberon', 'sigma'];
    expect(isMissionUnlocked(CAMPAIGN_BY_ID.ash, new Set(top))).toBe(true);
    expect(canEnterMission(CAMPAIGN_BY_ID.ash, top)).toBe(true);
    expect(getRecommendedMissionId(top)).toBe('ash');
    expect(isMissionAvailable(CAMPAIGN_BY_ID.tycho, top)).toBe(true);
  });

  it('lets the player enter the final node after Ash', () => {
    const progress = ['cassini', 'oberon', 'sigma', 'tycho', 'erebus', 'ash'];
    expect(getCampaignNodeVisual(CAMPAIGN_BY_ID.ark, progress)).toBe('final');
    expect(canEnterMission(CAMPAIGN_BY_ID.ark, progress)).toBe(true);
  });
});
