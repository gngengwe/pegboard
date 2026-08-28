import { CribbageGame, type PlayerId } from "@pegboard/engine";
import { describe, expect, it } from "vitest";
import { selectCommentary } from "../director.js";
import { EngineCommentaryAdapter } from "../engineAdapter.js";
import { pickVariant, renderLine } from "../render.js";
import { ALL_FAMILIES } from "../registry/index.js";
import { emptyCooldowns, emptyMemory, type CommentaryCooldowns, type CommentaryMemory, type Mode } from "../types.js";
import { event, input } from "./testHelpers.js";

const ALL_MODES: readonly Mode[] = ["minimal", "broadcast", "arcade", "learn", "expert", "kids", "quiet"];

/**
 * Placeholder integrity, generalized: every family that ever renders must be
 * renderable, in every mode it allows, using nothing but its own declared
 * `allowedPlaceholders` filled with dummy values. This is the permanent
 * regression test for the exact class of bug hit by hand while building the
 * registry — several PBP families under-declared placeholders that the
 * director's generic candidate-builder always supplies (afterScore, length),
 * which only surfaced at the moment a specific scoring combination fired.
 */
describe("stress: every registered family renders in every mode it allows", () => {
  for (const family of ALL_FAMILIES) {
    for (const mode of family.modeAllowlist) {
      it(`${family.familyId} renders cleanly in ${mode} mode`, () => {
        const variant = pickVariant(family, mode);
        expect(variant, `${family.familyId} has no variant reachable for mode ${mode}`).not.toBeNull();
        if (!variant) return;

        const placeholders: Record<string, string | number> = {};
        for (const key of family.allowedPlaceholders) {
          placeholders[key] = `TEST_${key}`;
        }
        // Numeric-looking placeholders should actually be numbers so
        // downstream string interpolation doesn't mask a real type bug.
        for (const key of ["points", "count", "margin", "distance", "length", "afterScore", "winnerScore", "loserScore", "priorDeficit", "currentDeficit"]) {
          if (key in placeholders) placeholders[key] = 7;
        }

        expect(() => renderLine(family, variant, placeholders)).not.toThrow();
      });
    }
  }
});

/**
 * Mode-switching stress: the identical event, replayed across all seven
 * modes, must never crash the director and must never silently escalate a
 * mode that should be sparse (minimal/quiet) into firing color commentary.
 */
describe("stress: identical event across all seven modes", () => {
  const scoringEvent = event({
    type: "card_played",
    actor: "south",
    points: 2,
    scoringType: "fifteen",
    beforeBoard: { northScore: 100, southScore: 99 },
    afterBoard: { northScore: 100, southScore: 101 },
  });

  for (const mode of ALL_MODES) {
    it(`does not throw in ${mode} mode`, () => {
      expect(() => selectCommentary(input({ event: scoringEvent }, mode))).not.toThrow();
    });
  }

  it("minimal and quiet modes never attach a color follow-up, even on a lead-changing score", () => {
    const minimalResult = selectCommentary(input({ event: scoringEvent }, "minimal"));
    const quietResult = selectCommentary(input({ event: scoringEvent }, "quiet"));
    expect(minimalResult.followUp).toBeUndefined();
    expect(quietResult.followUp).toBeUndefined();
  });
});

/**
 * Pathological board states: both players simultaneously near target, a
 * double-go into a full segment reset, and a hand where the same event
 * carries the maximum plausible point total. None of these should crash the
 * director or produce a NaN/undefined placeholder in the rendered line.
 */
describe("stress: pathological board states", () => {
  it("handles both players within one point of target simultaneously", () => {
    const result = selectCommentary(
      input({
        event: event({
          type: "card_played",
          actor: "south",
          points: 2,
          scoringType: "pair",
          beforeBoard: { northScore: 120, southScore: 119 },
          afterBoard: { northScore: 120, southScore: 121 },
        }),
      })
    );
    expect(result.primary?.line).not.toMatch(/undefined|NaN/);
    expect(result.followUp?.line ?? "").not.toMatch(/undefined|NaN/);
  });

  it("handles the maximum plausible single-play total (double pair royal + fifteen = 14) without breaking placeholder rendering", () => {
    const result = selectCommentary(
      input({
        event: event({
          type: "card_played",
          actor: "north",
          points: 14,
          scoringType: "double_pair_royal",
          beforeBoard: { northScore: 0, southScore: 0 },
          afterBoard: { northScore: 14, southScore: 0 },
        }),
      })
    );
    expect(result.primary?.line).toContain("14");
    expect(result.primary?.line).not.toMatch(/undefined|NaN/);
  });

  it("handles a zero-margin, zero-distance-progress event (very start of a match) without crashing", () => {
    expect(() =>
      selectCommentary(
        input({
          event: event({ type: "card_played", actor: "north", points: 0, runningCount: 3 }),
        })
      )
    ).not.toThrow();
  });
});

