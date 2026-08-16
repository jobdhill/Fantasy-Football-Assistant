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
  /** true when this is one of the last 2 players in their position's best remaining tier */
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
/** flex appeal once starters are filled — a 2nd TE almost never beats an RB/WR for the flex spot */
const FLEX_APPEAL: Partial<Record<Position, number>> = { RB: 0.7, WR: 0.7, TE: 0.2 };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function needScores(input: RecommendInput): Record<Position, number> {
  const { roster } = input.settings;
  const counts = input.myPositionCounts;
  const round = roundOfPick(input.currentOverall, input.settings.teams);
  const rounds = totalRounds(input.settings.roster);
  // Damp DST/K urgency early: they matter in the last few rounds, not round 3.
  const lateFactor = clamp01((round - rounds * 0.6) / (rounds * 0.4));
  // Backup QBs/TEs are mid-to-late picks; right after the starter is set, the
  // position is handled and "depth" is not yet an argument.
  const backupFactor = clamp01((round - rounds * 0.4) / (rounds * 0.35));

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
    if (unfilled > 0) {
      score = 1;
    } else {
      const flexAppeal = flexOpen > 0 ? FLEX_APPEAL[pos] ?? 0 : 0;
      const depth = 0.35 / (1 + (have - dedicated[pos]));
      score = Math.max(flexAppeal, pos === 'QB' || pos === 'TE' ? depth * backupFactor : depth);
    }
    if (pos === 'DST' || pos === 'K') score *= lateFactor;
    out[pos] = clamp01(score);
  }
  return out;
}

/**
 * Scarcity is about a door that's closing *now*: the position's best remaining
 * tier running dry. A player sitting alone in some ninth tier is not scarce —
 * the supply behind him is plentiful — so deeper tiers decay toward zero
 * instead of lighting up whenever a tier happens to be small.
 */
function scarcityScores(available: AvailablePlayer[]): Map<AvailablePlayer, { score: number; alert: boolean }> {
  const byPos = new Map<Position, AvailablePlayer[]>();
  for (const a of available) {
    const list = byPos.get(a.player.position) ?? [];
    list.push(a);
    byPos.set(a.player.position, list);
  }
  const bestTier = new Map<Position, number>();
  for (const a of available) {
    if (a.tier == null) continue;
    const cur = bestTier.get(a.player.position);
    if (cur == null || a.tier < cur) bestTier.set(a.player.position, a.tier);
  }
  const out = new Map<AvailablePlayer, { score: number; alert: boolean }>();
  for (const a of available) {
    const peers = byPos.get(a.player.position)!;
    if (a.tier != null) {
      const best = bestTier.get(a.player.position)!;
      if (a.tier === best) {
        const leftInTier = peers.filter((p) => p.tier === a.tier).length;
        out.set(a, { score: clamp01(1 / leftInTier + 0.15), alert: leftInTier <= 2 });
      } else {
        out.set(a, { score: clamp01(0.25 / (a.tier - best + 1)), alert: false });
      }
    } else {
      // No tier data: approximate with how few same-position players sit near this rank.
      const nearby = peers.filter((p) => p.rank <= a.rank + 12).length;
      out.set(a, { score: clamp01(1 - nearby / 6), alert: false });
    }
  }
  return out;
}

/**
 * Probability a player is taken within the next `picksUntilNext` picks, given
 * `availableAhead`: how many still-available players the room rates better
 * (earlier ADP / rank). The room drains the top of the *remaining* board, so
 * what shields a player is preferred supply, not his raw ADP versus the pick
 * number — a faller with 20 names still ahead of him is in no hurry to leave.
 * Noise widens with depth: late rooms stray further from consensus.
 */
export function pickGoneProbability(availableAhead: number, picksUntilNext: number): number {
  if (picksUntilNext <= 0) return 0;
  const sigma = Math.max(2, availableAhead * 0.3 + picksUntilNext * 0.15);
  return clamp01(1 / (1 + Math.exp(-(picksUntilNext - availableAhead) / sigma)));
}

export interface AnchoredPlayer {
  id: string;
  /** market draft cost — ADP preferred, board rank as fallback */
  anchor: number;
}

/** Gone-before-next-turn odds for every player in an available pool, keyed by player id. */
export function goneOdds(pool: AnchoredPlayer[], picksUntilNext: number): Map<string, number> {
  const sorted = [...pool].sort((a, b) => a.anchor - b.anchor);
  const out = new Map<string, number>();
  sorted.forEach((p, i) => out.set(p.id, pickGoneProbability(i, picksUntilNext)));
  return out;
}

/** Scores every available player; result is sorted best-first. */
export function recommend(input: RecommendInput): Recommendation[] {
  if (input.available.length === 0) return [];
  const bestRank = Math.min(...input.available.map((a) => a.rank));
  const needs = needScores(input);
  const scarcity = scarcityScores(input.available);
  const recent = input.recentPositions.slice(-RUN_WINDOW);
  const gone = goneOdds(
    input.available.map((a) => ({ id: a.player.id, anchor: a.adp ?? a.rank })),
    input.picksUntilNext,
  );

  const recs = input.available.map((a): Recommendation => {
    const pos = a.player.position;
    const base = clamp01(1 - (a.rank - bestRank) / 20);
    const value = a.adp != null
      ? (Math.min(1, Math.max(-1, (input.currentOverall - a.adp) / 15)) + 1) / 2
      : 0.5;
    const sc = scarcity.get(a)!;
    const need = needs[pos];
    const run = recent.length ? recent.filter((p) => p === pos).length / RUN_WINDOW : 0;
    const goneP = gone.get(a.player.id) ?? 0;

    // Need, scarcity, and run pressure only justify a pick *now* if the player
    // won't survive until my next turn; a sure survivor can be had later, so
    // his positional case is discounted toward a floor.
    const urgency = 0.3 + 0.7 * goneP;

    const breakdown: ScoreBreakdown = { base, value, scarcity: sc.score, need, run };
    const score =
      100 *
      (WEIGHTS.base * base +
        WEIGHTS.value * value +
        urgency *
          (WEIGHTS.scarcity * sc.score +
            WEIGHTS.need * need +
            WEIGHTS.run * run));

    return {
      player: a.player,
      rank: a.rank,
      tier: a.tier,
      adp: a.adp,
      score: Math.round(score * 10) / 10,
      breakdown,
      goneBeforeNextTurn: goneP,
      tierAlert: sc.alert,
    };
  });

  recs.sort((x, y) => y.score - x.score || x.rank - y.rank);
  return recs;
}
