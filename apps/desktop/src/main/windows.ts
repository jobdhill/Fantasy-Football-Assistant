import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import type { AppEvent } from '../preload/types';

let launcher: BrowserWindow | null = null;
let overlay: BrowserWindow | null = null;
let clickThrough = false;
let expandedBounds: Electron.Rectangle | null = null;

const preloadPath = join(__dirname, '../preload/index.js');

function load(win: BrowserWindow, hash: string): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/${hash}`);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { hash });
  }
}

export function broadcast(event: AppEvent): void {
  for (const win of [launcher, overlay]) {
    if (win && !win.isDestroyed()) win.webContents.send('app-event', event);
  }
}

export function createLauncherWindow(): BrowserWindow {
  if (launcher && !launcher.isDestroyed()) {
    launcher.show();
    return launcher;
  }
  launcher = new BrowserWindow({
    width: 960,
    height: 700,
    minWidth: 720,
    minHeight: 520,
    title: 'Draft Overlay',
    webPreferences: { preload: preloadPath },
  });
  load(launcher, 'launcher');
  launcher.on('closed', () => {
    launcher = null;
  });
  return launcher;
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlay && !overlay.isDestroyed() ? overlay : null;
}

export function createOverlayWindow(): BrowserWindow {
  if (overlay && !overlay.isDestroyed()) return overlay;
  const { workArea } = screen.getPrimaryDisplay();
  overlay = new BrowserWindow({
    width: 400,
    height: Math.min(720, workArea.height - 80),
    x: workArea.x + workArea.width - 420,
    y: workArea.y + 40,
    show: false,
    transparent: true,
    frame: false,
    resizable: true,
    hasShadow: false,
    skipTaskbar: true,
    fullscreenable: false,
    alwaysOnTop: true,
    // macOS: a non-activating NSPanel is what can float over another app's
    // full-screen Space without stealing focus (and yanking the user out of
    // full screen when clicked). A regular window at 'floating' level cannot.
    ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
    webPreferences: { preload: preloadPath },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver', 1);
  overlay.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true,
  });
  load(overlay, 'overlay');
  overlay.on('closed', () => {
    overlay = null;
    clickThrough = false;
  });
  return overlay;
}

export function toggleOverlay(): void {
  const win = getOverlayWindow() ?? createOverlayWindow();
  if (win.isVisible()) {
    win.hide();
  } else {
    // showInactive: bringing the overlay up must not focus this app, or macOS
    // would switch Spaces away from the full-screen draft room.
    win.showInactive();
  }
}

export function setClickThrough(on: boolean): void {
  const win = getOverlayWindow();
  if (!win) return;
  clickThrough = on;
  win.setIgnoreMouseEvents(on, { forward: true });
  broadcast({ type: 'clickthrough', on });
}

export function toggleClickThrough(): void {
  setClickThrough(!clickThrough);
}

export function isClickThrough(): boolean {
  return clickThrough;
}

export function setOverlayCollapsed(collapsed: boolean): void {
  const win = getOverlayWindow();
  if (!win) return;
  if (collapsed) {
    expandedBounds = win.getBounds();
    win.setBounds({ ...expandedBounds, height: 48 });
  } else if (expandedBounds) {
    win.setBounds({ ...win.getBounds(), height: expandedBounds.height });
    expandedBounds = null;
  }
}

export function destroyOverlay(): void {
  getOverlayWindow()?.destroy();
}
