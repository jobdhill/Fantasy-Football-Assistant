import {
  normalizeName,
  slotForPick,
  totalRounds,
  type DraftSession,
  type PickEvent,
  type PickOrigin,
  type RawPick,
} from '@draft-overlay/shared';
import { randomUUID } from 'node:crypto';
import { getMatcher } from './playerdb';
import { store } from './storage';
import { broadcast } from './windows';
import type { UnmatchedPick } from '../preload/types';

let session: DraftSession | null = store.get('session');
let unmatched: UnmatchedPick[] = [];

export function getSession(): DraftSession | null {
  return session;
}

export function getUnmatched(): UnmatchedPick[] {
  return unmatched;
}

function persistAndEmit(): void {
  store.set('session', session);
  broadcast({ type: 'session', session, unmatched });
}

function pickedIds(): Set<string> {
  const out = new Set<string>();
  for (const p of session?.picks ?? []) if (p.playerId) out.add(p.playerId);
  return out;
}

function draftComplete(): boolean {
  if (!session) return true;
  return session.picks.length >= session.settings.teams * totalRounds(session.settings.roster);
}

function pushPick(playerId: string | null, origin: PickOrigin, raw?: RawPick): PickEvent | null {
  if (!session || draftComplete()) return null;
  const overall = session.picks.length + 1;
  const pick: PickEvent = {
    overall,
    teamSlot: slotForPick(overall, session.settings.teams),
    playerId,
    raw,
    origin,
    ts: Date.now(),
  };
  session.picks.push(pick);
  return pick;
}

export function startDraft(): void {
  session = {
    id: randomUUID(),
    startedAt: Date.now(),
    settings: store.get('settings'),
    picks: [],
  };
  unmatched = [];
  persistAndEmit();
}

export function resetDraft(): void {
  session = null;
  unmatched = [];
  persistAndEmit();
}

export function manualPick(playerId: string): void {
  if (!session) startDraft();
  if (pickedIds().has(playerId)) return;
  pushPick(playerId, 'manual');
  persistAndEmit();
}

/**
 * Handles a pick arriving as raw text (extension or replay). Matches against
 * the player DB; ambiguous names are recorded as unresolved so the pick count
 * stays correct and the user can fix them from the resolver UI.
 */
export async function rawPick(raw: RawPick, origin: PickOrigin): Promise<void> {
  if (!session) startDraft();
  const key = normalizeName(raw.name);
  if (!key) return;
  // Draft rooms re-render their pick log; drop events we already recorded.
  const seen = session!.picks.some((p) => p.raw && normalizeName(p.raw.name) === key);
  if (seen) return;

  const matcher = await getMatcher();
  const m = matcher.match(raw);
  if (m.player && pickedIds().has(m.player.id)) return;

  const pick = pushPick(m.player?.id ?? null, origin, raw);
  if (pick && !pick.playerId) {
    unmatched.push({ overall: pick.overall, raw, candidateIds: m.candidates.map((c) => c.id) });
  }
  persistAndEmit();
}

export function undoPick(): void {
  if (!session || session.picks.length === 0) return;
  const removed = session.picks.pop()!;
  unmatched = unmatched.filter((u) => u.overall !== removed.overall);
  persistAndEmit();
}

export function resolvePick(overall: number, playerId: string): void {
  const pick = session?.picks.find((p) => p.overall === overall);
  if (!pick) return;
  pick.playerId = playerId;
  unmatched = unmatched.filter((u) => u.overall !== overall);
  persistAndEmit();
}
