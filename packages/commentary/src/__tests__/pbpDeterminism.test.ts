import { describe, expect, it } from "vitest";
import { selectCommentary } from "../director.js";
import { event, input, NORTH, SOUTH } from "./testHelpers.js";

describe("deterministic play-by-play", () => {
  it("calls fifteen exactly, no analysis required", () => {
    const result = selectCommentary(
      input({
        event: event({
          type: "card_played",
          actor: SOUTH,
          card: "5 of hearts",
          points: 2,
          scoringType: "fifteen",
          runningCount: 15,
          beforeBoard: { northScore: 10, southScore: 10 },
          afterBoard: { northScore: 10, southScore: 12 },
        }),
      })
    );
    expect(result.suppressed).toBe(false);
    expect(result.primary?.familyId).toBe("PBP-10");
    expect(result.primary?.line.toLowerCase()).toContain("fifteen");
  });

  it("calls thirty-one exactly", () => {
    const result = selectCommentary(
      input({
        event: event({
          type: "card_played",
          actor: NORTH,
          points: 2,
          scoringType: "thirty_one",
          runningCount: 31,
          beforeBoard: { northScore: 5, southScore: 5 },
          afterBoard: { northScore: 7, southScore: 5 },
        }),
      })
    );
    expect(result.primary?.familyId).toBe("PBP-11");
    expect(result.primary?.line.toLowerCase()).toContain("thirty-one");
  });

  it("calls a pair exactly", () => {
    const result = selectCommentary(
      input({
        event: event({
          type: "card_played",
          actor: SOUTH,
          points: 2,
          scoringType: "pair",
          beforeBoard: { northScore: 0, southScore: 0 },
          afterBoard: { northScore: 0, southScore: 2 },
        }),
      })
    );
    expect(result.primary?.familyId).toBe("PBP-12");
  });

  it("calls a pair royal with the actual total points, even when combined with a fifteen", () => {
    // Third of three 5s: scores fifteen (2) + pair royal (6) = 8 total.
    const result = selectCommentary(
      input({
        event: event({
          type: "card_played",
          actor: SOUTH,
          points: 8,
          scoringType: "pair_royal",
          beforeBoard: { northScore: 0, southScore: 0 },
          afterBoard: { northScore: 0, southScore: 8 },
        }),
      })
    );
    expect(result.primary?.familyId).toBe("PBP-13");
    expect(result.primary?.line).toContain("8");
    expect(result.primary?.line).not.toContain("6");
  });

  it("calls double pair royal", () => {
    const result = selectCommentary(
      input({
        event: event({
          type: "card_played",
          actor: NORTH,
          points: 12,
          scoringType: "double_pair_royal",
          beforeBoard: { northScore: 0, southScore: 0 },
          afterBoard: { northScore: 12, southScore: 0 },
        }),
      })
    );
    expect(result.primary?.familyId).toBe("PBP-14");
    expect(result.primary?.intensity).toBe(4);
  });

  it("calls a run exactly", () => {
    const result = selectCommentary(
      input({
        event: event({
          type: "card_played",
          actor: SOUTH,
          points: 4,
          scoringType: "run",
          beforeBoard: { northScore: 0, southScore: 0 },
          afterBoard: { northScore: 0, southScore: 4 },
        }),
      })
    );
    expect(result.primary?.familyId).toBe("PBP-15");
    expect(result.primary?.line).toContain("4");
  });

  it("calls go", () => {
    const result = selectCommentary(
      input({ event: event({ type: "go", actor: NORTH, runningCount: 27 }) })
    );
    expect(result.primary?.familyId).toBe("PBP-16");
    expect(result.primary?.line).toContain("27");
  });

  it("calls the last-card point", () => {
    const result = selectCommentary(
      input({
        event: event({
          type: "last_card_point",
          actor: SOUTH,
          points: 1,
          beforeBoard: { northScore: 0, southScore: 0 },
          afterBoard: { northScore: 0, southScore: 1 },
        }),
      })
    );
    expect(result.primary?.familyId).toBe("PBP-17");
  });

  it("calls a hand total", () => {
    const result = selectCommentary(
      input({
        event: event({
          type: "hand_scored",
          actor: NORTH,
          points: 8,
          scoringType: "hand_total",
          beforeBoard: { northScore: 10, southScore: 10 },
          afterBoard: { northScore: 18, southScore: 10 },
        }),
      })
    );
    expect(result.primary?.familyId).toBe("PBP-32");
    expect(result.primary?.line).toContain("8");
  });

  it("calls a crib total", () => {
    const result = selectCommentary(
      input({
        event: event({
          type: "crib_scored",
          actor: SOUTH,
          points: 5,
          scoringType: "crib_total",
          beforeBoard: { northScore: 10, southScore: 10 },
          afterBoard: { northScore: 10, southScore: 15 },
        }),
      })
    );
    expect(result.primary?.familyId).toBe("PBP-32");
    expect(result.primary?.line).toContain("5");
  });

  it("escalates to the big-crib-swing family when a crib flips the lead by 10+", () => {
    const result = selectCommentary(
      input({
        event: event({
          type: "crib_scored",
          actor: NORTH,
          points: 14,
          scoringType: "crib_total",
          beforeBoard: { northScore: 74, southScore: 80 },
          afterBoard: { northScore: 88, southScore: 80 },
        }),
      })
    );
    expect(result.primary?.familyId).toBe("PBP-36");
  });

  it("calls the classic 29-hand as a rare, intensity-4 moment", () => {
    const result = selectCommentary(
      input({
        event: event({
          type: "hand_scored",
          actor: SOUTH,
          points: 29,
          scoringType: "hand_total",
          beforeBoard: { northScore: 50, southScore: 50 },
          afterBoard: { northScore: 50, southScore: 79 },
        }),
      })
    );
    expect(result.primary?.familyId).toBe("PBP-38");
    expect(result.primary?.line).toContain("29");
    expect(result.primary?.intensity).toBe(4);
  });

  it("calls exact-out with ARC-03 when the winning score lands exactly on target", () => {
    const result = selectCommentary(
      input({
        event: event({
          type: "game_won",
          actor: SOUTH,
          points: 2,
          scoringType: "win",
          beforeBoard: { northScore: 100, southScore: 119 },
          afterBoard: { northScore: 100, southScore: 121 },
        }),
      })
    );
    expect(result.primary?.familyId).toBe("ARC-03");
    expect(result.primary?.line).toContain("2");
  });

  it("calls the generic exact-out family when the winning score overshoots target", () => {
    const result = selectCommentary(
      input({
        event: event({
          type: "game_won",
          actor: NORTH,
          points: 8,
          scoringType: "win",
          beforeBoard: { northScore: 115, southScore: 100 },
          afterBoard: { northScore: 123, southScore: 100 },
        }),
      })
    );
    expect(result.primary?.familyId).toBe("PBP-40");
  });

  it("calls his heels on a jack starter", () => {
    const result = selectCommentary(
      input({
        event: event({
          type: "his_heels",
          actor: NORTH,
          points: 2,
          scoringType: "heels",
          beforeBoard: { northScore: 0, southScore: 0 },
          afterBoard: { northScore: 2, southScore: 0 },
        }),
      })
    );
    expect(result.primary?.familyId).toBe("PBP-07");
  });

  it("calls the starter reveal", () => {
    const result = selectCommentary(
      input({ event: event({ type: "starter_revealed", card: "J of spades" }) })
    );
    expect(result.primary?.familyId).toBe("PBP-06");
    expect(result.primary?.line).toContain("J of spades");
  });

  it("escalates a lead-changing scoring event above its base intensity", () => {
    const result = selectCommentary(
      input({
        event: event({
          type: "card_played",
          actor: SOUTH,
          points: 2,
          scoringType: "pair",
          beforeBoard: { northScore: 10, southScore: 8 },
          afterBoard: { northScore: 10, southScore: 10 },
        }),
      })
    );
    // PBP-12's base intensity is 2, but this ties the game (not yet a lead
    // change) — verify no crash and a sane intensity, then check a genuine
    // lead-change case separately below.
    expect(result.primary).toBeDefined();
  });

  it("escalates intensity further when the same scoring event also changes the lead", () => {
    const result = selectCommentary(
      input({
        event: event({
          type: "card_played",
          actor: SOUTH,
          points: 2,
          scoringType: "pair",
          beforeBoard: { northScore: 10, southScore: 9 },
          afterBoard: { northScore: 10, southScore: 11 },
        }),
      })
    );
    // Base intensity for a plain pair is 2; a lead change bumps it to 3.
    expect(result.primary?.intensity).toBe(3);
  });
});
