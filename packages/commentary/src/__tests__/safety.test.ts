import { CribbageGame, type PlayerId } from "@pegboard/engine";
import { describe, expect, it } from "vitest";
import { assertPublicProjection, EngineCommentaryAdapter } from "../engineAdapter.js";
import { renderLine } from "../render.js";
import type { ContentFamily } from "../types.js";

describe("assertPublicProjection", () => {
  it("accepts the public (no-seat) projection", () => {
    const game = new CribbageGame({ targetScore: 61, seed: 1 });
    game.start();
    expect(() => assertPublicProjection(game.getProjection())).not.toThrow();
  });

  it("throws on a per-seat projection, even though the TypeScript shape matches", () => {
    const game = new CribbageGame({ targetScore: 61, seed: 1 });
    game.start();
    expect(() => assertPublicProjection(game.getProjection("south"))).toThrow(/per-seat projection/i);
    expect(() => assertPublicProjection(game.getProjection("north"))).toThrow(/per-seat projection/i);
  });
});

describe("EngineCommentaryAdapter — hidden information never reaches the public event stream", () => {
  it("never forwards discarded card IDs, across many real seeded matches", () => {
    for (let seed = 0; seed < 25; seed++) {
      const game = new CribbageGame({ targetScore: 61, seed });
      const adapter = new EngineCommentaryAdapter(`match-${seed}`);
      const discardedCardIds = new Set<string>();

      let events = game.start();
      adapter.toPublicEvents(events, game.getProjection());

      let guard = 0;
      while (game.phase !== "GAME_COMPLETE" && guard < 200) {
        guard++;
        if (game.phase === "DISCARD_TO_CRIB") {
          for (const seat of ["north", "south"] as PlayerId[]) {
            const hand = game.getProjection(seat).ownHand;
            if (!hand || hand.length !== 6) continue;
            const [a, b] = [hand[0].id, hand[1].id];
            discardedCardIds.add(a);
            discardedCardIds.add(b);
            events = game.discard(seat, [a, b]);
            const publicEvents = adapter.toPublicEvents(events, game.getProjection());
            assertNoHiddenIds(publicEvents, discardedCardIds);
          }
        } else if (game.phase === "PEGGING") {
          const seat = game.turnPlayer!;
          const [card] = game.getLegalPlays(seat);
          events = game.playCard(seat, card);
          const publicEvents = adapter.toPublicEvents(events, game.getProjection());
          assertNoHiddenIds(publicEvents, discardedCardIds);
        } else {
          break;
        }
      }
    }
  });

  it("the CardsDiscarded event is converted with no `card` field and no card-shaped facts", () => {
    const game = new CribbageGame({ targetScore: 61, seed: 7 });
    const adapter = new EngineCommentaryAdapter("m");
    game.start();
    const hand = game.getProjection("north").ownHand!;
    const events = game.discard("north", [hand[0].id, hand[1].id]);
    const publicEvents = adapter.toPublicEvents(events, game.getProjection());

    const discardEvent = publicEvents.find((e) => e.type === "cards_discarded");
    expect(discardEvent).toBeDefined();
    expect(discardEvent).not.toHaveProperty("card");
    expect(discardEvent!.revealedFacts).not.toContain(hand[0].id);
    expect(discardEvent!.revealedFacts).not.toContain(hand[1].id);
  });
});

function assertNoHiddenIds(publicEvents: readonly unknown[], hiddenIds: ReadonlySet<string>): void {
  const serialized = JSON.stringify(publicEvents);
  for (const id of hiddenIds) {
    expect(serialized.includes(id)).toBe(false);
  }
}

describe("render() placeholder boundary", () => {
  const family: ContentFamily = {
    familyId: "TEST-1",
    role: "color",
    grade: "A",
    phases: ["pegging"],
    modeAllowlist: ["broadcast"],
    intensityLevel: 1,
    cooldownGroup: "test",
    requiredPublicFacts: [],
    allowedPlaceholders: ["player"],
    forbiddenInferences: [],
    variants: [{ tier: "clean", text: "[player] plays on." }],
  };

  it("refuses to render a placeholder that isn't declared as allowed", () => {
    expect(() =>
      renderLine(family, family.variants[0], { player: "South", opponentHand: "5H,3D" })
    ).toThrow(/not declared in allowedPlaceholders/);
  });

  it("refuses to render when a referenced placeholder has no supplied value", () => {
    expect(() => renderLine(family, family.variants[0], {})).toThrow(/no value was supplied/);
  });
});
