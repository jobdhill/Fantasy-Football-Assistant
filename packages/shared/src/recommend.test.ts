import { describe, expect, it } from 'vitest';
import { recommend, type AvailablePlayer, type RecommendInput } from './recommend';
import { DEFAULT_SETTINGS, type Player, type Position } from './types';

let nextId = 0;
function ap(position: Position, rank: number, extra: Partial<AvailablePlayer> = {}): AvailablePlayer {
  const player: Player = { id: `p${nextId++}`, name: `Player ${rank} ${position}`, position, team: 'FA' };
  return { player, rank, ...extra };
}

function input(overrides: Partial<RecommendInput>): RecommendInput {
  return {
    available: [],
    settings: DEFAULT_SETTINGS,
    myPositionCounts: {},
    currentOverall: 1,
    picksUntilNext: 10,
    recentPositions: [],
    ...overrides,
  };
}

describe('recommend', () => {
  it('returns empty for no available players', () => {
    expect(recommend(input({}))).toHaveLength(0);
  });

  it('prefers a faller over an equally-ranked player at ADP', () => {
    const faller = ap('WR', 10, { adp: 5 });
    const normal = ap('RB', 10, { adp: 30 });
    const recs = recommend(input({ available: [faller, normal], currentOverall: 20 }));
    const f = recs.find((r) => r.player.id === faller.player.id)!;
    const n = recs.find((r) => r.player.id === normal.player.id)!;
    expect(f.breakdown.value).toBeGreaterThan(n.breakdown.value);
  });

  it('boosts positions with unfilled starting slots', () => {
    const rb = ap('RB', 10);
    const wr = ap('WR', 10);
    // WR starters already filled (2 WR + flex surplus covered), zero RBs rostered.
    const recs = recommend(
      input({ available: [rb, wr], myPositionCounts: { WR: 3 }, currentOverall: 40 }),
    );
    const rbRec = recs.find((r) => r.player.position === 'RB')!;
    const wrRec = recs.find((r) => r.player.position === 'WR')!;
    expect(rbRec.breakdown.need).toBe(1);
    expect(wrRec.breakdown.need).toBeLessThan(1);
    expect(recs[0].player.position).toBe('RB');
  });

  it('flags the last players in a tier', () => {
    const lastInTier = ap('RB', 12, { tier: 2 });
    const deepTier = ap('WR', 13, { tier: 3 });
    const wrPeers = [ap('WR', 14, { tier: 3 }), ap('WR', 15, { tier: 3 }), ap('WR', 16, { tier: 3 })];
    const recs = recommend(input({ available: [lastInTier, deepTier, ...wrPeers] }));
    expect(recs.find((r) => r.player.id === lastInTier.player.id)!.tierAlert).toBe(true);
    expect(recs.find((r) => r.player.id === deepTier.player.id)!.tierAlert).toBe(false);
  });

  it('gone probability rises for earlier-ADP players and is 0 on the clock with no window', () => {
    const early = ap('WR', 5, { adp: 10 });
    const late = ap('WR', 60, { adp: 80 });
    const recs = recommend(input({ available: [early, late], currentOverall: 12, picksUntilNext: 11 }));
    const e = recs.find((r) => r.player.id === early.player.id)!;
    const l = recs.find((r) => r.player.id === late.player.id)!;
    expect(e.goneBeforeNextTurn).toBeGreaterThan(l.goneBeforeNextTurn);
    expect(e.goneBeforeNextTurn).toBeGreaterThan(0.5);

    const none = recommend(input({ available: [early], picksUntilNext: 0 }));
    expect(none[0].goneBeforeNextTurn).toBe(0);
  });

  it('damps DST/K need in early rounds', () => {
    const dst = ap('DST', 20);
    const rb = ap('RB', 20);
    const early = recommend(input({ available: [dst, rb], currentOverall: 24 })); // round 2 of 15
    expect(early.find((r) => r.player.position === 'DST')!.breakdown.need).toBe(0);
    const late = recommend(input({ available: [dst, rb], currentOverall: 170 })); // round 15
    expect(late.find((r) => r.player.position === 'DST')!.breakdown.need).toBeGreaterThan(0.5);
  });

  it('reflects positional runs in the run component', () => {
    const wr = ap('WR', 10);
    const recs = recommend(
      input({ available: [wr], recentPositions: ['WR', 'WR', 'WR', 'WR', 'RB', 'WR', 'WR', 'WR'] }),
    );
    expect(recs[0].breakdown.run).toBeGreaterThan(0.8);
  });

  it('sorts best score first', () => {
    const top = ap('RB', 1, { adp: 1 });
    const mid = ap('WR', 25, { adp: 30 });
    const recs = recommend(input({ available: [mid, top], currentOverall: 1 }));
    expect(recs[0].player.id).toBe(top.player.id);
  });
});
