import { describe, expect, it } from 'vitest';
import { pickGoneProbability, recommend, type AvailablePlayer, type RecommendInput } from './recommend';
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

  it('gone odds come from the remaining pool, not raw ADP vs pick number', () => {
    // 15 better-ADP players are still available and only 6 picks happen before
    // my turn, so a faller (ADP 40, already past at pick 26) is still shielded.
    const pool = Array.from({ length: 15 }, (_, i) => ap('WR', i + 1, { adp: i + 1 }));
    const shielded = ap('RB', 40, { adp: 40 });
    const recs = recommend(
      input({ available: [...pool, shielded], currentOverall: 26, picksUntilNext: 6 }),
    );
    const s = recs.find((r) => r.player.id === shielded.player.id)!;
    expect(s.goneBeforeNextTurn).toBeLessThan(0.2);
    const first = recs.find((r) => r.player.id === pool[0].player.id)!;
    expect(first.goneBeforeNextTurn).toBeGreaterThan(0.8);

    const none = recommend(input({ available: [shielded], picksUntilNext: 0 }));
    expect(none[0].goneBeforeNextTurn).toBe(0);
  });

  it('does not chase a second elite TE once the starter is set', () => {
    const te = ap('TE', 12, { adp: 12, tier: 1 });
    const rb = ap('RB', 14, { adp: 14, tier: 1 });
    const wr = ap('WR', 15, { adp: 15, tier: 1 });
    const recs = recommend(
      input({
        available: [te, rb, wr],
        myPositionCounts: { TE: 1, RB: 1 }, // elite TE already drafted
        currentOverall: 25, // round 3
      }),
    );
    expect(recs[0].player.position).not.toBe('TE');
    const teRec = recs.find((r) => r.player.position === 'TE')!;
    expect(teRec.breakdown.need).toBeLessThanOrEqual(0.25);
  });

  it('discounts a needed position when the player will still be there next turn', () => {
    // QB slot empty, but the only QB on the board is a late-rounder with 30
    // better players still available — spending this pick on him is a reach.
    const board = Array.from({ length: 30 }, (_, i) =>
      ap(i % 2 ? 'RB' : 'WR', i + 31, { adp: i + 31 }),
    );
    const lateQb = ap('QB', 140, { adp: 140 });
    const recs = recommend(
      input({
        available: [...board, lateQb],
        myPositionCounts: { RB: 2, WR: 2 },
        currentOverall: 31,
        picksUntilNext: 11,
      }),
    );
    expect(recs[0].player.position).not.toBe('QB');
    const qb = recs.find((r) => r.player.position === 'QB')!;
    expect(qb.goneBeforeNextTurn).toBeLessThan(0.15);
    // still recorded as a roster need — just not urgent enough to reach for
    expect(qb.breakdown.need).toBe(1);
  });

  it('gives deep tiers no scarcity credit even when they are small', () => {
    const topTierRb = ap('RB', 5, { tier: 1 });
    const topTierRb2 = ap('RB', 6, { tier: 1 });
    const soloDeepRb = ap('RB', 80, { tier: 7 });
    const recs = recommend(input({ available: [topTierRb, topTierRb2, soloDeepRb] }));
    const deep = recs.find((r) => r.player.id === soloDeepRb.player.id)!;
    const top = recs.find((r) => r.player.id === topTierRb.player.id)!;
    expect(deep.breakdown.scarcity).toBeLessThan(0.1);
    expect(deep.tierAlert).toBe(false);
    expect(top.breakdown.scarcity).toBeGreaterThan(deep.breakdown.scarcity);
    expect(top.tierAlert).toBe(true);
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

describe('pickGoneProbability', () => {
  it('is 0 with no picks before my turn', () => {
    expect(pickGoneProbability(5, 0)).toBe(0);
  });

  it('rises with the pick window and falls with preferred supply ahead', () => {
    expect(pickGoneProbability(0, 8)).toBeGreaterThan(0.9);
    expect(pickGoneProbability(25, 8)).toBeLessThan(0.15);
    expect(pickGoneProbability(4, 10)).toBeGreaterThan(pickGoneProbability(4, 3));
  });
});
