import { describe, expect, it } from "vitest";
import { updateThreads } from "../threads.js";
import { board, event } from "./testHelpers.js";
import type { NarrativeThread, PublicCommentaryEvent, Seat } from "../types.js";

/** Small harness so each test can thread `peakDeficit` through a call sequence naturally. */
function run(
  steps: { event: PublicCommentaryEvent; board: ReturnType<typeof board> }[]
): { threads: readonly NarrativeThread[]; peakDeficit: Readonly<Partial<Record<Seat, number>>> } {
  let threads: readonly NarrativeThread[] = [];
  let peakDeficit: Readonly<Partial<Record<Seat, number>>> = {};
  for (const step of steps) {
    const result = updateThreads(threads, step.event, step.board, peakDeficit);
    threads = result.threads;
    peakDeficit = result.peakDeficit;
  }
  return { threads, peakDeficit };
}

describe("comeback thread", () => {
  it("does not start on a small deficit", () => {
    const { threads } = run([{ event: event(), board: board({ northScore: 5, southScore: 2 }) }]);
    expect(threads.find((t) => t.id === "comeback")).toBeUndefined();
  });

  it("starts once a 10+ point deficit has been cut by at least 5", () => {
    // South was down 15 (peak, recorded even though no thread starts yet),
    // then cuts it to 8 — a reduction of 7, clearing both bars.
    const { threads } = run([
      { event: event({ id: "e1" }), board: board({ northScore: 40, southScore: 25 }) },
      { event: event({ id: "e2" }), board: board({ northScore: 40, southScore: 32 }) },
    ]);
    const comeback = threads.find((t) => t.id === "comeback");
    expect(comeback).toBeDefined();
    expect(comeback?.subject).toBe("south");
  });

  it("does NOT start on a deficit that was always small (peak never reached 10)", () => {
    const { threads } = run([
      { event: event({ id: "e1" }), board: board({ northScore: 20, southScore: 15 }) }, // deficit 5
      { event: event({ id: "e2" }), board: board({ northScore: 20, southScore: 18 }) }, // deficit 2
    ]);
    expect(threads.find((t) => t.id === "comeback")).toBeUndefined();
  });

  it("expires once the deficit closes to zero", () => {
    const { threads } = run([
      { event: event({ id: "e1" }), board: board({ northScore: 40, southScore: 25 }) },
      { event: event({ id: "e2" }), board: board({ northScore: 40, southScore: 32 }) },
      { event: event({ id: "e3" }), board: board({ northScore: 40, southScore: 40 }) },
    ]);
    expect(threads.find((t) => t.id === "comeback")).toBeUndefined();
  });
});

describe("rare_moment thread", () => {
  it("starts on a double pair royal", () => {
    const rareEvent: PublicCommentaryEvent = event({
      type: "card_played",
      actor: "north",
      scoringType: "double_pair_royal",
      points: 12,
    });
    const { threads } = updateThreads([], rareEvent, board(), {});
    const rare = threads.find((t) => t.id === "rare_moment");
    expect(rare).toBeDefined();
    expect(rare?.subject).toBe("north");
  });

  it("expires on the following event", () => {
    const rareEvent: PublicCommentaryEvent = event({
      id: "e1",
      type: "card_played",
      actor: "north",
      scoringType: "double_pair_royal",
      points: 12,
    });
    const first = updateThreads([], rareEvent, board(), {});
    expect(first.threads.find((t) => t.id === "rare_moment")).toBeDefined();

    const second = updateThreads(first.threads, event({ id: "e2", type: "go", actor: "south" }), board(), first.peakDeficit);
    expect(second.threads.find((t) => t.id === "rare_moment")).toBeUndefined();
  });
});

describe("thread cap", () => {
  it("keeps at most two durable threads at once, exempting the temporary rare_moment thread", () => {
    const step1 = updateThreads([], event({ id: "e1" }), board({ northScore: 40, southScore: 25 }), {});
    const step2 = updateThreads(step1.threads, event({ id: "e2" }), board({ northScore: 40, southScore: 32 }), step1.peakDeficit);

    const rareEvent: PublicCommentaryEvent = event({
      id: "e3",
      type: "card_played",
      actor: "north",
      scoringType: "double_pair_royal",
      points: 12,
    });
    const step3 = updateThreads(step2.threads, rareEvent, board({ northScore: 40, southScore: 32 }), step2.peakDeficit);

    const durable = step3.threads.filter((t) => t.id !== "rare_moment");
    expect(durable.length).toBeLessThanOrEqual(2);
    expect(step3.threads.find((t) => t.id === "rare_moment")).toBeDefined();
  });
});
