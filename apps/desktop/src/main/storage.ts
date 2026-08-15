import {
  DEFAULT_SETTINGS,
  EMPTY_CUSTOM_RANKING,
  type CustomRanking,
  type DraftSession,
  type LeagueSettings,
  type RankingSource,
} from '@draft-overlay/shared';
import Store from 'electron-store';

interface Persisted {
  settings: LeagueSettings;
  sources: RankingSource[];
  custom: CustomRanking;
  session: DraftSession | null;
}

export const store = new Store<Persisted>({
  defaults: {
    settings: DEFAULT_SETTINGS,
    sources: [],
    custom: EMPTY_CUSTOM_RANKING,
    session: null,
  },
});
