import { createPickReporter, observeDraftRoom } from './common';

// Yahoo draft-room adapter.
//
// Yahoo renders drafted players as "First Last (TEAM - POS)" in its results and
// pick-log panes, so this adapter parses row text instead of leaning on class
// names — markup churn is more likely than that format changing. Container
// selectors below are the seasonal-maintenance point.
const SELECTORS = {
  containers: [
    '#draftresults',
    '[class*="draft-results"]',
    '[class*="DraftResults"]',
    '[class*="pick-list"]',
    '[class*="PickList"]',
  ].join(', '),
};

// "Justin Jefferson (Min - WR)" / "Baltimore (Bal - DEF)"
const PICK_RE = /([A-Za-z.'\- ]{3,40})\s*\(([A-Za-z]{2,3})\s*-\s*([A-Za-z/]{1,4})\)/g;

const report = createPickReporter('yahoo');

function scan(): void {
  const roots = document.querySelectorAll(SELECTORS.containers);
  const scope = roots.length > 0 ? [...roots] : [document.body];
  for (const root of scope) {
    const text = root.textContent ?? '';
    for (const match of text.matchAll(PICK_RE)) {
      report({
        name: match[1].trim(),
        team: match[2].toUpperCase(),
        position: match[3].toUpperCase(),
      });
    }
  }
}

observeDraftRoom(scan);
