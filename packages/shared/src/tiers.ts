/**
 * Automatic tiering from gaps in draft-cost data.
 *
 * A tier break belongs wherever the market's opinion jumps: the ADP distance
 * between two adjacent players is much larger than the distance typical of that
 * stretch of the board. Gaps grow naturally as ADP climbs (picks 1-2 sit closer
 * together than picks 100-101), so a single absolute threshold would carve the
 * early rounds into slivers and never split the late ones. The threshold is
 * therefore relative to a local baseline.
 */

export interface TierablePlayer {
  id: string;
  /** draft cost used for gap detection — ADP preferred, board rank as fallback */
  value: number;
}

/**
 * True when a series carries real draft-cost spacing rather than being a rank
 * list wearing an ADP label. Some providers publish a dense 1,2,3,… sequence in
 * their ADP column; those have no gaps to find, so tiering on them yields one
 * giant tier. A genuine ADP series has fractional values and uneven steps.
 */
export function hasUsableSpread(values: number[]): boolean {
  if (values.length < 3) return false;
  const sorted = [...values].sort((a, b) => a - b);
  // Real ADP is an average of many drafts, so most values carry decimals.
  const fractional = sorted.filter((v) => Math.abs(v - Math.round(v)) > 1e-6).length;
  if (fractional / sorted.length >= 0.2) return true;

  // Whole numbers only: this is a rank list unless the steps genuinely vary.
  // A dense sequence still shows the odd 2 where a player is missing, so ask
  // whether a single step size dominates rather than whether any step differs.
  const steps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const d = Math.round(sorted[i] - sorted[i - 1]);
    if (d > 0) steps.push(d);
  }
  if (steps.length === 0) return false;
  const counts = new Map<number, number>();
  for (const d of steps) counts.set(d, (counts.get(d) ?? 0) + 1);
  const dominant = Math.max(...counts.values());
  return dominant / steps.length < 0.8;
}

export interface AutoTierOptions {
  /**
   * A gap breaks a tier when it exceeds this multiple of the local median gap.
   * Higher = fewer, broader tiers.
   */
  sensitivity?: number;
  /** how many neighbouring gaps form the local baseline */
  window?: number;
  /** never emit more than this many tiers */
  maxTiers?: number;
  /** never start a new tier before a tier has at least this many players */
  minTierSize?: number;
}

const DEFAULTS = {
  sensitivity: 1.9,
  window: 12,
  maxTiers: 9,
  minTierSize: 2,
} satisfies Required<AutoTierOptions>;

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Returns the ids that should begin a new tier, given players already in board
 * order. The first id is never included: it starts tier 1 implicitly.
 */
export function autoTierStarts(
  players: TierablePlayer[],
  options: AutoTierOptions = {},
): string[] {
  const { sensitivity, window, maxTiers, minTierSize } = { ...DEFAULTS, ...options };
  if (players.length < 2) return [];

  // Gap i is the distance between player i and player i+1.
  const gaps = players.slice(1).map((p, i) => Math.max(0, p.value - players[i].value));
  const positive = gaps.filter((g) => g > 0);
  if (positive.length === 0) return [];

  // Fall back to the global median where the local window is degenerate (all
  // ties), so a flat stretch can't manufacture breaks out of rounding noise.
  const globalMedian = median(positive) || 1;

  const scored = gaps.map((gap, i) => {
    const from = Math.max(0, i - window);
    const local = gaps.slice(from, i + window + 1).filter((g) => g > 0);
    const baseline = median(local) || globalMedian;
    return { index: i, gap, ratio: gap / baseline };
  });

  // Take the most decisive gaps first so a tier budget spends itself on the
  // clearest cliffs rather than whichever happens to come first on the board.
  // Weight earlier gaps up: tier calls matter most where the draft is actually
  // contested, and without this a deep-bench cliff can outbid a round-2 one and
  // leave the top of the board lumped together.
  const candidates = scored
    .filter((s) => s.ratio >= sensitivity)
    .map((s) => ({ ...s, weight: s.ratio * (1 + (players.length - s.index) / players.length) }))
    .sort((a, b) => b.weight - a.weight || a.index - b.index);

  const breaks: number[] = [];
  for (const c of candidates) {
    if (breaks.length >= maxTiers - 1) break;
    // Player index c.index + 1 begins the new tier.
    const start = c.index + 1;
    if (start < minTierSize || players.length - start < minTierSize) continue;
    if (breaks.some((b) => Math.abs(b - start) < minTierSize)) continue;
    breaks.push(start);
  }

  return breaks.sort((a, b) => a - b).map((i) => players[i].id);
}
