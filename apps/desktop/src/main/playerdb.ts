import { buildMatcher, normalizePosition, normalizeTeam, type Player, type PlayerMatcher } from '@draft-overlay/shared';
import { app } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface SleeperPlayer {
  player_id: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  position?: string;
  team?: string | null;
  bye_week?: number;
  search_rank?: number;
  active?: boolean;
}

export interface PlayerDb {
  fetchedAt: number;
  players: Player[];
  /** Sleeper's overall search rank per player id (their rankings signal) */
  sleeperRanks: Record<string, number>;
}

const TTL_MS = 24 * 60 * 60 * 1000; // refresh at most daily — the map is ~5MB
const SLEEPER_URL = 'https://api.sleeper.app/v1/players/nfl';

let mem: PlayerDb | null = null;
let matcher: { forFetchedAt: number; matcher: PlayerMatcher } | null = null;

function cachePath(): string {
  return join(app.getPath('userData'), 'players-cache.json');
}

async function readCache(): Promise<PlayerDb | null> {
  try {
    return JSON.parse(await readFile(cachePath(), 'utf8')) as PlayerDb;
  } catch {
    return null;
  }
}

async function fetchFromSleeper(): Promise<PlayerDb> {
  const res = await fetch(SLEEPER_URL);
  if (!res.ok) throw new Error(`Sleeper players fetch failed: HTTP ${res.status}`);
  const data = (await res.json()) as Record<string, SleeperPlayer>;

  const players: Player[] = [];
  const sleeperRanks: Record<string, number> = {};
  for (const sp of Object.values(data)) {
    const pos = normalizePosition(sp.position);
    if (!pos) continue;
    if (sp.active === false) continue;
    const rank = sp.search_rank ?? Number.MAX_SAFE_INTEGER;
    // Trim the ~11k-player map to draftable names; DSTs always stay.
    if (pos !== 'DST' && (!sp.team || rank > 1500)) continue;
    const name = sp.full_name ?? [sp.first_name, sp.last_name].filter(Boolean).join(' ');
    if (!name) continue;
    players.push({
      id: sp.player_id,
      name,
      position: pos,
      team: normalizeTeam(sp.team),
      byeWeek: sp.bye_week,
    });
    if (sp.search_rank != null) sleeperRanks[sp.player_id] = sp.search_rank;
  }
  return { fetchedAt: Date.now(), players, sleeperRanks };
}

export async function getPlayerDb(force = false): Promise<PlayerDb> {
  if (!force) {
    if (mem && Date.now() - mem.fetchedAt < TTL_MS) return mem;
    const cached = mem ?? (await readCache());
    if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
      mem = cached;
      return cached;
    }
  }
  try {
    mem = await fetchFromSleeper();
    await writeFile(cachePath(), JSON.stringify(mem)).catch(() => undefined);
  } catch (err) {
    // Offline or API down: a stale cache beats no players at all.
    const stale = mem ?? (await readCache());
    if (!stale) throw err;
    mem = stale;
  }
  return mem;
}

export async function getPlayers(force = false): Promise<Player[]> {
  return (await getPlayerDb(force)).players;
}

export async function getMatcher(): Promise<PlayerMatcher> {
  const db = await getPlayerDb();
  if (!matcher || matcher.forFetchedAt !== db.fetchedAt) {
    matcher = { forFetchedAt: db.fetchedAt, matcher: buildMatcher(db.players) };
  }
  return matcher.matcher;
}
