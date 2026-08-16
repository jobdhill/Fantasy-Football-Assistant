import {
  autoTierStarts,
  customTiers,
  goneOdds,
  hasUsableSpread,
  nextPickForSlot,
  picksUntilTurn,
  recommend,
  roundOfPick,
  slotForPick,
  teamBalance,
  totalRounds,
  type AvailablePlayer,
  type CustomRanking,
  type DraftSession,
  type LeagueSettings,
  type Player,
  type Position,
  type PositionBalance,
  type RankingSource,
  type Recommendation,
  type RosteredPlayerValue,
} from '@draft-overlay/shared';

export interface BoardRow {
  player: Player;
  /** rank driving default board order: custom rank when set, else consensus */
  boardRank: number;
  /** average of provider ranks (Infinity when no provider lists the player) */
  consensusRank: number;
  /** position in the user's custom ranking, when ranked there */
  customRank?: number;
  tier?: number;
  adp?: number;
  /** rank per source, aligned with the sources array */
  sourceRanks: Array<number | undefined>;
  picked: boolean;
  pickedBySlot?: number;
  /**
   * ADP from the source matching the platform you're actually drafting on,
   * when the extension reports one and that source ranks the player. This is
   * what "gets taken" odds should anchor on — a room follows its own
   * platform's board, not a blend of every source.
   */
  platformAdp?: number;
}

export function buildBoard(
  players: Player[],
  sources: RankingSource[],
  custom: CustomRanking,
  session: DraftSession | null,
  /** draft platform the extension is currently connected to, when known */
  draftSite?: 'espn' | 'yahoo' | 'sim',
): BoardRow[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  const customRank = new Map(custom.order.map((id, i) => [id, i + 1]));
  const customTierMap = customTiers(custom);

  const pickedBy = new Map<string, number>();
  for (const pick of session?.picks ?? []) {
    if (pick.playerId) pickedBy.set(pick.playerId, pick.teamSlot);
  }

  // Prefer a source whose ADP is real draft cost over one that mirrors its rank
  // column, so row.adp (used for tiers and "gets taken" odds) means something.
  const adpSources = [...sources].sort((a, b) => {
    const score = (src: RankingSource) => {
      const vals = Object.values(src.entries)
        .map((e) => e.adp)
        .filter((v): v is number => v != null);
      return vals.length >= 3 && hasUsableSpread(vals) ? 0 : 1;
    };
    return score(a) - score(b);
  });

  const ids = new Set<string>(custom.order);
  for (const source of sources) for (const id of Object.keys(source.entries)) ids.add(id);

  // ESPN and Yahoo drafts have a source of the same name; the room follows
  // that platform's own board, so gone-odds should key off it specifically
  // rather than whichever source happens to have the cleanest ADP spread.
  const platformSource =
    draftSite === 'espn' || draftSite === 'yahoo'
      ? sources.find((s) => s.kind === draftSite)
      : undefined;

  const rows: BoardRow[] = [];
  for (const id of ids) {
    const player = byId.get(id);
    if (!player) continue;

    const sourceRanks = sources.map((s) => s.entries[id]?.rank);
    const known = sourceRanks.filter((r): r is number => r != null);
    const consensusRank = known.length ? known.reduce((a, b) => a + b, 0) / known.length : Infinity;
    const boardRank = customRank.get(id) ?? consensusRank;
    if (!Number.isFinite(boardRank)) continue;

    let adp: number | undefined;
    let csvTier: number | undefined;
    for (const source of adpSources) {
      const entry = source.entries[id];
      if (entry?.adp != null && adp == null) adp = entry.adp;
      if (entry?.tier != null && csvTier == null) csvTier = entry.tier;
    }

    rows.push({
      player,
      boardRank,
      consensusRank,
      customRank: customRank.get(id),
      tier: customTierMap.get(id) ?? csvTier,
      adp,
      sourceRanks,
      picked: pickedBy.has(id),
      pickedBySlot: pickedBy.get(id),
      platformAdp: platformSource?.entries[id]?.adp,
    });
  }
  rows.sort((a, b) => a.boardRank - b.boardRank);
  assignTiers(rows, custom);
  return rows;
}

