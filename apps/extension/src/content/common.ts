export interface ReportedPick {
  name: string;
  team?: string;
  position?: string;
}

/** De-dupes picks (draft rooms re-render their logs constantly) and ships them to the worker. */
export function createPickReporter(site: 'espn' | 'yahoo') {
  const seen = new Set<string>();
  return function report(pick: ReportedPick): void {
    const name = pick.name?.trim();
    if (!name || name.length < 3) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    try {
      void chrome.runtime.sendMessage({ type: 'pick', site, pick: { ...pick, name } });
    } catch {
      seen.delete(key); // worker asleep or gone; let a later mutation retry
    }
  };
}

/** Runs the scanner on DOM mutations, throttled, plus an initial pass. */
export function observeDraftRoom(scan: () => void): void {
  let scheduled = false;
  const run = () => {
    scheduled = false;
    try {
      scan();
    } catch {
      // Selector drift must never break the page; manual mode still works.
    }
  };
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(run, 400);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  setTimeout(run, 1500);
}
