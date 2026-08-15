import { globalShortcut } from 'electron';
import { toggleClickThrough, toggleOverlay } from './windows';
import type { RegisteredHotkeys } from '../preload/types';

const registered: RegisteredHotkeys = { overlay: null, clickThrough: null };

// register() fails silently when another app owns the combo, so each action
// gets a fallback list; the launcher shows whichever one actually stuck.
const OVERLAY_KEYS = ['CommandOrControl+Shift+O', 'Control+Alt+O', 'CommandOrControl+Shift+8'];
const CLICKTHROUGH_KEYS = ['CommandOrControl+Shift+D', 'Control+Alt+D', 'CommandOrControl+Shift+7'];

function tryRegister(candidates: string[], handler: () => void): string | null {
  for (const combo of candidates) {
    try {
      if (globalShortcut.register(combo, handler)) return combo;
    } catch {
      // invalid accelerator on this platform — try the next
    }
  }
  return null;
}

export function registerHotkeys(): RegisteredHotkeys {
  registered.overlay = tryRegister(OVERLAY_KEYS, toggleOverlay);
  registered.clickThrough = tryRegister(CLICKTHROUGH_KEYS, toggleClickThrough);
  if (!registered.overlay) console.error('[hotkeys] every overlay-toggle combo is taken by other apps; use the launcher button or tray');
  if (!registered.clickThrough) console.error('[hotkeys] every click-through combo is taken by other apps; use the tray menu');
  return registered;
}

export function getHotkeys(): RegisteredHotkeys {
  return registered;
}
