import { describe, expect, it } from "vitest";
import { cardId } from "../card.js";
import {
  scoreFifteens,
  scoreFlush,
  scoreHand,
  scoreHisHeels,
  scoreNobs,
  scorePairs,
  scoreRuns,
} from "../scoring.js";
import type { Card } from "../card.js";

function c(rank: Card["rank"], suit: Card["suit"]): Card {
  return { id: cardId(rank, suit), rank, suit };
}

describe("scoreFifteens", () => {
  it("scores a simple two-card fifteen", () => {
    const entries = scoreFifteens([c("5", "spades"), c("10", "diamonds")]);
    expect(entries).toHaveLength(1);
    expect(entries[0].points).toBe(2);
  });

  it("scores a four-card fifteen without double-counting smaller subsets", () => {
    const entries = scoreFifteens([c("2", "spades"), c("3", "diamonds"), c("4", "clubs"), c("6", "hearts")]);
    expect(entries).toHaveLength(1);
    expect(entries[0].cards).toHaveLength(4);
  });
});

describe("scorePairs", () => {
  it("scores three of a kind as three pairs (pair royal, 6 points)", () => {
    const entries = scorePairs([c("5", "spades"), c("5", "diamonds"), c("5", "clubs")]);
    expect(entries).toHaveLength(3);
    expect(entries.reduce((s, e) => s + e.points, 0)).toBe(6);
  });

  it("scores four of a kind as six pairs (double pair royal, 12 points)", () => {
    const entries = scorePairs([
      c("5", "spades"),
      c("5", "diamonds"),
      c("5", "clubs"),
      c("5", "hearts"),
    ]);
    expect(entries).toHaveLength(6);
    expect(entries.reduce((s, e) => s + e.points, 0)).toBe(12);
  });
});

describe("scoreRuns", () => {
  it("scores a simple run of three", () => {
    const entries = scoreRuns([c("5", "spades"), c("6", "diamonds"), c("7", "clubs")]);
    expect(entries).toHaveLength(1);
    expect(entries[0].points).toBe(3);
  });

  it("doubles a run when one rank is duplicated", () => {
    const entries = scoreRuns([c("5", "spades"), c("5", "diamonds"), c("6", "clubs"), c("7", "hearts")]);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.points === 3)).toBe(true);
  });

  it("finds no run when ranks aren't consecutive", () => {
    expect(scoreRuns([c("2", "spades"), c("4", "diamonds"), c("6", "clubs")])).toHaveLength(0);
  });
});

describe("scoreFlush", () => {
  const hand = [c("2", "spades"), c("5", "spades"), c("9", "spades"), c("J", "spades")];

  it("scores a 4-card hand flush even without a matching starter", () => {
    const entries = scoreFlush(hand, c("3", "diamonds"), false);
    expect(entries[0].points).toBe(4);
  });

  it("scores 5 when the starter also matches", () => {
    const entries = scoreFlush(hand, c("7", "spades"), false);
    expect(entries[0].points).toBe(5);
  });

  it("scores nothing for a crib flush unless the starter also matches", () => {
    expect(scoreFlush(hand, c("3", "diamonds"), true)).toHaveLength(0);
    expect(scoreFlush(hand, c("7", "spades"), true)[0].points).toBe(5);
  });
});

describe("scoreNobs / scoreHisHeels", () => {
  it("awards nobs only when the held jack matches the starter's suit", () => {
    expect(scoreNobs([c("J", "spades")], c("9", "spades"))[0]?.points).toBe(1);
    expect(scoreNobs([c("J", "diamonds")], c("9", "spades"))).toHaveLength(0);
  });

  it("awards his heels when the starter itself is a jack", () => {
    expect(scoreHisHeels(c("J", "clubs"))[0]?.points).toBe(2);
    expect(scoreHisHeels(c("9", "clubs"))).toHaveLength(0);
  });
});

describe("scoreHand", () => {
  it("scores the classic maximum 29-point hand", () => {
    // 5-5-5-J in hand, starter is the fourth 5 matching the jack's suit for nobs.
    const hand = [c("5", "spades"), c("5", "diamonds"), c("5", "clubs"), c("J", "hearts")];
    const { total } = scoreHand(hand, c("5", "hearts"), false);
    expect(total).toBe(29);
  });

  it("scores a hand with no combinations as zero", () => {
    const hand = [c("2", "spades"), c("4", "diamonds"), c("8", "clubs"), c("K", "hearts")];
    const { total } = scoreHand(hand, c("Q", "diamonds"), false);
    expect(total).toBe(0);
  });
});
