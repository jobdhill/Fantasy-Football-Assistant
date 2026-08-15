import type { CustomRanking, LeagueSettings } from '@draft-overlay/shared';
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { Api, AppEvent } from './types';

const api: Api = {
  getState: () => ipcRenderer.invoke('state:get'),
  getPlayers: (force?: boolean) => ipcRenderer.invoke('players:get', force),
  saveSettings: (settings: LeagueSettings) => ipcRenderer.invoke('settings:save', settings),
  refreshSource: (id?: string) => ipcRenderer.invoke('sources:refresh', id),
  removeSource: (id: string) => ipcRenderer.invoke('sources:remove', id),
  importCsv: () => ipcRenderer.invoke('csv:import'),
  saveCustom: (custom: CustomRanking) => ipcRenderer.invoke('custom:save', custom),
  exportCustomCsv: (csvText: string) => ipcRenderer.invoke('custom:export', csvText),
  startDraft: () => ipcRenderer.invoke('draft:start'),
  resetDraft: () => ipcRenderer.invoke('draft:reset'),
  pick: (playerId: string) => ipcRenderer.invoke('draft:pick', playerId),
  undo: () => ipcRenderer.invoke('draft:undo'),
  resolvePick: (overall: number, playerId: string) =>
    ipcRenderer.invoke('draft:resolve', overall, playerId),
  toggleOverlay: () => ipcRenderer.invoke('overlay:toggle'),
  setClickThrough: (on: boolean) => ipcRenderer.invoke('overlay:clickthrough', on),
  setCollapsed: (collapsed: boolean) => ipcRenderer.invoke('overlay:collapse', collapsed),
  onEvent: (cb: (event: AppEvent) => void) => {
    const listener = (_e: IpcRendererEvent, event: AppEvent) => cb(event);
    ipcRenderer.on('app-event', listener);
    return () => {
      ipcRenderer.off('app-event', listener);
    };
  },
};

contextBridge.exposeInMainWorld('api', api);
