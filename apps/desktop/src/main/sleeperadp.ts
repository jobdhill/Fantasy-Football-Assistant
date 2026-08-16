import type { RankingEntry, ScoringFormat } from '@draft-overlay/shared';

// Sleeper's projections endpoint carries the live ADP columns that power their
// own draft boards (verified Aug 2026). Undocumented and may change without
// notice; callers must treat failures as "column unavailable", never fatal.
const BASE = 'https://api.sleeper.com/projections/nfl';
const TTL_MS = 30 * 60 * 1000;
const MAX_PLAYERS = 400;

const ADP_KEY: Record<ScoringFormat, string> = {
  ppr: 'adp_ppr',
  half: 'adp_half_ppr',
  standard: 'adp_std',
};

interface SleeperProjectionRow {
  player_id?: string;
  stats?: Record<string, number | undefined>;
}

let cache: { fetchedAt: number; key: string; entries: Record<string, RankingEntry> } | null = null;

function currentSeason(): number {
  const now = new Date();
  // Jan/Feb belong to the previous NFL season.
  return now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1;
}

/**
 * Fetches Sleeper's live ADP for the given scoring format. Rows come keyed by
 * Sleeper player ids — this app's canonical ids — so no name matching is
 * needed and every entry maps exactly.
 */
export async function fetchSleeperAdpEntries(
  scoring: ScoringFormat,
  force = false,
): Promise<Record<string, RankingEntry>> {
  const key = ADP_KEY[scoring];
  if (!force && cache && cache.key === key && Date.now() - cache.fetchedAt < TTL_MS) {
    return cache.entries;
  }

  const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']
    .map((p) => `position%5B%5D=${p}`)
    .join('&');
  const url = `${BASE}/${currentSeason()}?season_type=regular&${positions}&order_by=${key}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Sleeper ADP fetch failed: HTTP ${res.status}`);
  const rows = (await res.json()) as SleeperProjectionRow[];

  const withAdp = rows
    .map((r) => ({ id: r.player_id, adp: r.stats?.[key] }))
    .filter((r): r is { id: string; adp: number } => r.id != null && r.adp != null && r.adp > 0)
    .sort((a, b) => a.adp - b.adp)
    .slice(0, MAX_PLAYERS);
  if (withAdp.length === 0) throw new Error('Sleeper ADP response contained no ADP values');

  const entries: Record<string, RankingEntry> = {};
  withAdp.forEach((r, i) => {
    entries[r.id] = { rank: i + 1, adp: Math.round(r.adp * 10) / 10 };
  });
  cache = { fetchedAt: Date.now(), key, entries };
  return entries;
}
