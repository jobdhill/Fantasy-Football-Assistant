import type { RankingEntry } from '@draft-overlay/shared';
import { getMatcher } from './playerdb';

// Yahoo's public read-only fantasy API. `game/nfl` resolves to the current
// season and the draft_analysis subresource carries live ADP (average_pick),
// no OAuth required (verified Aug 2026). Unofficial and may change without
// notice; callers must treat failures as "column unavailable", never fatal.
const BASE = 'https://pub-api-ro.fantasysports.yahoo.com/fantasy/v2/game/nfl/players';
const PAGE_SIZE = 100;
const MAX_PAGES = 3;
const TTL_MS = 30 * 60 * 1000;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

let cache: { fetchedAt: number; entries: Record<string, RankingEntry> } | null = null;

/**
 * Yahoo's JSON is arrays of single-key fragment objects nested inside arrays.
 * Flattening every fragment into one bag is far more robust than indexing
 * into their positional structure.
 */
function collect(value: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.assign(out, v as Record<string, unknown>);
  };
  walk(value);
  return out;
}

interface YahooAdpRow {
  name: string;
  position?: string;
  team?: string;
  adp: number;
}

/** Exported for smoke tests; not part of the adapter surface. */
export function parsePage(json: unknown): YahooAdpRow[] {
  const game = (json as { fantasy_content?: { game?: unknown[] } }).fantasy_content?.game;
  if (!Array.isArray(game)) throw new Error('Yahoo ADP response shape changed (no game)');
  const block = game.find(
    (g): g is { players: Record<string, unknown> & { count: number } } =>
      typeof g === 'object' && g != null && 'players' in g,
  )?.players;
  if (!block) return [];

  const rows: YahooAdpRow[] = [];
  for (let i = 0; i < (block.count ?? 0); i++) {
    const wrapper = block[String(i)] as { player?: unknown } | undefined;
    if (!wrapper?.player) continue;
    const flat = collect(wrapper.player);
    const name = (flat.name as { full?: string } | undefined)?.full;
    if (!name) continue;
    const da = collect(flat.draft_analysis);
    const adp = parseFloat(String(da.average_pick ?? ''));
    if (!Number.isFinite(adp) || adp <= 0) continue;
    rows.push({
      name,
      // "DT,DE" → "DT"; the matcher normalizes DEF→DST etc.
      position: typeof flat.display_position === 'string' ? flat.display_position.split(',')[0] : undefined,
      team: typeof flat.editorial_team_abbr === 'string' ? flat.editorial_team_abbr : undefined,
      adp,
    });
  }
  return rows;
}

/**
 * Fetches Yahoo's live ADP, paging the draft-analysis-sorted player list and
 * mapping names onto canonical (Sleeper) player ids.
 */
export async function fetchYahooAdpEntries(force = false): Promise<Record<string, RankingEntry>> {
  if (!force && cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.entries;

  const rows: YahooAdpRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${BASE};start=${page * PAGE_SIZE};count=${PAGE_SIZE};sort=DA_AP/draft_analysis?format=json`;
    const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': UA } });
    if (!res.ok) throw new Error(`Yahoo ADP fetch failed: HTTP ${res.status}`);
    const pageRows = parsePage(await res.json());
    rows.push(...pageRows);
    // The DA_AP sort front-loads drafted players; a thin page means the ADP
    // data has run out and further pages are undrafted names.
    if (pageRows.length < PAGE_SIZE / 2) break;
  }
  if (rows.length === 0) throw new Error('Yahoo ADP response contained no ADP values');

  const matcher = await getMatcher();
  const entries: Record<string, RankingEntry> = {};
  rows.sort((a, b) => a.adp - b.adp);
  let rank = 0;
  for (const row of rows) {
    const match = matcher.match({ name: row.name, team: row.team, position: row.position });
    if (!match.player || entries[match.player.id]) continue;
    rank++;
    entries[match.player.id] = { rank, adp: Math.round(row.adp * 10) / 10 };
  }
  if (rank === 0) throw new Error('Yahoo ADP parsed to zero matched players');

  cache = { fetchedAt: Date.now(), entries };
  return entries;
}
