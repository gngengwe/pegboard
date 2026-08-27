import { type Card, pipValue, rankValue } from "./card.js";
import type { ScoreEntry } from "./scoring.js";

/**
 * Scores the card just appended to `stack` (the cards played in the current
 * segment, in play order, regardless of which seat played them). Call this
 * once per play, before checking for a 31/go segment reset.
 */
export function scorePeggingPlay(stack: readonly Card[]): ScoreEntry[] {
  if (stack.length === 0) return [];
  const entries: ScoreEntry[] = [];
  const total = stack.reduce((sum, c) => sum + pipValue(c.rank), 0);

  if (total === 15) {
    entries.push({ type: "fifteen", points: 2, cards: [...stack], label: "Fifteen for two" });
  }
  if (total === 31) {
    entries.push({ type: "fifteen", points: 2, cards: [...stack], label: "Thirty-one for two" });
  }

  const last = stack[stack.length - 1];
  let matchCount = 1;
  for (let i = stack.length - 2; i >= 0; i--) {
    if (stack[i].rank === last.rank) matchCount++;
    else break;
  }
  if (matchCount >= 2) {
    const cards = stack.slice(stack.length - matchCount);
    const points = matchCount * (matchCount - 1);
    const label =
      matchCount === 2 ? "Pair for two" : matchCount === 3 ? "Pair royal for six" : "Double pair royal for twelve";
    entries.push({ type: "pair", points, cards, label });
  }

  for (let k = Math.min(stack.length, 7); k >= 3; k--) {
    const trailing = stack.slice(stack.length - k);
    const values = trailing.map((c) => rankValue(c.rank)).sort((a, b) => a - b);
    const distinct = new Set(values).size === values.length;
    const consecutive = distinct && values[values.length - 1] - values[0] === k - 1;
    if (consecutive) {
      entries.push({ type: "run", points: k, cards: trailing, label: `Run of ${k}` });
      break;
    }
  }

  return entries;
}

export function peggingTotal(stack: readonly Card[]): number {
  return stack.reduce((sum, c) => sum + pipValue(c.rank), 0);
}

export function canPlay(card: Card, runningCount: number): boolean {
  return runningCount + pipValue(card.rank) <= 31;
}
