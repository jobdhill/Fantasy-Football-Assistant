import { describe, expect, it } from 'vitest';
import { autoTierStarts, hasUsableSpread, type TierablePlayer } from './tiers';

const mk = (values: number[]): TierablePlayer[] =>
  values.map((value, i) => ({ id: `p${i}`, value }));

describe('autoTierStarts', () => {
  it('returns nothing for degenerate inputs', () => {
    expect(autoTierStarts([])).toEqual([]);
    expect(autoTierStarts(mk([1]))).toEqual([]);
  });

  it('finds no breaks in an evenly spaced board', () => {
    const even = mk(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(autoTierStarts(even)).toEqual([]);
  });

  it('breaks at a clear cliff', () => {
    // Ten tightly packed, then a chasm, then ten more.
    const values = [
      ...Array.from({ length: 10 }, (_, i) => i + 1),
      ...Array.from({ length: 10 }, (_, i) => i + 40),
    ];
    expect(autoTierStarts(mk(values))).toEqual(['p10']);
  });

  it('never breaks at the first player', () => {
    const values = [1, 30, 31, 32, 33, 34, 35, 36];
    expect(autoTierStarts(mk(values))).not.toContain('p0');
  });

  it('respects maxTiers', () => {
    // A cliff every four players; far more than the budget allows.
    const values = Array.from({ length: 60 }, (_, i) => i + Math.floor(i / 4) * 30);
    const starts = autoTierStarts(mk(values), { maxTiers: 4 });
    expect(starts.length).toBeLessThanOrEqual(3);
  });

  it('honours minTierSize', () => {
    const values = Array.from({ length: 30 }, (_, i) => i + Math.floor(i / 3) * 25);
    const starts = autoTierStarts(mk(values), { minTierSize: 5 });
    const idx = starts.map((id) => Number(id.slice(1))).sort((a, b) => a - b);
    for (let i = 0; i < idx.length; i++) {
      expect(idx[i]).toBeGreaterThanOrEqual(5);
      if (i > 0) expect(idx[i] - idx[i - 1]).toBeGreaterThanOrEqual(5);
    }
    expect(30 - idx[idx.length - 1]).toBeGreaterThanOrEqual(5);
  });

  it('returns starts in board order', () => {
    const values = Array.from({ length: 50 }, (_, i) => i + Math.floor(i / 10) * 35);
    const starts = autoTierStarts(mk(values));
    const idx = starts.map((id) => Number(id.slice(1)));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });

  it('tolerates ties and duplicate ADP without inventing tiers', () => {
    const flat = mk(Array.from({ length: 20 }, () => 5));
    expect(autoTierStarts(flat)).toEqual([]);
  });

  it('scales to late-round gaps rather than only early ones', () => {
    // Tight at the top, naturally looser later; the only true cliff is late.
    const values = [
      ...Array.from({ length: 12 }, (_, i) => i * 1.2),
      ...Array.from({ length: 12 }, (_, i) => 20 + i * 4),
      ...Array.from({ length: 12 }, (_, i) => 140 + i * 4),
    ];
    const starts = autoTierStarts(mk(values));
    expect(starts).toContain('p24');
  });
});

describe('hasUsableSpread', () => {
  it('rejects a rank list wearing an ADP label', () => {
    // Some providers publish 1,2,3,… in their ADP column.
    expect(hasUsableSpread(Array.from({ length: 200 }, (_, i) => i + 1))).toBe(false);
  });

  it('rejects a dense rank list with a few missing players', () => {
    // Gaps of 2 where a player is absent must not read as real spacing.
    const vals = Array.from({ length: 200 }, (_, i) => i + 1).filter((v) => v % 37 !== 0);
    expect(hasUsableSpread(vals)).toBe(false);
  });

  it('accepts genuine averaged ADP', () => {
    expect(hasUsableSpread([1.6, 2.6, 3.9, 4.6, 5.8, 6.6, 8.1, 8.3, 10.6, 12.1])).toBe(true);
  });

  it('accepts uneven integer spacing', () => {
    expect(hasUsableSpread([1, 4, 5, 12, 20, 21, 40, 44, 60, 95])).toBe(true);
  });

  it('needs enough data to judge', () => {
    expect(hasUsableSpread([])).toBe(false);
    expect(hasUsableSpread([1, 2])).toBe(false);
  });
});
