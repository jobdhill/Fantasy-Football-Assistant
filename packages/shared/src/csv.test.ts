import { describe, expect, it } from 'vitest';
import { mapCsvRows } from './csv';

describe('mapCsvRows', () => {
  it('parses FantasyPros-style ECR exports', () => {
    const rows = [
      { RK: '1', TIERS: '1', 'PLAYER NAME': "Ja'Marr Chase", TEAM: 'CIN', POS: 'WR1', 'BYE WEEK': '10' },
      { RK: '2', TIERS: '1', 'PLAYER NAME': 'Bijan Robinson', TEAM: 'ATL', POS: 'RB1', 'BYE WEEK': '5' },
    ];
    const out = mapCsvRows(rows);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ name: "Ja'Marr Chase", rank: 1, tier: 1, position: 'WR', team: 'CIN' });
    expect(out[1].position).toBe('RB');
  });

  it('parses simple rank/player/adp sheets', () => {
    const rows = [
      { Rank: '2', Player: 'B', ADP: '3.5' },
      { Rank: '1', Player: 'A', ADP: '1.2' },
    ];
    const out = mapCsvRows(rows);
    expect(out[0]).toMatchObject({ name: 'A', rank: 1, adp: 1.2 });
    expect(out[1].name).toBe('B');
  });

  it('falls back to row order when there is no rank column', () => {
    const rows = [{ Name: 'First' }, { Name: 'Second' }];
    const out = mapCsvRows(rows);
    expect(out[0]).toMatchObject({ name: 'First', rank: 1 });
    expect(out[1].rank).toBe(2);
  });

  it('skips rows with empty names and rejects sheets without a name column', () => {
    expect(mapCsvRows([{ Player: '' }, { Player: 'X' }])).toHaveLength(1);
    expect(mapCsvRows([{ foo: 'bar' }])).toHaveLength(0);
  });

  it('keeps D/ST position values', () => {
    const out = mapCsvRows([{ Player: 'Ravens D/ST', Pos: 'DST' }]);
    expect(out[0].position).toBe('DST');
  });
});
