export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'DST' | 'K';

export const POSITIONS: readonly Position[] = ['QB', 'RB', 'WR', 'TE', 'DST', 'K'];

export type ScoringFormat = 'standard' | 'half' | 'ppr';

export interface Player {
  id: string;
  name: string;
  position: Position;
  team: string | null;
  byeWeek?: number;
}

export interface RosterSlots {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  FLEX: number;
  DST: number;
  K: number;
  BENCH: number;
}

export interface LeagueSettings {
  teams: number;
  mySlot: number;
  scoring: ScoringFormat;
  roster: RosterSlots;
}

export const DEFAULT_SETTINGS: LeagueSettings = {
  teams: 12,
  mySlot: 1,
  scoring: 'ppr',
  roster: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DST: 1, K: 1, BENCH: 6 },
};

export interface RankingEntry {
  rank: number;
  tier?: number;
  adp?: number;
}

export type RankingKind = 'sleeper' | 'espn' | '4for4' | 'yahoo' | 'csv';

export interface RankingSource {
  id: string;
  label: string;
  kind: RankingKind;
  updatedAt: number;
  /** player id → entry; keyed by canonical (Sleeper) player id */
  entries: Record<string, RankingEntry>;
  error?: string;
}

export interface RawPick {
  name: string;
  team?: string;
  position?: string;
}

export type PickOrigin = 'manual' | 'extension';

export interface PickEvent {
  overall: number;
  teamSlot: number;
  /** null while the raw name is unresolved against the player DB */
  playerId: string | null;
  raw?: RawPick;
  origin: PickOrigin;
  ts: number;
}

export interface DraftSession {
  id: string;
  startedAt: number;
  settings: LeagueSettings;
  picks: PickEvent[];
}

export interface CustomRanking {
  /** player ids in order; index = rank - 1 */
  order: string[];
  /** player ids that begin a new tier (stable under drag-reordering) */
  tierStarts: string[];
}

export const EMPTY_CUSTOM_RANKING: CustomRanking = { order: [], tierStarts: [] };

/** Walks the order and assigns a tier number to every player id. */
export function customTiers(custom: CustomRanking): Map<string, number> {
  const starts = new Set(custom.tierStarts);
  const out = new Map<string, number>();
  let tier = 1;
  custom.order.forEach((id, i) => {
    if (i > 0 && starts.has(id)) tier++;
    out.set(id, tier);
  });
  return out;
}

/** Messages the browser extension sends to the desktop WS bridge. */
export type BridgeClientMessage =
  | { type: 'hello'; token: string; site: 'espn' | 'yahoo' | 'sim' }
  | { type: 'pick'; pick: RawPick };

export type BridgeServerMessage =
  | { type: 'ok' }
  | { type: 'error'; message: string };
