import { describe, expect, it } from 'vitest';
import { buildMatcher, initialForm, levenshtein, normalizeName, normalizePosition, normalizeTeam } from './names';
import type { Player } from './types';

describe('normalizeName', () => {
  it('strips generational suffixes', () => {
    expect(normalizeName('Marvin Harrison Jr.')).toBe('marvin harrison');
    expect(normalizeName('Kenneth Walker III')).toBe('kenneth walker');
  });

  it('removes apostrophes and periods without inserting spaces', () => {
    expect(normalizeName("D'Andre Swift")).toBe('dandre swift');
    expect(normalizeName('A.J. Brown')).toBe('aj brown');
    expect(normalizeName('AJ Brown')).toBe('aj brown');
  });

  it('turns hyphens into spaces', () => {
    expect(normalizeName('Amon-Ra St. Brown')).toBe('amon ra st brown');
  });

  it('keeps a lone suffix-looking name intact', () => {
    expect(normalizeName('V')).toBe('v');
  });
});

describe('initialForm', () => {
  it('reduces to first initial + last name', () => {
    expect(initialForm('justin jefferson')).toBe('j jefferson');
    expect(initialForm(normalizeName('J. Jefferson'))).toBe('j jefferson');
  });
});

describe('normalizeTeam / normalizePosition', () => {
  it('maps provider team aliases to canonical codes', () => {
    expect(normalizeTeam('JAC')).toBe('JAX');
    expect(normalizeTeam('WSH')).toBe('WAS');
    expect(normalizeTeam('kc')).toBe('KC');
    expect(normalizeTeam(null)).toBeNull();
  });

  it('maps DEF/PK variants', () => {
    expect(normalizePosition('DEF')).toBe('DST');
    expect(normalizePosition('D/ST')).toBe('DST');
    expect(normalizePosition('PK')).toBe('K');
    expect(normalizePosition('WR')).toBe('WR');
    expect(normalizePosition('OL')).toBeNull();
  });
});

describe('levenshtein', () => {
  it('computes edit distance', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('jamar chase', 'jamarr chase')).toBe(1);
    expect(levenshtein('', 'ab')).toBe(2);
  });
});

const players: Player[] = [
  { id: '1', name: 'Justin Jefferson', position: 'WR', team: 'MIN' },
  { id: '2', name: "Ja'Marr Chase", position: 'WR', team: 'CIN' },
  { id: '3', name: 'Josh Allen', position: 'QB', team: 'BUF' },
  { id: '4', name: 'Josh Allen', position: 'RB', team: 'JAX' },
  { id: '5', name: 'Marvin Harrison Jr.', position: 'WR', team: 'ARI' },
  { id: '6', name: 'DJ Moore', position: 'WR', team: 'CHI' },
  { id: '7', name: 'David Moore', position: 'WR', team: 'CAR' },
  { id: 'BAL', name: 'Baltimore Ravens', position: 'DST', team: 'BAL' },
  { id: 'SF', name: 'San Francisco 49ers', position: 'DST', team: 'SF' },
];

describe('buildMatcher', () => {
  const matcher = buildMatcher(players);

  it('matches exact names', () => {
    expect(matcher.match({ name: 'Justin Jefferson' }).player?.id).toBe('1');
  });

  it('matches across punctuation and suffix differences', () => {
    expect(matcher.match({ name: 'JaMarr Chase' }).player?.id).toBe('2');
    expect(matcher.match({ name: 'Marvin Harrison' }).player?.id).toBe('5');
  });

  it('disambiguates same-name players by position', () => {
    expect(matcher.match({ name: 'Josh Allen', position: 'QB' }).player?.id).toBe('3');
    expect(matcher.match({ name: 'Josh Allen', position: 'RB' }).player?.id).toBe('4');
  });

  it('returns candidates instead of guessing when ambiguous', () => {
    const res = matcher.match({ name: 'Josh Allen' });
    expect(res.player).toBeNull();
    expect(res.candidates).toHaveLength(2);
  });

  it('matches abbreviated first names via initial form', () => {
    expect(matcher.match({ name: 'J. Jefferson', position: 'WR' }).player?.id).toBe('1');
  });

  it('matches small misspellings via fuzzy fallback', () => {
    expect(matcher.match({ name: 'Jamar Chase', position: 'WR' }).player?.id).toBe('2');
  });

  it('uses team to break initial-form ties', () => {
    expect(matcher.match({ name: 'D. Moore', position: 'WR', team: 'CHI' }).player?.id).toBe('6');
    const ambiguous = matcher.match({ name: 'D. Moore', position: 'WR' });
    expect(ambiguous.player).toBeNull();
    expect(ambiguous.candidates.length).toBeGreaterThan(1);
  });

  it('matches defenses across provider naming styles', () => {
    expect(matcher.match({ name: 'Ravens D/ST', position: 'DST' }).player?.id).toBe('BAL');
    expect(matcher.match({ name: 'Baltimore', position: 'DEF' }).player?.id).toBe('BAL');
    expect(matcher.match({ name: '49ers D/ST', position: 'D/ST', team: 'SF' }).player?.id).toBe('SF');
  });

  it('returns no match for unknown names', () => {
    expect(matcher.match({ name: 'Totally Unknown Player' }).player).toBeNull();
  });
});
