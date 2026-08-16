import type { CustomRanking, LeagueSettings } from '@draft-overlay/shared';
import { dialog, ipcMain } from 'electron';
import { writeFile } from 'node:fs/promises';
import { getBridgeInfo } from './bridge';
import { getHotkeys } from './hotkeys';
import {
  getSession,
  getUnmatched,
  manualPick,
  resetDraft,
  resolvePick,
  startDraft,
  undoPick,
} from './draft';
import { getPlayers } from './playerdb';
import { getSources, importCsvFile, refreshSources, removeSource } from './rankings';
import { store } from './storage';
import {
  broadcast,
  isClickThrough,
  setClickThrough,
  setOverlayCollapsed,
  toggleOverlay,
} from './windows';
import type { StateSnapshot } from '../preload/types';

export function registerIpc(): void {
  ipcMain.handle('state:get', (): StateSnapshot => {
    return {
      settings: store.get('settings'),
      sources: getSources(),
      custom: store.get('custom'),
      session: getSession(),
      unmatched: getUnmatched(),
      bridge: getBridgeInfo(),
      clickThrough: isClickThrough(),
      hotkeys: getHotkeys(),
    };
  });

  ipcMain.handle('players:get', (_e, force?: boolean) => getPlayers(force));

  // Settings/custom edits happen in the launcher; broadcast so the overlay
  // window (and vice versa) picks them up immediately.
  ipcMain.handle('settings:save', (_e, settings: LeagueSettings) => {
    store.set('settings', settings);
    broadcast({ type: 'settings', settings });
  });

  ipcMain.handle('sources:refresh', (_e, id?: string, force?: boolean) => refreshSources(id, force));
  ipcMain.handle('sources:remove', (_e, id: string) => removeSource(id));

  ipcMain.handle('csv:import', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Import rankings CSV',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      properties: ['openFile'],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    return importCsvFile(res.filePaths[0]);
  });

  ipcMain.handle('custom:save', (_e, custom: CustomRanking) => {
    store.set('custom', custom);
    broadcast({ type: 'custom', custom });
  });

  ipcMain.handle('custom:export', async (_e, csvText: string) => {
    const res = await dialog.showSaveDialog({
      title: 'Export custom rankings',
      defaultPath: 'my-rankings.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (res.canceled || !res.filePath) return false;
    await writeFile(res.filePath, csvText, 'utf8');
    return true;
  });

  ipcMain.handle('draft:start', () => startDraft());
  ipcMain.handle('draft:reset', () => resetDraft());
  ipcMain.handle('draft:pick', (_e, playerId: string) => manualPick(playerId));
  ipcMain.handle('draft:undo', () => undoPick());
  ipcMain.handle('draft:resolve', (_e, overall: number, playerId: string) =>
    resolvePick(overall, playerId),
  );

  ipcMain.handle('overlay:toggle', () => toggleOverlay());
  ipcMain.handle('overlay:clickthrough', (_e, on: boolean) => setClickThrough(on));
  ipcMain.handle('overlay:collapse', (_e, collapsed: boolean) => setOverlayCollapsed(collapsed));

  // Warm the sources on startup so the board has columns on first open.
  void refreshSources().catch(() => undefined);
  void getPlayers().catch(() => undefined);

  // Let renderers know the initial bridge state once they subscribe.
  setTimeout(() => broadcast({ type: 'bridge', bridge: getBridgeInfo() }), 1500);
}
