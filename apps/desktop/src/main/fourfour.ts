import { getMatcher } from './playerdb';

// 4for4's public ADP page (https://www.4for4.com/adp) renders one HTML table
// with an overall consensus ADP plus per-platform columns (ESPN, Sleeper,
// Yahoo, …). Scraped like the ESPN endpoint: unofficial, adapter-isolated,
// failures only disable these columns.
const URL_4FOR4 = 'https://www.4for4.com/adp?paging=0';
const TTL_MS = 6 * 60 * 60 * 1000;

export interface FourFourRow {
  playerId: string;
  /** overall consensus ADP rank (1-indexed table order) */
  overall: number;
  sleeper?: number;
  yahoo?: number;
}

let cache: { fetchedAt: number; rows: FourFourRow[] } | null = null;

function decodeEntities(s: string): string {
  return s
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function cellText(td: string): string {
  return decodeEntities(td.replace(/<[^>]*>/g, '')).trim();
}

function num(s: string): number | undefined {
  if (!s || s === '-') return undefined;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

export async function getFourFourTable(force = false): Promise<FourFourRow[]> {
  if (!force && cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.rows;

  const res = await fetch(URL_4FOR4, {
    headers: {
      // The page serves a challenge to bot-like agents; a browser UA gets HTML.
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      accept: 'text/html',
    },
  });
  if (!res.ok) throw new Error(`4for4 ADP fetch failed: HTTP ${res.status}`);
  const html = await res.text();

  const theadMatch = html.match(/<thead[^>]*>([\s\S]*?)<\/thead>/);
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (!theadMatch || !tbodyMatch) throw new Error('4for4 ADP page structure changed (no table found)');

  const headers = [...theadMatch[1].matchAll(/<th([^>]*)>([\s\S]*?)<\/th>/g)].map((m) => {
    const dataName = m[1].match(/data-name="([^"]+)"/);
    return dataName ? dataName[1] : cellText(m[2]);
  });
  const col = (name: string) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const idx = {
    adp: col('ADP'),
    pos: col('Position'),
    player: col('Player'),
    team: col('Team'),
    sleeper: col('adp_sleeper'),
    yahoo: col('adp_yahoo'),
  };
  if (idx.adp < 0 || idx.player < 0) throw new Error('4for4 ADP page structure changed (missing columns)');

  const matcher = await getMatcher();
  const rows: FourFourRow[] = [];
  for (const tr of tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => cellText(m[1]));
    if (cells.length < headers.length - 1) continue;
    const overall = num(cells[idx.adp]);
    const name = cells[idx.player];
    if (!overall || !name) continue;
    const match = matcher.match({
      name,
      // "RB-1" → "RB"
      position: idx.pos >= 0 ? cells[idx.pos]?.split('-')[0] : undefined,
      team: idx.team >= 0 ? cells[idx.team] : undefined,
    });
    if (!match.player) continue;
    rows.push({
      playerId: match.player.id,
      overall,
      sleeper: idx.sleeper >= 0 ? num(cells[idx.sleeper]) : undefined,
      yahoo: idx.yahoo >= 0 ? num(cells[idx.yahoo]) : undefined,
    });
  }
  if (rows.length === 0) throw new Error('4for4 ADP page parsed to zero matched players');

  cache = { fetchedAt: Date.now(), rows };
  return rows;
}
