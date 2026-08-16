# Draft Overlay

A transparent, always-on-top desktop overlay for live fantasy football drafts. Float it over your draft room, see rankings from multiple providers side-by-side, track picks in real time, and get pick recommendations based on value, tiers, and roster needs.

## Features

- **Transparent overlay window** — frameless, always-on-top, adjustable opacity, click-through mode (global hotkey), collapses to a slim bar.
- **Multi-provider rankings** — side-by-side rank columns fetched at runtime (ESPN live ADP, Sleeper live ADP matched to your scoring format, Yahoo live ADP from their public draft-analysis API, 4for4 consensus) plus CSV import for anything else (FantasyPros, your own sheets). The ⟳ refresh always bypasses caches, so one click pulls current ADP.
- **Custom rankings editor** — drag-and-drop reordering, tier breaks, clone from any provider list, CSV import/export.
- **Live pick tracking** — companion browser extension watches your ESPN/Yahoo draft room and streams picks to the overlay; manual pick-marking always works as fallback and correction.
- **Recommendation engine** — top-3 suggestions with a transparent score breakdown: ADP value, tier scarcity, roster need, and positional-run detection. Positional urgency is gated by availability: players who will still be on the board at your next turn (computed from the actual remaining pool, not raw ADP) don't get reached for.
- **Team balance** — a Team-tab view of the draft capital your roster holds at each position versus a balanced team's investment by that round, with NEED/SET/OVER flags (two late-round RBs read as a need even with the slots technically filled).
- **Snake redraft support** — PPR / half-PPR / standard, any team count, your slot, "picks until my turn."

## Setup

Requires Node 20+.

```bash
npm install
npm run dev          # launches the Electron app in dev mode
```

The launcher window opens on start; use **Open Overlay** to show the transparent overlay. Hotkeys: `⌘⇧O` toggles the overlay, `⌘⇧D` toggles click-through.

```bash
npm test                                  # unit tests (snake math, name matching, CSV, recommendations)
npm run typecheck                         # typecheck all workspaces
npm run build                             # build shared + desktop + extension
npm run replay -- --token=XXXXXXXX        # replay a pick stream through the WS bridge (dev)
npm run package -w @draft-overlay/desktop # macOS DMG (electron-builder)
npm run zip -w @draft-overlay/extension   # extension zip artifact
```

### Browser extension (live pick sync)

```bash
npm run build -w @draft-overlay/extension
```

Then load `apps/extension/dist` as an unpacked extension (Chrome → Extensions → Developer mode → Load unpacked). Pair it with the desktop app using the session token shown in the overlay.


## License

[MIT](LICENSE)