/** Adversarial: a hostile caller supplying an unrecognized event type must degrade to silence, never throw. */
describe("stress: unrecognized event types degrade to silence, not crashes", () => {
  it("suppresses an event type the director has no family mapping for", () => {
    const result = selectCommentary(input({ event: event({ type: "some_future_event_type_v2" }) }));
    expect(result.suppressed).toBe(true);
    expect(result.primary).toBeUndefined();
  });
});

/**
 * Large-scale hidden-information fuzz: many more seeds and both real target
 * scores, going beyond the original 25-seed/61-point safety test to also
 * cover 121-point (Classic) matches, which run longer and touch more
 * distinct board states.
 */
describe("stress: hidden-information leakage at scale (121-point matches)", () => {
  it("never forwards discarded card IDs across 40 seeded Classic (121) matches", () => {
    for (let seed = 100; seed < 140; seed++) {
      const game = new CribbageGame({ targetScore: 121, seed });
      const adapter = new EngineCommentaryAdapter(`classic-${seed}`);
      const discardedCardIds = new Set<string>();

      let events = game.start();
      let serialized = JSON.stringify(adapter.toPublicEvents(events, game.getProjection()));

      let guard = 0;
      while (game.phase !== "GAME_COMPLETE" && guard < 400) {
        guard++;
        if (game.phase === "DISCARD_TO_CRIB") {
          for (const seat of ["north", "south"] as PlayerId[]) {
            const hand = game.getProjection(seat).ownHand;
            if (!hand || hand.length !== 6) continue;
            discardedCardIds.add(hand[0].id);
            discardedCardIds.add(hand[1].id);
            events = game.discard(seat, [hand[0].id, hand[1].id]);
            serialized = JSON.stringify(adapter.toPublicEvents(events, game.getProjection()));
            for (const id of discardedCardIds) expect(serialized.includes(id)).toBe(false);
          }
        } else if (game.phase === "PEGGING") {
          const seat = game.turnPlayer!;
          const [card] = game.getLegalPlays(seat);
          events = game.playCard(seat, card);
          serialized = JSON.stringify(adapter.toPublicEvents(events, game.getProjection()));
          for (const id of discardedCardIds) expect(serialized.includes(id)).toBe(false);
        } else {
          break;
        }
      }
      expect(guard, `seed ${seed} did not complete within budget`).toBeLessThan(400);
    }
  });
});

/** Rapid repeated calls with shared, threaded memory/cooldowns must never desync or throw. */
describe("stress: rapid repeated director calls with threaded state", () => {
  it("processes 500 synthetic events back-to-back without throwing or losing invariants", () => {
    let memory: CommentaryMemory = emptyMemory();
    let cooldowns: CommentaryCooldowns = emptyCooldowns();
    const seats: PlayerId[] = ["north", "south"];

    for (let i = 0; i < 500; i++) {
      const actor = seats[i % 2];
      const scoringTypes = ["fifteen", "pair", "run", "thirty_one"] as const;
      const points = i % 7 === 0 ? 0 : 2;
      const result = selectCommentary({
        state: {
          mode: ALL_MODES[i % ALL_MODES.length],
          match: { matchId: "m", targetScore: 121, stakes: "casual", skunkEnabled: false },
          board: {
            northScore: i % 121,
            southScore: (i * 3) % 121,
            northDistance: 121 - (i % 121),
            southDistance: 121 - ((i * 3) % 121),
            dealer: actor,
            leader: "tied",
            margin: Math.abs((i % 121) - ((i * 3) % 121)),
            skunkState: "none",
          },
          phase: "pegging",
        },
        event: event({
          id: `stress-${i}`,
          type: "card_played",
          actor,
          points,
          scoringType: points > 0 ? scoringTypes[i % scoringTypes.length] : undefined,
          runningCount: (i * 5) % 31,
        }),
        memory,
        cooldowns,
      });
      memory = result.nextMemory;
      cooldowns = result.nextCooldowns;
      expect(cooldowns.currentEventIndex).toBe(i + 1);
    }
  });
});
