import type {
  CustomRanking,
  DraftSession,
  LeagueSettings,
  Player,
  RankingSource,
  RawPick,
} from '@draft-overlay/shared';

export interface BridgeStatus {
  port: number;
  token: string;
  connected: boolean;
  error?: string;
  /** which draft site the connected extension is reporting picks from */
  site?: 'espn' | 'yahoo' | 'sim';
}

export interface UnmatchedPick {
  overall: number;
  raw: RawPick;
  candidateIds: string[];
}

export interface RegisteredHotkeys {
  /** accelerator that actually registered, null if every candidate was taken */
  overlay: string | null;
  clickThrough: string | null;
}

export interface StateSnapshot {
  settings: LeagueSettings;
  sources: RankingSource[];
  custom: CustomRanking;
  session: DraftSession | null;
  unmatched: UnmatchedPick[];
  bridge: BridgeStatus;
  clickThrough: boolean;
  hotkeys: RegisteredHotkeys;
}

export type AppEvent =
  | { type: 'session'; session: DraftSession | null; unmatched: UnmatchedPick[] }
  | { type: 'sources'; sources: RankingSource[] }
  | { type: 'settings'; settings: LeagueSettings }
  | { type: 'custom'; custom: CustomRanking }
  | { type: 'bridge'; bridge: BridgeStatus }
  | { type: 'clickthrough'; on: boolean };

export interface Api {
  getState(): Promise<StateSnapshot>;
  getPlayers(force?: boolean): Promise<Player[]>;
  saveSettings(settings: LeagueSettings): Promise<void>;
  refreshSource(id?: string): Promise<RankingSource[]>;
  removeSource(id: string): Promise<void>;
  importCsv(): Promise<{ label: string; matched: number; total: number } | null>;
  saveCustom(custom: CustomRanking): Promise<void>;
  exportCustomCsv(csvText: string): Promise<boolean>;
  startDraft(): Promise<void>;
  resetDraft(): Promise<void>;
  pick(playerId: string): Promise<void>;
  undo(): Promise<void>;
  resolvePick(overall: number, playerId: string): Promise<void>;
  toggleOverlay(): Promise<void>;
  setClickThrough(on: boolean): Promise<void>;
  setCollapsed(collapsed: boolean): Promise<void>;
  onEvent(cb: (event: AppEvent) => void): () => void;
}

declare global {
  interface Window {
    api: Api;
  }
}
