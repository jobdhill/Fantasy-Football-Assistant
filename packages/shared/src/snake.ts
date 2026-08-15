import type { RosterSlots } from './types';

export function totalRounds(roster: RosterSlots): number {
  return roster.QB + roster.RB + roster.WR + roster.TE + roster.FLEX + roster.DST + roster.K + roster.BENCH;
}

export function roundOfPick(overall: number, teams: number): number {
  return Math.ceil(overall / teams);
}

/** Which team slot (1-indexed) makes the given overall pick in a snake draft. */
export function slotForPick(overall: number, teams: number): number {
  const round = roundOfPick(overall, teams);
  const indexInRound = overall - (round - 1) * teams;
  return round % 2 === 1 ? indexInRound : teams - indexInRound + 1;
}

/** First overall pick >= fromOverall belonging to the given slot. */
export function nextPickForSlot(fromOverall: number, slot: number, teams: number): number {
  for (let p = fromOverall; p < fromOverall + teams * 2; p++) {
    if (slotForPick(p, teams) === slot) return p;
  }
  throw new Error('unreachable: a slot always picks within two rounds');
}

/** How many picks happen before the given slot is on the clock (0 = on the clock now). */
export function picksUntilTurn(currentOverall: number, slot: number, teams: number): number {
  return nextPickForSlot(currentOverall, slot, teams) - currentOverall;
}
