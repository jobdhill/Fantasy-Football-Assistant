import { createPickReporter, observeDraftRoom } from './common';

// ESPN draft-room adapter — Draft Board view.
//
// Verified against a live 2026 ESPN mock draft room (Board tab). Each
// completed pick renders as:
//   <div class="draft-board-grid-pick-cell completedPick">
//     <div class="pickCellMiddle">
//       <span class="playerFirstName">Bijan</span>
//       <span class="playerLastName">Robinson</span>
//     </div>
//     <div class="pickCellBottom">
//       <span class="playerProTeam">ATL</span>
//       <span class="positionPill">RB</span>
//     </div>
//   </div>
// "jsx-<hash>" classes are CSS-module-generated and change on every ESPN
// deploy, so they're deliberately excluded from these selectors — only the
// stable semantic class names are matched. Upcoming (not-yet-made) picks use
// "upcomingPick" instead of "completedPick" and are skipped.
const SELECTORS = {
  completedPick: '.draft-board-grid-pick-cell.completedPick',
  firstName: '.playerFirstName',
  lastName: '.playerLastName',
  team: '.playerProTeam',
  position: '[class*="positionPill"]',
};

const report = createPickReporter('espn');

function scan(): void {
  for (const cell of document.querySelectorAll(SELECTORS.completedPick)) {
    const first = cell.querySelector(SELECTORS.firstName)?.textContent?.trim();
    const last = cell.querySelector(SELECTORS.lastName)?.textContent?.trim();
    if (!first || !last) continue;
    report({
      name: `${first} ${last}`,
      team: cell.querySelector(SELECTORS.team)?.textContent?.trim() || undefined,
      position: cell.querySelector(SELECTORS.position)?.textContent?.trim() || undefined,
    });
  }
}

observeDraftRoom(scan);
