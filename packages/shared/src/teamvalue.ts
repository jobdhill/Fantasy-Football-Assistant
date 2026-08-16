import { roundOfPick, totalRounds } from './snake';
import { POSITIONS, type LeagueSettings, type Position } from './types';

/**
 * Positional value balance: how much draft capital my roster is actually
 * worth at each position versus what a balanced team would have invested by
 * this point of the draft. Value comes from a player's *market* cost (ADP),
 * not the pick spent on him — two late-ADP RBs are a thin room no matter how
 * early they were taken.
 */

export type BalanceStatus = 'SET' | 'OK' | 'NEED' | 'OVER';

export interface RosteredPlayerValue {
  position: Position;
  /** market draft cost of the player — ADP preferred, board rank as fallback */
  anchor: number;
}

export interface TeamBalanceInput {
  players: RosteredPlayerValue[];
  /** overall pick numbers I have already used */
  myPickOveralls: number[];
  settings: LeagueSettings;
  /** the overall pick currently on the clock (1-indexed) */
  currentOverall: number;
}

export interface PositionBalance {
  position: Position;
  /** market value of my players at this position */
  value: number;
  /** value a balanced roster would have invested here by this point */
  target: number;
  /** value / target; null while the target is still ~zero (e.g. K in round 3) */
  pct: number | null;
  status: BalanceStatus;
  /** dedicated starting slots at the position are filled (flex not counted) */
  startersFilled: boolean;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * Market value of an overall draft slot. Steep at the top, long tail late:
 * pick 1 ≈ 100, pick 24 ≈ 66, pick 60 ≈ 34, pick 120 ≈ 11, pick 180 ≈ 4.
 */
export function pickValue(overall: number): number {
  return 100 * Math.exp(-(overall - 1) / 55);
}

/** relative draft capital a typical roster spends per starting slot */
const SLOT_WEIGHT: Record<Position, number> = {
  QB: 1.0, RB: 1.55, WR: 1.45, TE: 0.85, DST: 0.22, K: 0.18,
};
/** how the flex slot's capital typically splits across eligible positions */
const FLEX_WEIGHT: Partial<Record<Position, number>> = { RB: 0.55, WR: 0.55, TE: 0.15 };

/** Fraction of total draft capital a balanced team invests per position. */
export function positionShares(settings: LeagueSettings): Record<Position, number> {
  const { roster } = settings;
  const weights = {} as Record<Position, number>;
  for (const pos of POSITIONS) {
    weights[pos] = SLOT_WEIGHT[pos] * roster[pos] + roster.FLEX * (FLEX_WEIGHT[pos] ?? 0);
  }
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  for (const pos of POSITIONS) weights[pos] /= total;
  return weights;
}

/**
 * How much of a position's final share a balanced team has typically invested
 * by the given round. RB/WR capital flows from pick one; QB/TE ramps through
 * the middle rounds; DST/K arrive at the end. Targets scale by this so an
 * empty QB slot in round 2 isn't a "need" and an empty K slot never is until
 * the closing rounds.
 */
function paceFactor(pos: Position, round: number, rounds: number): number {
  if (pos === 'DST' || pos === 'K') return clamp01((round - rounds * 0.75) / (rounds * 0.2));
  if (pos === 'QB' || pos === 'TE') return clamp01(round / (rounds * 0.6));
  return 1;
}

export function teamBalance(input: TeamBalanceInput): PositionBalance[] {
  const { settings } = input;
  const round = roundOfPick(input.currentOverall, settings.teams);
  const rounds = totalRounds(settings.roster);
  const shares = positionShares(settings);
  const spent = input.myPickOveralls.reduce((sum, p) => sum + pickValue(p), 0);

  const dedicated: Record<Position, number> = {
    QB: settings.roster.QB, RB: settings.roster.RB, WR: settings.roster.WR,
    TE: settings.roster.TE, DST: settings.roster.DST, K: settings.roster.K,
  };

  return POSITIONS.map((pos): PositionBalance => {
    const mine = input.players.filter((p) => p.position === pos);
    const value = mine.reduce((sum, p) => sum + pickValue(p.anchor), 0);
    const pace = paceFactor(pos, round, rounds);
    const target = shares[pos] * spent * pace;
    const startersFilled = mine.length >= dedicated[pos];
    const pct = target >= 1 ? value / target : null;

    let status: BalanceStatus;
    if (pct != null && round >= 2 && pace >= 0.5 && pct < 0.55) {
      // Under-capitalized once the position should have real investment —
      // catches both an empty slot and a room full of market bargains.
      status = 'NEED';
    } else if (pct != null && pct >= 1.5 && mine.length > dedicated[pos]) {
      // Over-invested only counts when surplus bodies are hoarding capital;
      // one elite starter at a onesie position is SET, not a problem.
      status = 'OVER';
    } else if (startersFilled && (pct == null || pct >= 0.8)) {
      status = 'SET';
    } else {
      status = 'OK';
    }

    return { position: pos, value, target, pct, status, startersFilled };
  });
}
