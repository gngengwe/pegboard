import { describe, expect, it } from "vitest";
import { selectCommentary } from "../director.js";
import { emptyCooldowns, emptyMemory } from "../types.js";
import { event, input, NORTH, SOUTH } from "./testHelpers.js";

describe("routine events are silenced", () => {
  it("suppresses a plain, non-scoring, low-count card play", () => {
    const result = selectCommentary(
      input({
        event: event({
          type: "card_played",
          actor: SOUTH,
          points: 0,
          runningCount: 18,
          beforeBoard: { northScore: 0, southScore: 0 },
          afterBoard: { northScore: 0, southScore: 0 },
        }),
      })
    );
    expect(result.suppressed).toBe(true);
    expect(result.suppressionReason).toBe("routine_event");
    expect(result.primary).toBeUndefined();
  });

  it("still voices a non-scoring play once the count gets tight, via PBP-09", () => {
    const result = selectCommentary(
      input({
        event: event({ type: "card_played", actor: NORTH, points: 0, runningCount: 27 }),
      })
    );
    expect(result.suppressed).toBe(false);
    expect(result.primary?.familyId).toBe("PBP-09");
  });

  it("upgrades a silent play to ARC-04 when it forces an immediate go", () => {
    const result = selectCommentary(
      input({
        event: event({
          type: "card_played",
          actor: NORTH,
          points: 0,
          runningCount: 19,
          revealedFacts: ["followed_by_go"],
        }),
      })
    );
    expect(result.suppressed).toBe(false);
    expect(result.primary?.familyId).toBe("ARC-04");
  });
});

describe("at most one color follow-up ever attaches, and priority order is honored", () => {
  it("prefers the exact board consequence (BX-01) over the strategic objective (ARC-11) when both conditions hold", () => {
    // A run of 5 for South changes the lead (110 -> 113 crosses North's 110)
    // AND leaves both players within 11/8 of the 121 target — ARC-11's
    // objective condition (nearest <= 10) and BX-01's lead-change condition
    // are both true, but neither is within the finish-line intensity-escalation
    // zone (<= 5), so this stays at intensity 3 and color is still considered.
    const result = selectCommentary(
      input({
        event: event({
          type: "card_played",
          actor: SOUTH,
          points: 5,
          scoringType: "run",
          beforeBoard: { northScore: 110, southScore: 108 },
          afterBoard: { northScore: 110, southScore: 113 },
        }),
      })
    );
    expect(result.primary?.intensity).toBe(3);
    expect(result.followUp).toBeDefined();
    expect(result.followUp?.familyId).toBe("BX-01");
    expect(result.followUp?.familyId).not.toBe("ARC-11");
  });
});

describe("intensity-4 PBP gets breathing room", () => {
  it("a pegging double pair royal (intensity 4, non-ceremonial context) gets no ordinary color follow-up", () => {
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
    expect(result.primary?.intensity).toBe(4);
    expect(result.followUp).toBeUndefined();
  });

  it("a rare counted hand (intensity 4) DOES get the ceremonial CLR-40 follow-up", () => {
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
    expect(result.primary?.intensity).toBe(4);
    expect(result.followUp?.familyId).toBe("CLR-40");
  });

  it("a match-ending win gets the BX-12 closing thought, not silence", () => {
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
    expect(result.followUp?.familyId).toBe("BX-12");
    expect(result.followUp?.line).toContain("121");
  });
});

describe("cooldowns prevent immediate repetition", () => {
  // Ordinary distinct scoring calls (two separate pairs, two separate
  // fifteens) do NOT cool down — each is independently newsworthy. Cooldowns
  // exist for families that would get repetitive if voiced every time, like
  // ARC-04's "slams the door on that count" door-slam call.
  it("suppresses the same door-slam family firing twice in a row within its cooldown window", () => {
    let memory = emptyMemory();
    let cooldowns = emptyCooldowns();

    const first = selectCommentary(
      input({
        event: event({
          type: "card_played",
          actor: SOUTH,
          points: 0,
          runningCount: 20,
          revealedFacts: ["followed_by_go"],
        }),
        memory,
        cooldowns,
      })
    );
    expect(first.suppressed).toBe(false);
    expect(first.primary?.familyId).toBe("ARC-04");
    memory = first.nextMemory;
    cooldowns = first.nextCooldowns;

    const second = selectCommentary(
      input({
        event: event({
          id: "e2",
          type: "card_played",
          actor: NORTH,
          points: 0,
          runningCount: 22,
          revealedFacts: ["followed_by_go"],
        }),
        memory,
        cooldowns,
      })
    );
    expect(second.suppressed).toBe(true);
    expect(second.suppressionReason).toBe("cooldown");
  });
});

describe("mode gating", () => {
  it("minimal mode still calls ordinary scores but never attaches color", () => {
    const result = selectCommentary(
      input(
        {
          event: event({
            type: "card_played",
            actor: SOUTH,
            points: 2,
            scoringType: "fifteen",
            beforeBoard: { northScore: 100, southScore: 99 },
            afterBoard: { northScore: 100, southScore: 101 },
          }),
        },
        "minimal"
      )
    );
    expect(result.primary?.familyId).toBe("PBP-10");
    expect(result.followUp).toBeUndefined();
  });

  it("quiet mode suppresses an ordinary fifteen entirely", () => {
    const result = selectCommentary(
      input(
        {
          event: event({ type: "card_played", actor: SOUTH, points: 2, scoringType: "fifteen" }),
        },
        "quiet"
      )
    );
    expect(result.suppressed).toBe(true);
    expect(result.suppressionReason).toBe("mode_density");
  });

  it("quiet mode still calls a win", () => {
    const result = selectCommentary(
      input(
        {
          event: event({
            type: "game_won",
            actor: NORTH,
            points: 8,
            scoringType: "win",
            beforeBoard: { northScore: 115, southScore: 100 },
            afterBoard: { northScore: 123, southScore: 100 },
          }),
        },
        "quiet"
      )
    );
    expect(result.suppressed).toBe(false);
    expect(result.primary?.familyId).toBe("PBP-40");
  });

  it("the same fifteen reads differently across modes", () => {
    const build = (mode: Parameters<typeof input>[1]) =>
      selectCommentary(
        input(
          {
            event: event({
              type: "card_played",
              actor: SOUTH,
              points: 2,
              scoringType: "fifteen",
              beforeBoard: { northScore: 0, southScore: 0 },
              afterBoard: { northScore: 0, southScore: 2 },
            }),
          },
          mode
        )
      );

    const broadcastLine = build("broadcast").primary?.line;
    const arcadeLine = build("arcade").primary?.line;
    const learnLine = build("learn").primary?.line;

    expect(broadcastLine).not.toBe(arcadeLine);
    expect(broadcastLine).not.toBe(learnLine);
    expect(arcadeLine).not.toBe(learnLine);
  });
});