/**
 * Tiers come from gaps in draft cost, computed over the full board so the
 * letters stay put as players come off it. An explicit break the user dragged
 * in wins over the computed ones; without any, the whole board is auto-tiered.
 */
function assignTiers(rows: BoardRow[], custom: CustomRanking): void {
  if (rows.length === 0) return;
  const manual = customTiers(custom);
  if (custom.tierStarts.length > 0) {
    for (const row of rows) row.tier = manual.get(row.player.id) ?? row.tier;
    return;
  }

  // ADP is the truest measure of where the market draws its lines, but only
  // when the source publishes real draft cost. Providers that echo their rank
  // list into the ADP column (1, 2, 3, …) carry no gaps, so tiering on them
  // collapses the whole board into one tier — fall back to board rank there,
  // which at least spaces players evenly and yields no false cliffs.
  const adps = rows.map((r) => r.adp).filter((a): a is number => a != null);
  const useAdp = hasUsableSpread(adps);
  const tierable = rows.map((r) => ({
    id: r.player.id,
    value: (useAdp ? r.adp : undefined) ?? r.boardRank,
  }));
  const starts = new Set(autoTierStarts(tierable));
  let tier = 1;
  for (const row of rows) {
    if (starts.has(row.player.id)) tier++;
    row.tier = tier;
  }
}

export interface DraftContext {
  currentOverall: number;
  onClockSlot: number;
  onClock: boolean;
  picksUntilMyTurn: number;
  /** opponent picks between now and my next opportunity (window for "gone" odds) */
  goneWindow: number;
  complete: boolean;
}

export function draftContext(session: DraftSession | null, fallback: LeagueSettings): DraftContext {
  const settings = session?.settings ?? fallback;
  const currentOverall = (session?.picks.length ?? 0) + 1;
  const total = settings.teams * totalRounds(settings.roster);
  const complete = (session?.picks.length ?? 0) >= total;
  const onClockSlot = complete ? 0 : slotForPick(currentOverall, settings.teams);
  const onClock = onClockSlot === settings.mySlot;
  const picksUntilMyTurn = complete ? 0 : picksUntilTurn(currentOverall, settings.mySlot, settings.teams);
  const goneWindow = complete
    ? 0
    : onClock
      ? nextPickForSlot(currentOverall + 1, settings.mySlot, settings.teams) - currentOverall - 1
      : picksUntilMyTurn;
  return { currentOverall, onClockSlot, onClock, picksUntilMyTurn, goneWindow, complete };
}

export function rosterForSlot(session: DraftSession | null, slot: number, byId: Map<string, Player>): Player[] {
  if (!session) return [];
  const out: Player[] = [];
  for (const pick of session.picks) {
    if (pick.teamSlot !== slot || !pick.playerId) continue;
    const player = byId.get(pick.playerId);
    if (player) out.push(player);
  }
  return out;
}

export function topRecommendations(
  rows: BoardRow[],
  session: DraftSession | null,
  fallback: LeagueSettings,
  byId: Map<string, Player>,
  count = 3,
): Recommendation[] {
  const settings = session?.settings ?? fallback;
  const ctx = draftContext(session, fallback);
  if (ctx.complete) return [];

  const available: AvailablePlayer[] = rows
    .filter((r) => !r.picked)
    .slice(0, 120)
    .map((r) => ({ player: r.player, rank: r.boardRank, tier: r.tier, adp: r.platformAdp ?? r.adp }));

  const counts: Partial<Record<Position, number>> = {};
  const recent: Position[] = [];
  for (const pick of session?.picks ?? []) {
    if (!pick.playerId) continue;
    const player = byId.get(pick.playerId);
    if (!player) continue;
    recent.push(player.position);
    if (pick.teamSlot === settings.mySlot) counts[player.position] = (counts[player.position] ?? 0) + 1;
  }

  return recommend({
    available,
    settings,
    myPositionCounts: counts,
    currentOverall: ctx.currentOverall,
    picksUntilNext: ctx.goneWindow,
    recentPositions: recent,
  }).slice(0, count);
}

/** Market draft-cost anchor for a row: platform ADP, blended ADP, then rank. */
function rowAnchor(row: BoardRow): number {
  return (
    row.platformAdp ??
    row.adp ??
    (Number.isFinite(row.consensusRank) ? row.consensusRank : row.boardRank)
  );
}

