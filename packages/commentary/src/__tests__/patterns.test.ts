import { describe, expect, it } from "vitest";
import { activationWording, findPattern, updatePatterns } from "../patterns.js";
import type { PlayerPattern, PublicCommentaryEvent } from "../types.js";

function countControlEvent(id: string, actor: "north" | "south", count: number): PublicCommentaryEvent {
  return {
    id,
    type: "card_played",
    actor,
    points: 0,
    runningCount: count,
    beforeBoard: { northScore: 0, southScore: 0 },
    afterBoard: { northScore: 0, southScore: 0 },
    revealedFacts: [],
  };
}

describe("pegging_count_control evidence accumulation", () => {
  it("reports no tendency below two observations", () => {
    let patterns = updatePatterns([], countControlEvent("e1", "south", 12), "t");
    const pattern = findPattern(patterns, "pegging_count_control", "south");
    expect(activationWording(pattern)).toBe("none");
  });

  it("permits soft wording (`has leaned`) at 2-4 fresh matching events", () => {
    let patterns: readonly PlayerPattern[] = [];
    patterns = updatePatterns(patterns, countControlEvent("e1", "south", 10), "t");
    patterns = updatePatterns(patterns, countControlEvent("e2", "south", 14), "t");
    const pattern = findPattern(patterns, "pegging_count_control", "south");
    expect(activationWording(pattern)).toBe("soft");
  });

  it("permits strong wording (`has been the pattern`) at 5+ consistent, high-confidence events", () => {
    let patterns = updatePatterns([], countControlEvent("e1", "south", 10), "t");
    for (let i = 2; i <= 5; i++) {
      patterns = updatePatterns(patterns, countControlEvent(`e${i}`, "south", 10 + i), "t");
    }
    const pattern = findPattern(patterns, "pegging_count_control", "south");
    expect(pattern?.sampleSize).toBe(5);
    expect(activationWording(pattern)).toBe("strong");
  });

  it("does not accumulate evidence from a scoring play (not a count-control signal)", () => {
    const scoringEvent: PublicCommentaryEvent = {
      id: "e1",
      type: "card_played",
      actor: "south",
      points: 2,
      runningCount: 15,
      beforeBoard: { northScore: 0, southScore: 0 },
      afterBoard: { northScore: 0, southScore: 2 },
      revealedFacts: [],
    };
    const patterns = updatePatterns([], scoringEvent, "t");
    expect(findPattern(patterns, "pegging_count_control", "south")).toBeUndefined();
  });

  it("does not accumulate evidence once the count is past the safe ceiling", () => {
    const patterns = updatePatterns([], countControlEvent("e1", "south", 25), "t");
    expect(findPattern(patterns, "pegging_count_control", "south")).toBeUndefined();
  });
});

describe("comeback_pegging evidence", () => {
  it("only records evidence when the actor is actually trailing at the time", () => {
    const trailingScorer: PublicCommentaryEvent = {
      id: "e1",
      type: "card_played",
      actor: "south",
      points: 2,
      beforeBoard: { northScore: 50, southScore: 30 },
      afterBoard: { northScore: 50, southScore: 32 },
      revealedFacts: [],
    };
    const leadingScorer: PublicCommentaryEvent = {
      id: "e2",
      type: "card_played",
      actor: "north",
      points: 2,
      beforeBoard: { northScore: 50, southScore: 30 },
      afterBoard: { northScore: 52, southScore: 30 },
      revealedFacts: [],
    };
    let patterns = updatePatterns([], trailingScorer, "t");
    patterns = updatePatterns(patterns, leadingScorer, "t");
    expect(findPattern(patterns, "comeback_pegging", "south")).toBeDefined();
    expect(findPattern(patterns, "comeback_pegging", "north")).toBeUndefined();
  });
});

describe("activationWording suppression rules", () => {
  it("suppresses low-confidence patterns even with several samples", () => {
    const wording = activationWording({
      patternId: "go_management",
      subject: "north",
      evidenceEventIds: ["a", "b", "c"],
      supportingExamples: [],
      contradictingEventIds: [],
      sampleSize: 3,
      confidence: "low",
      scope: "match",
      lastObservedAt: "t",
      visibleToAudience: true,
    });
    expect(wording).toBe("none");
  });

  it("suppresses when counterevidence outweighs evidence", () => {
    const wording = activationWording({
      patternId: "go_management",
      subject: "north",
      evidenceEventIds: ["a", "b", "c"],
      supportingExamples: [],
      contradictingEventIds: ["x", "y", "z", "w"],
      sampleSize: 3,
      confidence: "medium",
      scope: "match",
      lastObservedAt: "t",
      visibleToAudience: true,
    });
    expect(wording).toBe("none");
  });

  it("returns none for an undefined pattern (never observed)", () => {
    expect(activationWording(undefined)).toBe("none");
  });
});
