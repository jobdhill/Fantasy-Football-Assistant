import { describe, expect, it } from 'vitest';
import { pickValue, positionShares, teamBalance } from './teamvalue';
import { DEFAULT_SETTINGS } from './types';

// 12 teams, 1QB/2RB/2WR/1TE/1FLEX/1DST/1K + 6 bench = 15 rounds
const settings = DEFAULT_SETTINGS;

describe('pickValue', () => {
  it('decays with draft position', () => {
    expect(pickValue(1)).toBeCloseTo(100);
    expect(pickValue(30)).toBeGreaterThan(pickValue(60));
    expect(pickValue(180)).toBeLessThan(5);
  });
});

describe('positionShares', () => {
  it('favors RB/WR and sums to 1', () => {
    const shares = positionShares(settings);
    expect(Object.values(shares).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(shares.RB).toBeGreaterThan(shares.QB);
    expect(shares.WR).toBeGreaterThan(shares.TE);
    expect(shares.K).toBeLessThan(0.05);
  });
});

describe('teamBalance', () => {
  it('flags a cheap RB room as NEED even with starters filled', () => {
    // The Jaylen Warren / Chuba Hubbard case: two RBs rostered, both market
    // bargains — the room is under-capitalized regardless of slot count.
    const balances = teamBalance({
      players: [
        { position: 'RB', anchor: 85 },
        { position: 'RB', anchor: 95 },
        { position: 'WR', anchor: 5 },
        { position: 'WR', anchor: 15 },
        { position: 'WR', anchor: 30 },
        { position: 'WR', anchor: 50 },
        { position: 'QB', anchor: 20 },
        { position: 'TE', anchor: 40 },
      ],
      myPickOveralls: [5, 20, 29, 44, 53, 68, 77, 92],
      settings,
      currentOverall: 101, // round 9
    });
    const rb = balances.find((b) => b.position === 'RB')!;
    expect(rb.startersFilled).toBe(true);
    expect(rb.status).toBe('NEED');
    expect(rb.pct!).toBeLessThan(0.4);

    const wr = balances.find((b) => b.position === 'WR')!;
    expect(wr.status).toBe('OVER');

    // one elite QB is SET, never OVER, no matter how rich the pct looks
    const qb = balances.find((b) => b.position === 'QB')!;
    expect(qb.status).toBe('SET');
  });

  it('stays quiet in round 1 and keeps K/DST quiet until the late rounds', () => {
    const balances = teamBalance({
      players: [{ position: 'RB', anchor: 3 }],
      myPickOveralls: [3],
      settings,
      currentOverall: 4,
    });
    expect(balances.every((b) => b.status !== 'NEED')).toBe(true);
    const k = balances.find((b) => b.position === 'K')!;
    expect(k.status).toBe('OK');
    expect(k.target).toBe(0);
  });

  it('flags an empty QB room once the middle rounds arrive', () => {
    const balances = teamBalance({
      players: [
        { position: 'RB', anchor: 5 },
        { position: 'WR', anchor: 10 },
        { position: 'RB', anchor: 20 },
        { position: 'WR', anchor: 28 },
        { position: 'TE', anchor: 45 },
        { position: 'WR', anchor: 60 },
      ],
      myPickOveralls: [5, 20, 29, 44, 53, 68],
      settings,
      currentOverall: 78, // round 7
    });
    const qb = balances.find((b) => b.position === 'QB')!;
    expect(qb.status).toBe('NEED');

    // well-capitalized rooms with starters filled read as SET
    const rb = balances.find((b) => b.position === 'RB')!;
    expect(rb.status).toBe('SET');
    const te = balances.find((b) => b.position === 'TE')!;
    expect(te.status).toBe('SET');
  });

  it('reports nothing actionable before any picks are made', () => {
    const balances = teamBalance({ players: [], myPickOveralls: [], settings, currentOverall: 1 });
    for (const b of balances) {
      expect(b.status).toBe('OK');
      expect(b.value).toBe(0);
      expect(b.pct).toBeNull();
    }
  });
});
