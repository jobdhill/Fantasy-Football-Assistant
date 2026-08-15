import { roundOfPick, totalRounds } from './snake';
import type { LeagueSettings, Player, Position } from './types';

export interface AvailablePlayer {
  player: Player;
  /** board rank in use (custom ranking if present, else consensus) */
  rank: number;
  tier?: number;
  adp?: number;
}

export interface ScoreBreakdown {
  /** board-rank strength relative to best available (0..1) */
  base: number;
  /** ADP value — positive when the player has fallen past their ADP (0..1, 0.5 = neutral) */
  value: number;
  /** tier/positional scarcity (0..1) */
  scarcity: number;
  /** roster need at the position (0..1) */
  need: number;
  /** positional-run pressure from recent picks (0..1) */
  run: number;
}

export interface Recommendation {
  player: Player;
  rank: number;
  tier?: number;
  adp?: number;
  score: number;
  breakdown: ScoreBreakdown;
  /** probability the player is picked before my next turn (0..1) */
  goneBeforeNextTurn: number;
  /** true when this is one of the last 2 players in their tier at their position */
  tierAlert: boolean;
}

export interface RecommendInput {
  available: AvailablePlayer[];
  settings: LeagueSettings;
  /** my current roster counts by position */
  myPositionCounts: Partial<Record<Position, number>>;
  /** the overall pick currently on the clock (1-indexed) */
  currentOverall: number;
  /** picks made by other teams before my next turn (window for "gone" probability) */
  picksUntilNext: number;
  /** positions of the most recent picks, newest last */
  recentPositions: Position[];
}

const WEIGHTS = { base: 0.40, value: 0.15, scarcity: 0.18, need: 0.20, run: 0.07 };
const FLEX_ELIGIBLE: readonly Position[] = ['RB', 'WR', 'TE'];
const RUN_WINDOW = 8;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function needScores(input: RecommendInput): Record<Position, number> {
  const { roster } = input.settings;
  const counts = input.myPositionCounts;
  const round = roundOfPick(input.currentOverall, input.settings.teams);
  const rounds = totalRounds(input.settings.roster);
  // Damp DST/K urgency early: they matter in the last few rounds, not round 3.
  const lateFactor = clamp01((round - rounds * 0.6) / (rounds * 0.4));

  const dedicated: Record<Position, number> = {
    QB: roster.QB, RB: roster.RB, WR: roster.WR, TE: roster.TE, DST: roster.DST, K: roster.K,
  };

  let flexSurplusUsed = 0;
  const out = {} as Record<Position, number>;
  for (const pos of ['RB', 'WR', 'TE'] as Position[]) {
    const surplus = Math.max(0, (counts[pos] ?? 0) - dedicated[pos]);
    flexSurplusUsed += surplus;
  }
  const flexOpen = Math.max(0, roster.FLEX - flexSurplusUsed);

  for (const pos of Object.keys(dedicated) as Position[]) {
    const have = counts[pos] ?? 0;
    const unfilled = Math.max(0, dedicated[pos] - have);
    let score: number;
    if (unfilled > 0) score = 1;
    else if (FLEX_ELIGIBLE.includes(pos) && flexOpen > 0) score = 0.7;
    else score = 0.35 / (1 + (have - dedicated[pos]));
    if (pos === 'DST' || pos === 'K') score *= lateFactor;
    out[pos] = clamp01(score);
  }
  return out;
}

function scarcityScores(available: AvailablePlayer[]): Map<AvailablePlayer, { score: number; alert: boolean }> {
  const byPos = new Map<Position, AvailablePlayer[]>();
  for (const a of available) {
    const list = byPos.get(a.player.position) ?? [];
    list.push(a);
    byPos.set(a.player.position, list);
  }
  const out = new Map<AvailablePlayer, { score: number; alert: boolean }>();
  for (const a of available) {
    const peers = byPos.get(a.player.position)!;
    if (a.tier != null) {
      const leftInTier = peers.filter((p) => p.tier === a.tier).length;
      out.set(a, { score: clamp01(1 / leftInTier + 0.15), alert: leftInTier <= 2 });
    } else {
      // No tier data: approximate with how few same-position players sit near this rank.
      const nearby = peers.filter((p) => p.rank <= a.rank + 12).length;
      out.set(a, { score: clamp01(1 - nearby / 6), alert: false });
    }
  }
  return out;
}

/**
 * Probability a player (anchored at their ADP, or rank when no ADP) is taken
 * within the next `picksUntilNext` picks. Exported for per-row badges.
 */
export function pickGoneProbability(anchor: number, currentOverall: number, picksUntilNext: number): number {
  if (picksUntilNext <= 0) return 0;
  const horizon = currentOverall + picksUntilNext;
  const sigma = Math.max(4, anchor * 0.18);
  return clamp01(1 / (1 + Math.exp(-(horizon - anchor) / (sigma * 0.55))));
}

function goneProbability(a: AvailablePlayer, currentOverall: number, picksUntilNext: number): number {
  return pickGoneProbability(a.adp ?? a.rank, currentOverall, picksUntilNext);
}

/** Scores every available player; result is sorted best-first. */
export function recommend(input: RecommendInput): Recommendation[] {
  if (input.available.length === 0) return [];
  const bestRank = Math.min(...input.available.map((a) => a.rank));
  const needs = needScores(input);
  const scarcity = scarcityScores(input.available);
  const recent = input.recentPositions.slice(-RUN_WINDOW);

  const recs = input.available.map((a): Recommendation => {
    const pos = a.player.position;
    const base = clamp01(1 - (a.rank - bestRank) / 20);
    const value = a.adp != null
      ? (Math.min(1, Math.max(-1, (input.currentOverall - a.adp) / 15)) + 1) / 2
      : 0.5;
    const sc = scarcity.get(a)!;
    const need = needs[pos];
    const run = recent.length ? recent.filter((p) => p === pos).length / RUN_WINDOW : 0;

    const breakdown: ScoreBreakdown = { base, value, scarcity: sc.score, need, run };
    const score =
      100 *
      (WEIGHTS.base * base +
        WEIGHTS.value * value +
        WEIGHTS.scarcity * sc.score +
        WEIGHTS.need * need +
        WEIGHTS.run * run);

    return {
      player: a.player,
      rank: a.rank,
      tier: a.tier,
      adp: a.adp,
      score: Math.round(score * 10) / 10,
      breakdown,
      goneBeforeNextTurn: goneProbability(a, input.currentOverall, input.picksUntilNext),
      tierAlert: sc.alert,
    };
  });

  recs.sort((x, y) => y.score - x.score || x.rank - y.rank);
  return recs;
}
