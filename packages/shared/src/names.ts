import { POSITIONS, type Player, type Position, type RawPick } from './types';

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

/**
 * Canonical name form used for cross-provider matching:
 * apostrophes/periods removed in place ("A.J." → "aj", "D'Andre" → "dandre"),
 * hyphens become spaces, diacritics stripped, generational suffixes dropped.
 */
export function normalizeName(name: string): string {
  const ascii = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const cleaned = ascii
    .toLowerCase()
    .replace(/['’`.]/g, '')
    .replace(/-/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ');
  const parts = cleaned.split(/\s+/).filter(Boolean);
  while (parts.length > 1 && SUFFIXES.has(parts[parts.length - 1])) parts.pop();
  return parts.join(' ');
}

/** "justin jefferson" → "j jefferson" (matches abbreviated draft-room renderings). */
export function initialForm(normalized: string): string {
  const parts = normalized.split(' ');
  if (parts.length < 2) return normalized;
  return `${parts[0][0]} ${parts[parts.length - 1]}`;
}

const TEAM_ALIASES: Record<string, string> = {
  JAC: 'JAX', WSH: 'WAS', OAK: 'LV', LVR: 'LV', SD: 'LAC', STL: 'LAR', LA: 'LAR',
  ARZ: 'ARI', BLT: 'BAL', CLV: 'CLE', HST: 'HOU', GNB: 'GB', KAN: 'KC',
  NOR: 'NO', NWE: 'NE', SFO: 'SF', TAM: 'TB',
};

export function normalizeTeam(team: string | null | undefined): string | null {
  if (!team) return null;
  const t = team.toUpperCase().trim();
  if (!t) return null;
  return TEAM_ALIASES[t] ?? t;
}

export function normalizePosition(pos: string | null | undefined): Position | null {
  if (!pos) return null;
  const p = pos.toUpperCase().replace(/[^A-Z]/g, '');
  if (!p) return null;
  if (p === 'DEF' || p === 'DST' || p === 'D') return 'DST';
  if (p === 'PK') return 'K';
  return (POSITIONS as readonly string[]).includes(p) ? (p as Position) : null;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

export interface MatchResult {
  player: Player | null;
  candidates: Player[];
}

export interface PlayerMatcher {
  match(raw: RawPick): MatchResult;
}

/**
 * Builds an indexed matcher over the canonical player list.
 * Strategy: exact normalized name → narrow by position, then team;
 * then initial-form ("j jefferson"); then fuzzy (levenshtein ≤ 2) within position.
 * Ambiguity returns candidates instead of guessing.
 */
export function buildMatcher(players: Player[]): PlayerMatcher {
  const byName = new Map<string, Player[]>();
  const byInitial = new Map<string, Player[]>();
  const normalized = new Map<Player, string>();

  for (const p of players) {
    const n = normalizeName(p.name);
    normalized.set(p, n);
    const nameList = byName.get(n) ?? [];
    nameList.push(p);
    byName.set(n, nameList);
    const init = initialForm(n);
    const initList = byInitial.get(init) ?? [];
    initList.push(p);
    byInitial.set(init, initList);
  }

  function narrow(pool: Player[], pos: Position | null, team: string | null): Player[] {
    let out = pool;
    if (pos && out.some((p) => p.position === pos)) out = out.filter((p) => p.position === pos);
    if (team && out.length > 1 && out.some((p) => normalizeTeam(p.team) === team)) {
      out = out.filter((p) => normalizeTeam(p.team) === team);
    }
    return out;
  }

  return {
    match(raw: RawPick): MatchResult {
      const name = normalizeName(raw.name);
      if (!name) return { player: null, candidates: [] };
      const pos = normalizePosition(raw.position);
      const team = normalizeTeam(raw.team);

      // Defenses never share a name across providers ("Ravens D/ST" vs
      // "Baltimore Ravens"); match them by team code or nickname token instead.
      if (pos === 'DST' || /\b(dst|defense|d st)\b/.test(name)) {
        const defs = players.filter((p) => p.position === 'DST');
        let pool = team ? defs.filter((p) => normalizeTeam(p.team) === team) : [];
        if (pool.length !== 1) {
          const tokens = new Set(name.split(' ').filter((t) => !['dst', 'd', 'st', 'defense'].includes(t)));
          pool = defs.filter((p) => normalizeName(p.name).split(' ').some((t) => tokens.has(t)));
        }
        if (pool.length === 1) return { player: pool[0], candidates: pool };
        return { player: null, candidates: pool.slice(0, 5) };
      }

      const exact = narrow(byName.get(name) ?? [], pos, team);
      if (exact.length === 1) return { player: exact[0], candidates: exact };
      if (exact.length > 1) return { player: null, candidates: exact };

      const viaInitial = narrow(byInitial.get(initialForm(name)) ?? [], pos, team);
      if (viaInitial.length === 1) return { player: viaInitial[0], candidates: viaInitial };
      // Multiple players share this abbreviated form ("D. Moore"): edit distance
      // can't disambiguate that honestly, so hand the candidates to the resolver UI.
      if (viaInitial.length > 1) return { player: null, candidates: viaInitial };

      const fuzzy: Array<{ p: Player; d: number }> = [];
      for (const p of players) {
        if (pos && p.position !== pos) continue;
        const d = levenshtein(name, normalized.get(p)!);
        if (d <= 2) fuzzy.push({ p, d });
      }
      fuzzy.sort((a, b) => a.d - b.d);
      const narrowed = narrow(
        fuzzy.filter((f) => f.d === fuzzy[0]?.d).map((f) => f.p),
        pos,
        team,
      );
      if (narrowed.length === 1) return { player: narrowed[0], candidates: narrowed };

      const candidates = (viaInitial.length ? viaInitial : fuzzy.slice(0, 5).map((f) => f.p));
      return { player: null, candidates };
    },
  };
}
