import { describe, expect, it } from 'vitest';
import { nextPickForSlot, picksUntilTurn, roundOfPick, slotForPick, totalRounds } from './snake';
import { DEFAULT_SETTINGS } from './types';

describe('slotForPick', () => {
  it('goes 1..N in odd rounds and N..1 in even rounds', () => {
    expect(slotForPick(1, 12)).toBe(1);
    expect(slotForPick(12, 12)).toBe(12);
    expect(slotForPick(13, 12)).toBe(12);
    expect(slotForPick(24, 12)).toBe(1);
    expect(slotForPick(25, 12)).toBe(1);
    expect(slotForPick(26, 12)).toBe(2);
  });

  it('works for 10-team leagues', () => {
    expect(slotForPick(10, 10)).toBe(10);
    expect(slotForPick(11, 10)).toBe(10);
    expect(slotForPick(15, 10)).toBe(6);
  });
});

describe('picksUntilTurn', () => {
  it('is 0 when on the clock', () => {
    expect(picksUntilTurn(5, 5, 12)).toBe(0);
  });

  it('counts picks before my turn in the same round', () => {
    expect(picksUntilTurn(1, 5, 12)).toBe(4);
  });

  it('handles the snake turn (slot 12 picks back-to-back)', () => {
    expect(picksUntilTurn(12, 12, 12)).toBe(0);
    expect(picksUntilTurn(13, 12, 12)).toBe(0);
    expect(picksUntilTurn(14, 12, 12)).toBe(22);
  });

  it('handles slot 1 wraparound gap of two full rounds', () => {
    expect(picksUntilTurn(2, 1, 12)).toBe(22);
  });
});

describe('nextPickForSlot', () => {
  it('finds the slot’s next pick across the snake turn', () => {
    expect(nextPickForSlot(1, 3, 12)).toBe(3);
    expect(nextPickForSlot(4, 3, 12)).toBe(22);
  });
});

describe('totalRounds', () => {
  it('sums all roster slots', () => {
    expect(totalRounds(DEFAULT_SETTINGS.roster)).toBe(15);
  });
});

describe('roundOfPick', () => {
  it('is 1-indexed', () => {
    expect(roundOfPick(1, 12)).toBe(1);
    expect(roundOfPick(12, 12)).toBe(1);
    expect(roundOfPick(13, 12)).toBe(2);
  });
});
