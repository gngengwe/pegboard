import { describe, expect, it } from "vitest";
import { CribbageGame } from "../engine.js";
import type { PlayerId } from "../types.js";

function playOutPegging(game: CribbageGame): void {
  // Whenever it's PEGGING, the engine guarantees the current turnPlayer has at
  // least one legal play — this loop just always takes the first one offered.
  while (game.phase === "PEGGING") {
    const player = game.turnPlayer as PlayerId;
    const [card] = game.getLegalPlays(player);
    game.playCard(player, card);
  }
}

describe("CribbageGame — discard and pegging flow", () => {
  it("deals, opens for discards, and reaches pegging with legal turns throughout", () => {
    const game = new CribbageGame({ targetScore: 121, seed: 42 });
    const startEvents = game.start();
    expect(startEvents.some((e) => e.type === "GameStarted")).toBe(true);
    expect(startEvents.some((e) => e.type === "HandDealt")).toBe(true);
    expect(game.phase).toBe("DISCARD_TO_CRIB");

    const north = game.getProjection("north").ownHand!;
    const south = game.getProjection("south").ownHand!;
    expect(north).toHaveLength(6);
    expect(south).toHaveLength(6);

    game.discard("north", [north[0].id, north[1].id]);
    const events = game.discard("south", [south[0].id, south[1].id]);

    expect(events.some((e) => e.type === "StarterRevealed")).toBe(true);
    // Either straight into pegging, or a rare instant win off his-heels — both are valid outcomes.
    expect(["PEGGING", "GAME_COMPLETE"]).toContain(game.phase);

    if (game.phase === "PEGGING") {
      expect(game.getProjection("north").ownHand).toHaveLength(4);
      expect(game.getProjection("south").ownHand).toHaveLength(4);
      expect(game.turnPlayer).toBe(game.getProjection().pone);
    }
  });

  it("never leaves the current player without a legal play while pegging is active", () => {
    const game = new CribbageGame({ targetScore: 121, seed: 7 });
    game.start();
    const north = game.getProjection("north").ownHand!;
    const south = game.getProjection("south").ownHand!;
    game.discard("north", [north[0].id, north[1].id]);
    game.discard("south", [south[0].id, south[1].id]);

    let iterations = 0;
    while (game.phase === "PEGGING" && iterations < 100) {
      const player = game.turnPlayer as PlayerId;
      const legal = game.getLegalPlays(player);
      expect(legal.length).toBeGreaterThan(0);
      game.playCard(player, legal[0]);
      iterations++;
    }
    expect(iterations).toBeLessThan(100);
  });

  it("rejects a play out of turn and a phase-inappropriate discard", () => {
    const game = new CribbageGame({ targetScore: 121, seed: 3 });
    game.start();
    const north = game.getProjection("north").ownHand!;

    expect(() => game.playCard("north", north[0].id)).toThrow(/phase/i);

    game.discard("north", [north[0].id, north[1].id]);
    expect(() => game.discard("north", [north[2].id, north[3].id])).toThrow(/already discarded/i);
  });

  it("rejects discarding the same card twice", () => {
    const game = new CribbageGame({ targetScore: 121, seed: 11 });
    game.start();
    const north = game.getProjection("north").ownHand!;
    expect(() => game.discard("north", [north[0].id, north[0].id])).toThrow();
  });
});

describe("CribbageGame — full game simulation", () => {
  it("plays to completion with a trivial always-first-legal-option strategy", () => {
    const game = new CribbageGame({ targetScore: 61, seed: 99 });
    game.start();

    let hands = 0;
    const MAX_HANDS = 60; // generous ceiling to guarantee the test itself terminates

    while (game.phase !== "GAME_COMPLETE" && hands < MAX_HANDS) {
      if (game.phase === "DISCARD_TO_CRIB") {
        const north = game.getProjection("north").ownHand!;
        const south = game.getProjection("south").ownHand!;
        game.discard("north", [north[0].id, north[1].id]);
        game.discard("south", [south[0].id, south[1].id]);
        hands++;
      } else if (game.phase === "PEGGING") {
        playOutPegging(game);
      } else {
        break;
      }
    }

    expect(game.phase).toBe("GAME_COMPLETE");
    expect(game.winner).not.toBeNull();

    const scores = game.getScores();
    const winner = game.winner!;
    const loser = winner === "north" ? "south" : "north";
    expect(scores[winner]).toBeGreaterThanOrEqual(61);
    expect(scores[loser]).toBeLessThan(61);
  });

  it("emits exactly one GameWon event, on the winning score update", () => {
    const game = new CribbageGame({ targetScore: 61, seed: 5 });
    game.start();

    let wonEvents = 0;
    let hands = 0;
    while (game.phase !== "GAME_COMPLETE" && hands < 60) {
      if (game.phase === "DISCARD_TO_CRIB") {
        const north = game.getProjection("north").ownHand!;
        const south = game.getProjection("south").ownHand!;
        wonEvents += game.discard("north", [north[0].id, north[1].id]).filter((e) => e.type === "GameWon").length;
        wonEvents += game.discard("south", [south[0].id, south[1].id]).filter((e) => e.type === "GameWon").length;
        hands++;
      } else if (game.phase === "PEGGING") {
        while (game.phase === "PEGGING") {
          const player = game.turnPlayer as PlayerId;
          const [card] = game.getLegalPlays(player);
          wonEvents += game.playCard(player, card).filter((e) => e.type === "GameWon").length;
        }
      }
    }

    expect(game.phase).toBe("GAME_COMPLETE");
    expect(wonEvents).toBe(1);
  });
});
