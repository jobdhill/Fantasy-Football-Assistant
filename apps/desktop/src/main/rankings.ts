import { mapCsvRows, type RankingEntry, type RankingSource } from '@draft-overlay/shared';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import Papa from 'papaparse';
import { fetchEspnEntries } from './espn';
import { getFourFourTable, type FourFourRow } from './fourfour';
import { getMatcher } from './playerdb';
import { fetchSleeperAdpEntries } from './sleeperadp';
import { fetchYahooAdpEntries } from './yahoo';
import { store } from './storage';
import { broadcast } from './windows';

export function getSources(): RankingSource[] {
  return store.get('sources');
}

function upsert(source: RankingSource): void {
  const sources = getSources().filter((s) => s.id !== source.id);
  sources.push(source);
  sources.sort((a, b) => a.label.localeCompare(b.label));
  store.set('sources', sources);
  broadcast({ type: 'sources', sources });
}

function failSource(id: string, label: string, kind: RankingSource['kind'], err: unknown): void {
  const prev = getSources().find((s) => s.id === id);
  upsert({
    id,
    label,
    kind,
    updatedAt: prev?.updatedAt ?? 0,
    entries: prev?.entries ?? {},
    error: err instanceof Error ? err.message : String(err),
  });
}

async function refreshEspn(): Promise<void> {
  try {
    const entries = await fetchEspnEntries(store.get('settings').scoring);
    upsert({ id: 'espn', label: 'ESPN', kind: 'espn', updatedAt: Date.now(), entries });
  } catch (err) {
    failSource('espn', 'ESPN', 'espn', err);
  }
}

function adpEntries(rows: FourFourRow[], pick: (r: FourFourRow) => number | undefined): Record<string, RankingEntry> {
  const entries: Record<string, RankingEntry> = {};
  rows
    .map((r) => ({ id: r.playerId, adp: pick(r) }))
    .filter((r): r is { id: string; adp: number } => r.adp != null)
    .sort((a, b) => a.adp - b.adp)
    .forEach((r, i) => {
      entries[r.id] = { rank: i + 1, adp: r.adp };
    });
  return entries;
}

/**
 * 4for4's consensus column. Note their table publishes whole-number ordinals,
 * so this is a rank consensus, not fractional draft cost — the live per-site
 * adapters (ESPN, Sleeper, Yahoo) carry the real ADPs.
 */
async function refreshFourFour(force: boolean): Promise<void> {
  try {
    const rows = await getFourFourTable(force);
    upsert({
      id: '4for4',
      label: '4for4 ADP',
      kind: '4for4',
      updatedAt: Date.now(),
      entries: adpEntries(rows, (r) => r.overall),
    });
  } catch (err) {
    failSource('4for4', '4for4 ADP', '4for4', err);
  }
}

/** Sleeper's live ADP, matched to the league's scoring format. */
async function refreshSleeperAdp(force: boolean): Promise<void> {
  try {
    const entries = await fetchSleeperAdpEntries(store.get('settings').scoring, force);
    upsert({ id: 'sleeper-adp', label: 'Sleeper ADP', kind: 'sleeper', updatedAt: Date.now(), entries });
  } catch (err) {
    failSource('sleeper-adp', 'Sleeper ADP', 'sleeper', err);
  }
}

/** Yahoo's live ADP, straight from their public draft-analysis API. */
async function refreshYahoo(force: boolean): Promise<void> {
  try {
    const entries = await fetchYahooAdpEntries(force);
    upsert({ id: 'yahoo-adp', label: 'Yahoo ADP', kind: 'yahoo', updatedAt: Date.now(), entries });
  } catch (err) {
    failSource('yahoo-adp', 'Yahoo ADP', 'yahoo', err);
  }
}

/**
 * Refreshes one source (or all API-backed sources). Every adapter degrades
 * independently — a broken endpoint disables a column, never the app.
 * `force` bypasses adapter caches; refreshing a single source by id always
 * forces, and the overlay's manual refresh forces everything so a user click
 * is guaranteed to pull live ADP.
 */
export async function refreshSources(id?: string, force = false): Promise<RankingSource[]> {
  if (!id || id === '4for4') await refreshFourFour(force || id === '4for4');
  if (!id || id === 'espn') await refreshEspn();
  if (!id || id === 'sleeper-adp') await refreshSleeperAdp(force || id === 'sleeper-adp');
  if (!id || id === 'yahoo-adp') await refreshYahoo(force || id === 'yahoo-adp');
  return getSources();
}

export async function importCsvFile(
  filePath: string,
): Promise<{ label: string; matched: number; total: number }> {
  const text = await readFile(filePath, 'utf8');
  const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
  const rows = mapCsvRows(parsed.data);
  if (rows.length === 0) throw new Error('No usable rows found — the CSV needs a player-name column.');

  const matcher = await getMatcher();
  const entries: Record<string, RankingEntry> = {};
  let matched = 0;
  for (const row of rows) {
    const m = matcher.match({ name: row.name, team: row.team, position: row.position });
    if (!m.player || entries[m.player.id]) continue;
    matched++;
    entries[m.player.id] = { rank: row.rank, tier: row.tier, adp: row.adp };
  }

  const label = basename(filePath).replace(/\.csv$/i, '');
  upsert({
    id: `csv-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    label,
    kind: 'csv',
    updatedAt: Date.now(),
    entries,
  });
  return { label, matched, total: rows.length };
}

export function removeSource(id: string): void {
  const sources = getSources().filter((s) => s.id !== id);
  store.set('sources', sources);
  broadcast({ type: 'sources', sources });
}

/** Sources this app once created and no longer does; pruned on startup so a
 * retired provider can't linger as a stale column in an existing config. */
const RETIRED_SOURCE_IDS = ['fp-adp', 'sleeper'];

export function pruneRetiredSources(): void {
  const sources = getSources();
  const kept = sources.filter((s) => !RETIRED_SOURCE_IDS.includes(s.id));
  if (kept.length === sources.length) return;
  store.set('sources', kept);
  broadcast({ type: 'sources', sources: kept });
}
