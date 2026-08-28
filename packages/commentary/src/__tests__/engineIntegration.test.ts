import { CribbageGame, opponentOf, type GameEvent, type PlayerId } from "@pegboard/engine";
import { describe, expect, it } from "vitest";
import { selectCommentary } from "../director.js";
import { EngineCommentaryAdapter } from "../engineAdapter.js";
import { emptyCooldowns, emptyMemory, type CommentaryMemory, type CommentaryCooldowns } from "../types.js";

/** Plays one full seeded game end-to-end through the real engine, adapter, and director. */
function playFullGame(seed: number, targetScore: 61 | 121 = 61) {
  const game = new CribbageGame({ targetScore, seed });
  const adapter = new EngineCommentaryAdapter(`integration-${seed}`);

  let memory: CommentaryMemory = emptyMemory();
  let cooldowns: CommentaryCooldowns = emptyCooldowns();
  const wonPrimaries: { familyId: string; line: string }[] = [];
  let dealer: PlayerId = "north";

  const process = (raw: readonly GameEvent[]) => {
    const publicEvents = adapter.toPublicEvents(raw, game.getProjection());
    for (const publicEvent of publicEvents) {
      const result = selectCommentary({
        state: {
          mode: "broadcast",
          match: { matchId: "m", targetScore, stakes: "casual", skunkEnabled: false },
          board: {
            northScore: game.getScores().north,
            southScore: game.getScores().south,
            northDistance: targetScore - game.getScores().north,
            southDistance: targetScore - game.getScores().south,
            dealer,
            leader:
              game.getScores().north === game.getScores().south
                ? "tied"
                : game.getScores().north > game.getScores().south
                  ? "north"
                  : "south",
            margin: Math.abs(game.getScores().north - game.getScores().south),
            skunkState: "none",
          },
          phase: "pegging",
        },
        event: publicEvent,
        memory,
        cooldowns,
      });
      memory = result.nextMemory;
      cooldowns = result.nextCooldowns;
      if (result.primary && publicEvent.type === "game_won") {
        wonPrimaries.push({ familyId: result.primary.familyId, line: result.primary.line });
      }
    }
  };

  process(game.start());
  let guard = 0;
  while (game.phase !== "GAME_COMPLETE" && guard < 300) {
    guard++;
    if (game.phase === "DISCARD_TO_CRIB") {
      for (const seat of ["north", "south"] as PlayerId[]) {
        const hand = game.getProjection(seat).ownHand;
        if (!hand || hand.length !== 6) continue;
        process(game.discard(seat, [hand[0].id, hand[1].id]));
      }
      dealer = opponentOf(dealer);
    } else if (game.phase === "PEGGING") {
      const seat = game.turnPlayer!;
      const [card] = game.getLegalPlays(seat);
      process(game.playCard(seat, card));
    } else {
      break;
    }
  }

  return { game, wonPrimaries, guard };
}

describe("full-game integration: engine -> adapter -> director", () => {
  it("runs to completion without throwing, across many seeds", () => {
    for (let seed = 0; seed < 15; seed++) {
      expect(() => playFullGame(seed)).not.toThrow();
    }
  });

  it("fires exactly one win call per completed game, matching the authoritative final score", () => {
    for (let seed = 0; seed < 15; seed++) {
      const { game, wonPrimaries, guard } = playFullGame(seed);
      expect(guard, `seed ${seed} did not complete within the iteration budget`).toBeLessThan(300);
      expect(game.phase).toBe("GAME_COMPLETE");
      expect(wonPrimaries).toHaveLength(1);
      // ARC-03 (exact target), PBP-41 (overshoot but pre-empted counting —
      // a pegging-phase walk-off), or PBP-40 (ordinary counting-phase win).
      expect(["ARC-03", "PBP-41", "PBP-40"]).toContain(wonPrimaries[0].familyId);

      const winner = game.winner!;
      const finalScore = game.getScores()[winner];
      // The win call always names the actual winner and, for ARC-03, the exact score.
      expect(wonPrimaries[0].line.toLowerCase()).toContain(winner);
      if (wonPrimaries[0].familyId === "ARC-03") {
        expect(finalScore).toBe(61);
      }
    }
  });
});
