export interface CsvRankRow {
  name: string;
  team?: string;
  position?: string;
  rank: number;
  tier?: number;
  adp?: number;
}

const NAME_KEYS = ['player', 'name', 'player name', 'full name'];
const RANK_KEYS = ['rank', 'rk', 'ecr', 'overall', 'ovr'];
const POS_KEYS = ['pos', 'position'];
const TEAM_KEYS = ['team', 'tm', 'nfl team'];
const TIER_KEYS = ['tier', 'tiers'];
const ADP_KEYS = ['adp', 'avg', 'avg pick', 'average draft position'];

function canon(header: string): string {
  return header.trim().toLowerCase().replace(/["._]/g, ' ').replace(/\s+/g, ' ').trim();
}

function num(v: unknown): number | undefined {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Maps parsed CSV rows (header → value objects, e.g. from papaparse) to ranking rows.
 * Header detection covers FantasyPros ECR exports, Yahoo exports, and hand-made sheets.
 * Positional-rank values like "RB12" are reduced to the position letters.
 */
export function mapCsvRows(rows: Record<string, unknown>[]): CsvRankRow[] {
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]);
  const find = (keys: string[]) => headers.find((h) => keys.includes(canon(h)));

  const nameH = find(NAME_KEYS);
  if (!nameH) return [];
  const rankH = find(RANK_KEYS);
  const posH = find(POS_KEYS);
  const teamH = find(TEAM_KEYS);
  const tierH = find(TIER_KEYS);
  const adpH = find(ADP_KEYS);

  const out: CsvRankRow[] = [];
  for (const row of rows) {
    const name = String(row[nameH] ?? '').trim();
    if (!name) continue;
    const rank = (rankH ? num(row[rankH]) : undefined) ?? out.length + 1;
    const posRaw = posH ? String(row[posH] ?? '').trim() : '';
    const position = posRaw ? posRaw.replace(/[^A-Za-z/]/g, '') : undefined;
    out.push({
      name,
      rank,
      position: position || undefined,
      team: teamH ? String(row[teamH] ?? '').trim() || undefined : undefined,
      tier: tierH ? num(row[tierH]) : undefined,
      adp: adpH ? num(row[adpH]) : undefined,
    });
  }
  out.sort((a, b) => a.rank - b.rank);
  return out;
}
