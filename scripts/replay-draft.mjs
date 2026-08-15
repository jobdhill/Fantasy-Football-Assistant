#!/usr/bin/env node
// Dev tool: replays a pick-event stream into the desktop app through the same
// WebSocket bridge the browser extension uses, so the full pipeline
// (auth → raw-name matching → session → board/recommendations) is testable
// without a live draft room.
//
// Usage:
//   node scripts/replay-draft.mjs --token=AB12CD34 [--file=picks.json] [--delay=1200] [--count=60]
//
// --token  pairing token shown in the launcher window (also printed in the
//          main-process console in dev)
// --file   recorded stream: JSON array of { name, team?, position? }
//          (defaults to a stream generated from the cached Sleeper player DB)
// --delay  ms between picks
// --count  number of picks to send when generating (ignored with --file)

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
  }),
);

const token = args.token;
if (!token) {
  console.error('Missing --token=… (shown in the launcher window under "Extension pairing")');
  process.exit(1);
}
const delay = Number(args.delay ?? 1200);
const count = Number(args.count ?? 60);

async function loadPicks() {
  if (args.file) {
    const picks = JSON.parse(await readFile(args.file, 'utf8'));
    if (!Array.isArray(picks)) throw new Error('--file must contain a JSON array of picks');
    return picks;
  }
  // Generate from the app's cached player DB (written on first launch).
  // In dev the app runs under Electron's default identity.
  const candidates = [
    join(homedir(), 'Library/Application Support/Electron/players-cache.json'),
    join(homedir(), 'Library/Application Support/Draft Overlay/players-cache.json'),
  ];
  for (const path of candidates) {
    try {
      const cache = JSON.parse(await readFile(path, 'utf8'));
      const order = Object.entries(cache.sleeperRanks).sort((a, b) => a[1] - b[1]);
      const byId = new Map(cache.players.map((p) => [p.id, p]));
      return order
        .map(([id]) => byId.get(id))
        .filter(Boolean)
        .slice(0, count)
        .map((p) => ({ name: p.name, team: p.team ?? undefined, position: p.position }));
    } catch {
      // try next location
    }
  }
  throw new Error('No player cache found — launch the desktop app once first, or pass --file.');
}

const picks = await loadPicks();
console.log(`Replaying ${picks.length} picks (${delay}ms apart) → ws://127.0.0.1:8777`);

const ws = new WebSocket('ws://127.0.0.1:8777');
ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', token, site: 'sim' })));
ws.on('error', (err) => {
  console.error('Connection failed — is the desktop app running?', err.message);
  process.exit(1);
});
ws.on('message', async (data) => {
  const msg = JSON.parse(String(data));
  if (msg.type === 'error') {
    console.error('Bridge rejected us:', msg.message);
    process.exit(1);
  }
  if (msg.type !== 'ok') return;
  console.log('Paired. Streaming picks…');
  for (const [i, pick] of picks.entries()) {
    ws.send(JSON.stringify({ type: 'pick', pick }));
    console.log(`  #${i + 1} ${pick.name} (${pick.position ?? '?'} ${pick.team ?? ''})`);
    await new Promise((r) => setTimeout(r, delay));
  }
  console.log('Done.');
  ws.close();
  process.exit(0);
});
