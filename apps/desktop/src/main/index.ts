import { app, globalShortcut, Menu, nativeImage, Tray } from 'electron';
import { join } from 'node:path';
import { startBridge } from './bridge';
import { registerHotkeys } from './hotkeys';
import { registerIpc } from './ipc';
import { pruneRetiredSources } from './rankings';
import {
  createLauncherWindow,
  createOverlayWindow,
  destroyOverlay,
  toggleClickThrough,
  toggleOverlay,
} from './windows';

let tray: Tray | null = null;

function createTray(): void {
  try {
    const icon = nativeImage.createFromPath(join(__dirname, '../../resources/trayTemplate.png'));
    if (icon.isEmpty()) return;
    tray = new Tray(icon);
    tray.setToolTip('Draft Overlay');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Toggle Overlay', accelerator: 'CmdOrCtrl+Shift+O', click: () => toggleOverlay() },
        { label: 'Toggle Click-Through', accelerator: 'CmdOrCtrl+Shift+D', click: () => toggleClickThrough() },
        { type: 'separator' },
        { label: 'Open Launcher', click: () => createLauncherWindow() },
        { label: 'Quit', role: 'quit' },
      ]),
    );
  } catch {
    // Tray is a convenience; the launcher button and hotkeys cover the same actions.
  }
}

app.whenReady().then(() => {
  pruneRetiredSources();
  registerIpc();
  startBridge();
  createLauncherWindow();
  createOverlayWindow(); // created hidden so the first toggle is instant
  createTray();
  registerHotkeys();

  app.on('activate', () => createLauncherWindow());
});

app.on('window-all-closed', () => {
  // Keep running on macOS (tray + hotkeys); standard quit elsewhere.
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  destroyOverlay();
  tray?.destroy();
});