/**
 * Gone-before-my-next-turn odds per player id, computed from the pool of
 * players actually still on the board — every pick already made shrinks the
 * supply shielding the rest.
 */
export function goneOddsForBoard(rows: BoardRow[], ctx: DraftContext): Map<string, number> {
  if (ctx.complete || ctx.goneWindow <= 0) return new Map();
  const pool = rows
    .filter((r) => !r.picked)
    .map((r) => ({ id: r.player.id, anchor: rowAnchor(r) }));
  return goneOdds(pool, ctx.goneWindow);
}

export interface TeamBalanceView {
  balances: PositionBalance[];
  playersByPos: Record<Position, Player[]>;
  round: number;
  rounds: number;
}

export function teamBalanceView(
  rows: BoardRow[],
  session: DraftSession | null,
  fallback: LeagueSettings,
  byId: Map<string, Player>,
): TeamBalanceView {
  const settings = session?.settings ?? fallback;
  const ctx = draftContext(session, fallback);
  const anchorById = new Map(rows.map((r) => [r.player.id, rowAnchor(r)]));

  const players: RosteredPlayerValue[] = [];
  const playersByPos: Record<Position, Player[]> = { QB: [], RB: [], WR: [], TE: [], DST: [], K: [] };
  const myPickOveralls: number[] = [];
  for (const pick of session?.picks ?? []) {
    if (pick.teamSlot !== settings.mySlot || !pick.playerId) continue;
    myPickOveralls.push(pick.overall);
    const player = byId.get(pick.playerId);
    if (!player) continue;
    // Roster players unknown to every source carry late-round market value.
    players.push({ position: player.position, anchor: anchorById.get(player.id) ?? 200 });
    playersByPos[player.position].push(player);
  }

  const rounds = totalRounds(settings.roster);
  const round = Math.min(rounds, roundOfPick(ctx.currentOverall, settings.teams));
  return {
    balances: teamBalance({ players, myPickOveralls, settings, currentOverall: ctx.currentOverall }),
    playersByPos,
    round,
    rounds,
  };
}

export interface TierSummary {
  tier: number;
  counts: Partial<Record<Position, number>>;
}

/** Best (lowest-numbered) tier with players still available, and who's left in it. */
export function tierSummary(rows: BoardRow[]): TierSummary | null {
  const tiered = rows.filter((r) => !r.picked && r.tier != null);
  if (tiered.length === 0) return null;
  const tier = Math.min(...tiered.map((r) => r.tier!));
  const counts: Partial<Record<Position, number>> = {};
  for (const row of tiered) {
    if (row.tier === tier) counts[row.player.position] = (counts[row.player.position] ?? 0) + 1;
  }
  return { tier, counts };
}

const TIER_LETTERS = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export function tierLetter(tier: number): string {
  return TIER_LETTERS[tier - 1] ?? `T${tier}`;
}

export const TIER_COLORS = [
  '#e05d5d', '#e0a75d', '#e0d95d', '#7ee05d', '#5de0c0',
  '#5da9e0', '#8f5de0', '#e05dc0', '#9a9a9a',
];

export function tierColor(tier: number | undefined): string | undefined {
  if (tier == null) return undefined;
  return TIER_COLORS[(tier - 1) % TIER_COLORS.length];
}

export const POSITION_COLORS: Record<Position, string> = {
  QB: '#a78bfa',
  RB: '#34d399',
  WR: '#f5b942',
  TE: '#38bdf8',
  DST: '#94a3b8',
  K: '#2dd4bf',
};

/** Sleeper's public CDN headshots; team logos stand in for defenses. */
export function headshotUrl(player: Player): string {
  if (player.position === 'DST') {
    return `https://sleepercdn.com/images/team_logos/nfl/${(player.team ?? player.id).toLowerCase()}.png`;
  }
  return `https://sleepercdn.com/content/nfl/players/thumb/${player.id}.jpg`;
}

const SHORT_LABELS: Record<string, string> = {
  sleeper: 'SLP',
  espn: 'ESPN',
  '4for4': '4F4',
  yahoo: 'Y!',
};

export function sourceShortLabel(source: RankingSource): string {
  return SHORT_LABELS[source.kind] ?? source.label.slice(0, 3).toUpperCase();
}
