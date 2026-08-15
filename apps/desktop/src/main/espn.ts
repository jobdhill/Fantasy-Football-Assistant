import type { Position, RankingEntry, ScoringFormat } from '@draft-overlay/shared';
import { getMatcher } from './playerdb';

// Unofficial read-only endpoint (verified Aug 2026). Undocumented and may change
// without notice; callers must treat failures as "column unavailable", never fatal.
const BASE = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl';

const POSITION_BY_ID: Record<number, Position> = {
  1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DST',
};

const TEAM_BY_ID: Record<number, string> = {
  1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET',
  9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN',
  17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC',
  25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WAS', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU',
};

interface EspnPlayerWrapper {
  player?: {
    fullName?: string;
    defaultPositionId?: number;
    proTeamId?: number;
    draftRanksByRankType?: Record<string, { rank?: number }>;
    ownership?: { averageDraftPosition?: number };
  };
}

function currentSeason(): number {
  const now = new Date();
  // Jan/Feb belong to the previous NFL season.
  return now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1;
}

/**
 * Fetches ESPN draft ranks + ADP and maps them onto canonical (Sleeper) player ids.
 * Returns entries keyed by canonical id; players ESPN lists that we cannot
 * identity-match are skipped.
 */
export async function fetchEspnEntries(scoring: ScoringFormat): Promise<Record<string, RankingEntry>> {
  const rankType = scoring === 'standard' ? 'STANDARD' : 'PPR';
  const leagueDefaultsId = scoring === 'standard' ? 1 : 3;
  const season = currentSeason();
  const url = `${BASE}/seasons/${season}/segments/0/leaguedefaults/${leagueDefaultsId}?scoringPeriodId=0&view=kona_player_info`;

  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      'x-fantasy-filter': JSON.stringify({
        players: {
          limit: 350,
          sortDraftRanks: { sortPriority: 100, sortAsc: true, value: rankType },
        },
      }),
    },
  });
  if (!res.ok) throw new Error(`ESPN rankings fetch failed: HTTP ${res.status}`);
  const json = (await res.json()) as { players?: EspnPlayerWrapper[] };
  const wrappers = json.players ?? [];
  if (wrappers.length === 0) throw new Error('ESPN rankings response contained no players');

  const matcher = await getMatcher();
  const entries: Record<string, RankingEntry> = {};
  wrappers.forEach((w, i) => {
    const p = w.player;
    if (!p?.fullName) return;
    const match = matcher.match({
      name: p.fullName,
      position: p.defaultPositionId != null ? POSITION_BY_ID[p.defaultPositionId] : undefined,
      team: p.proTeamId != null ? TEAM_BY_ID[p.proTeamId] : undefined,
    });
    if (!match.player) return;
    const adp = p.ownership?.averageDraftPosition;
    entries[match.player.id] = {
      rank: p.draftRanksByRankType?.[rankType]?.rank ?? i + 1,
      adp: adp != null && adp > 0 ? Math.round(adp * 10) / 10 : undefined,
    };
  });
  return entries;
}
