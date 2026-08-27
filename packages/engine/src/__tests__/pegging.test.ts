import { describe, expect, it } from "vitest";
import { cardId } from "../card.js";
import { canPlay, peggingTotal, scorePeggingPlay } from "../pegging.js";
import type { Card } from "../card.js";

function c(rank: Card["rank"], suit: Card["suit"]): Card {
  return { id: cardId(rank, suit), rank, suit };
}

describe("scorePeggingPlay", () => {
  it("scores fifteen-for-two", () => {
    const entries = scorePeggingPlay([c("5", "spades"), c("10", "diamonds")]);
    expect(entries.reduce((s, e) => s + e.points, 0)).toBe(2);
    expect(entries[0].label).toMatch(/fifteen/i);
  });

  it("scores a pair", () => {
    const entries = scorePeggingPlay([c("5", "spades"), c("5", "diamonds")]);
    expect(entries.find((e) => e.type === "pair")?.points).toBe(2);
  });

  it("scores a pair royal alongside a fifteen when both land on the same card", () => {
    // 5 + 5 + 5 = 15 (fifteen-for-two) AND the third five completes a pair royal (six).
    const entries = scorePeggingPlay([c("5", "spades"), c("5", "diamonds"), c("5", "clubs")]);
    const total = entries.reduce((s, e) => s + e.points, 0);
    expect(total).toBe(8);
    expect(entries.some((e) => e.type === "pair" && e.points === 6)).toBe(true);
  });

  it("scores double pair royal for twelve", () => {
    const entries = scorePeggingPlay([c("2", "spades"), c("2", "diamonds"), c("2", "clubs"), c("2", "hearts")]);
    expect(entries.find((e) => e.type === "pair")?.points).toBe(12);
  });

  it("scores a run regardless of the order the cards were played in", () => {
    const entries = scorePeggingPlay([c("5", "spades"), c("7", "diamonds"), c("6", "clubs")]);
    expect(entries.find((e) => e.type === "run")?.points).toBe(3);
  });

  it("scores thirty-one-for-two and stops crediting a run across mismatched ranks", () => {
    const entries = scorePeggingPlay([c("K", "spades"), c("K", "diamonds"), c("K", "clubs"), c("A", "hearts")]);
    expect(entries.reduce((s, e) => s + e.points, 0)).toBe(2);
    expect(entries[0].label).toMatch(/thirty-one/i);
  });
});

describe("canPlay / peggingTotal", () => {
  it("blocks a card that would push the count past 31", () => {
    expect(canPlay(c("K", "spades"), 25)).toBe(false);
    expect(canPlay(c("6", "spades"), 25)).toBe(true);
  });

  it("sums pip values for the running count", () => {
    expect(peggingTotal([c("5", "spades"), c("K", "diamonds")])).toBe(15);
  });
});
