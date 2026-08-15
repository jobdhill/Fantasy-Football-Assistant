import {
  EMPTY_CUSTOM_RANKING,
  DEFAULT_SETTINGS,
  type CustomRanking,
  type DraftSession,
  type LeagueSettings,
  type Player,
  type RankingSource,
} from '@draft-overlay/shared';
import { create } from 'zustand';
import type { BridgeStatus, RegisteredHotkeys, UnmatchedPick } from '../../preload/types';

interface AppState {
  loaded: boolean;
  players: Player[];
  settings: LeagueSettings;
  sources: RankingSource[];
  custom: CustomRanking;
  session: DraftSession | null;
  unmatched: UnmatchedPick[];
  bridge: BridgeStatus | null;
  clickThrough: boolean;
  hotkeys: RegisteredHotkeys;

  init(): Promise<void>;
  saveSettings(settings: LeagueSettings): Promise<void>;
  saveCustom(custom: CustomRanking): Promise<void>;
}

let initialized = false;

export const useApp = create<AppState>((set, get) => ({
  loaded: false,
  players: [],
  settings: DEFAULT_SETTINGS,
  sources: [],
  custom: EMPTY_CUSTOM_RANKING,
  session: null,
  unmatched: [],
  bridge: null,
  clickThrough: false,
  hotkeys: { overlay: null, clickThrough: null },

  async init() {
    if (initialized) return;
    initialized = true;

    window.api.onEvent((event) => {
      switch (event.type) {
        case 'session':
          set({ session: event.session, unmatched: event.unmatched });
          break;
        case 'sources':
          set({ sources: event.sources });
          break;
        case 'settings':
          set({ settings: event.settings });
          break;
        case 'custom':
          set({ custom: event.custom });
          break;
        case 'bridge':
          set({ bridge: event.bridge });
          break;
        case 'clickthrough':
          set({ clickThrough: event.on });
          break;
      }
    });

    const snapshot = await window.api.getState();
    set({ ...snapshot, loaded: get().loaded });
    try {
      const players = await window.api.getPlayers();
      set({ players, loaded: true });
    } catch {
      // Offline with no cache: the UI still opens; ranks appear once a fetch succeeds.
      set({ loaded: true });
    }
  },

  async saveSettings(settings) {
    set({ settings });
    await window.api.saveSettings(settings);
  },

  async saveCustom(custom) {
    set({ custom });
    await window.api.saveCustom(custom);
  },
}));

export function usePlayersById(): Map<string, Player> {
  const players = useApp((s) => s.players);
  return new Map(players.map((p) => [p.id, p]));
}
