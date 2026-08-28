import {
  EngineCommentaryAdapter,
  emptyCooldowns,
  emptyMemory,
  selectCommentary,
  type CommentaryCooldowns,
  type CommentaryMemory,
  type Mode,
  type Phase,
} from "@pegboard/commentary";
import type { GameEvent, PlayerId, PlayerProjection } from "@pegboard/engine";

export interface DisplayCaption {
  readonly voice: "pbp" | "color";
  readonly text: string;
}

const PHASE_FOR_EVENT_TYPE: Readonly<Record<string, Phase>> = {
  game_started: "match_open",
  hand_dealt: "match_open",
  cards_discarded: "discard",
  starter_revealed: "starter_reveal",
  his_heels: "starter_reveal",
  card_played: "pegging",
  go: "pegging",
  last_card_point: "pegging",
  pegging_complete: "pegging",
  hand_count_opening: "counting",
  hand_scored: "counting",
  crib_reveal_opening: "crib",
  crib_scored: "crib",
  game_won: "match_end",
  hand_complete: "counting",
};

/**
 * Owns one match's worth of Commentary Director state (memory, cooldowns,
 * the engine adapter) and turns a raw engine event batch into display-ready
 * captions. This is the real vertical slice from `@pegboard/commentary`
 * wired into the actual playable app — not a parallel demo.
 */
export class MatchCommentary {
  private readonly adapter: EngineCommentaryAdapter;
  private memory: CommentaryMemory = emptyMemory();
  private cooldowns: CommentaryCooldowns = emptyCooldowns();

  constructor(
    matchId: string,
    private readonly mode: Mode,
    private readonly targetScore: number
  ) {
    this.adapter = new EngineCommentaryAdapter(matchId);
  }

  process(
    rawEvents: readonly GameEvent[],
    publicProjection: PlayerProjection,
    dealer: PlayerId
  ): DisplayCaption[] {
    const publicEvents = this.adapter.toPublicEvents(rawEvents, publicProjection);
    const captions: DisplayCaption[] = [];

    for (const event of publicEvents) {
      const board = event.afterBoard;
      const result = selectCommentary({
        state: {
          mode: this.mode,
          match: { matchId: "m", targetScore: this.targetScore, stakes: "casual", skunkEnabled: false },
          board: {
            northScore: board.northScore,
            southScore: board.southScore,
            northDistance: Math.max(0, this.targetScore - board.northScore),
            southDistance: Math.max(0, this.targetScore - board.southScore),
            dealer,
            leader:
              board.northScore === board.southScore
                ? "tied"
                : board.northScore > board.southScore
                  ? "north"
                  : "south",
            margin: Math.abs(board.northScore - board.southScore),
            skunkState: "none",
          },
          phase: PHASE_FOR_EVENT_TYPE[event.type] ?? "pegging",
        },
        event,
        memory: this.memory,
        cooldowns: this.cooldowns,
      });

      this.memory = result.nextMemory;
      this.cooldowns = result.nextCooldowns;

      if (result.primary) captions.push({ voice: "pbp", text: result.primary.line });
      if (result.followUp) captions.push({ voice: "color", text: result.followUp.line });
    }

    return captions;
  }
}
