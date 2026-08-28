import type { CardId, GameEvent, PlayerId, PlayerProjection, ScoreEntry } from "@pegboard/engine";
import type { PublicCommentaryEvent, ScoringType, Seat } from "./types.js";

/**
 * The ONLY file in this package that imports `@pegboard/engine`. Every other
 * module (director, registry, threads, patterns, cooldowns, intensity,
 * render) operates purely on this package's own public-safe DTOs and has no
 * way to reference a hidden field even by accident — there simply isn't an
 * import path to one. This file is the seam, so it carries the burden of
 * proof: `safety.test.ts` exercises it directly and adversarially.
 */

interface BoardTotals {
  readonly northScore: number;
  readonly southScore: number;
}

/**
 * Runtime guard, not just a type-level one: throws if handed anything but the
 * fully public projection (`game.getProjection()` called with NO seat
 * argument). A per-seat projection has the identical TypeScript shape
 * (`ownHand`/`remainingToPlay` are merely nullable, not a different type), so
 * the compiler alone can't stop a caller from passing the wrong one — this
 * check is what actually makes that "difficult or impossible."
 */
export function assertPublicProjection(projection: PlayerProjection): void {
  if (
    projection.ownHand !== null ||
    projection.remainingToPlay !== null ||
    projection.opponentHandSize !== 0
  ) {
    throw new Error(
      "EngineCommentaryAdapter received a per-seat projection. Public commentary must only " +
        "ever be built from game.getProjection() called with no seat argument."
    );
  }
}

function describeCard(cardId: CardId): string {
  const [rank, suit] = cardId.split("-");
  return `${rank} of ${suit}`;
}

/** When several combinations land on one card, this is the one PBP leads with. */
function dominantEntry(entries: readonly ScoreEntry[]): ScoreEntry | undefined {
  const priority = (e: ScoreEntry): number => {
    if (e.type === "pair" && e.points === 12) return 6; // double pair royal
    if (e.type === "pair" && e.points === 6) return 5; // pair royal
    if (e.type === "run" && e.points >= 4) return 4;
    if (e.type === "fifteen" && e.label.toLowerCase().includes("thirty-one")) return 3;
    if (e.type === "fifteen") return 2;
    if (e.type === "run") return 1;
    return 0; // plain pair, flush, nobs
  };
  return [...entries].sort((a, b) => priority(b) - priority(a))[0];
}

function scoringTypeForEntry(entry: ScoreEntry): ScoringType {
  switch (entry.type) {
    case "fifteen":
      return entry.label.toLowerCase().includes("thirty-one") ? "thirty_one" : "fifteen";
    case "pair":
      if (entry.points === 12) return "double_pair_royal";
      if (entry.points === 6) return "pair_royal";
      return "pair";
    case "run":
      return "run";
    case "flush":
      return "flush";
    case "nobs":
      return "nobs";
    case "heels":
      return "heels";
  }
}

export class EngineCommentaryAdapter {
  private board: BoardTotals = { northScore: 0, southScore: 0 };
  /** Running pegging count — `Go`/reset events don't carry it themselves. */
  private pegCount = 0;
  private seq = 0;

  constructor(private readonly matchId: string) {}

  private nextId(): string {
    return `${this.matchId}-e${this.seq++}`;
  }

  /**
   * Converts one command's raw event batch — from `game.start()`,
   * `game.discard()`, or `game.playCard()` — into public-safe commentary
   * events, in order, with an accurate before/after board for each one even
   * when several scoring moments land in the same batch (e.g. pone hand,
   * dealer hand, and crib all score within a single `playCard` call).
   *
   * `publicProjection` MUST be `game.getProjection()` called with no seat
   * argument; this is asserted, not assumed.
   */
  toPublicEvents(
    batch: readonly GameEvent[],
    publicProjection: PlayerProjection
  ): PublicCommentaryEvent[] {
    assertPublicProjection(publicProjection);

    let running: BoardTotals = { ...this.board };
    const afterIndex: BoardTotals[] = [];
    for (const raw of batch) {
      if (raw.type === "ScoreUpdated") {
        running =
          raw.player === "north"
            ? { ...running, northScore: raw.total }
            : { ...running, southScore: raw.total };
      }
      afterIndex.push({ ...running });
    }

    const out: PublicCommentaryEvent[] = [];
    // Tracks the board immediately before the most recent scoring action, so
    // that `GameWon` — whose own before/after are otherwise identical,
    // since it fires after its causing ScoreUpdated has already applied —
    // can still report how many points the winning score was worth.
    let lastScoreBefore: BoardTotals = { ...this.board };
    // Tracks whether that most recent score came from pegging (CardPlayed /
    // SegmentEnded's last-card point) or HisHeels — either of which, if it's
    // also the winning score, means the win pre-empts hand/crib counting
    // entirely — versus from HandScored (a normal counting-phase win, where
    // counting already ran its course). Lets the director distinguish an
    // instant walk-off from an ordinary win when it sees `GameWon`.
    let lastScoreWasPreCount = false;

    for (let i = 0; i < batch.length; i++) {
      const raw = batch[i];
      const before = i === 0 ? { ...this.board } : afterIndex[i - 1];
      const causesScore =
        (raw.type === "CardPlayed" && raw.pointsScored > 0) ||
        raw.type === "HisHeels" ||
        (raw.type === "HandScored" && raw.points > 0) ||
        (raw.type === "SegmentEnded" && raw.points > 0);
      const nextIsScoreUpdate = batch[i + 1]?.type === "ScoreUpdated";
      const after = causesScore && nextIsScoreUpdate ? afterIndex[i + 1] : afterIndex[i];
      if (causesScore) {
        lastScoreBefore = before;
        lastScoreWasPreCount = raw.type !== "HandScored";
      }

      if (raw.type === "CardPlayed") this.pegCount = raw.runningCount;
      else if (raw.type === "SegmentEnded") this.pegCount = 0;

      out.push(...this.buildEvents(raw, before, after, this.pegCount, lastScoreBefore, lastScoreWasPreCount));

      // Detect ARC-04 (count-control door-slam): a non-scoring play
      // immediately followed, in this same batch, by a Go against the
      // opponent. Both facts are already public at this point.
      if (raw.type === "CardPlayed" && raw.pointsScored === 0) {
        const next = batch[i + 1];
        if (next?.type === "Go" && next.player !== raw.player) {
          const last = out[out.length - 1];
          out[out.length - 1] = { ...last, revealedFacts: [...last.revealedFacts, "followed_by_go"] };
        }
      }
    }

    this.board = running;
    return out;
  }

  private buildEvents(
    raw: GameEvent,
    before: BoardTotals,
    after: BoardTotals,
    pegCount: number,
    lastScoreBefore: BoardTotals,
    lastScoreWasPreCount: boolean
  ): PublicCommentaryEvent[] {
    const asSeat = (player: PlayerId): Seat => player;

    switch (raw.type) {
      case "GameStarted":
        return [
          {
            id: this.nextId(),
            type: "game_started",
            beforeBoard: before,
            afterBoard: after,
            revealedFacts: [`dealer:${raw.dealer}`, `pone:${raw.pone}`, `target:${raw.targetScore}`],
          },
        ];

      case "HandDealt":
        return [
          {
            id: this.nextId(),
            type: "hand_dealt",
            beforeBoard: before,
            afterBoard: after,
            revealedFacts: [`dealer:${raw.dealer}`],
          },
        ];

      case "CardsDiscarded":
        // The card IDs are genuinely hidden at this moment (the crib isn't
        // public until counting) — deliberately never forwarded.
        return [
          {
            id: this.nextId(),
            type: "cards_discarded",
            actor: asSeat(raw.player),
            beforeBoard: before,
            afterBoard: after,
            revealedFacts: ["discarded_to_crib"],
          },
        ];

      case "StarterRevealed":
        return [
          {
            id: this.nextId(),
            type: "starter_revealed",
            card: describeCard(raw.card),
            beforeBoard: before,
            afterBoard: after,
            revealedFacts: [`starter:${describeCard(raw.card)}`],
          },
        ];

      case "HisHeels":
        return [
          {
            id: this.nextId(),
            type: "his_heels",
            actor: asSeat(raw.dealer),
            points: raw.points,
            scoringType: "heels",
            beforeBoard: before,
            afterBoard: after,
            revealedFacts: ["starter_is_jack"],
          },
        ];

      case "CardPlayed": {
        if (raw.pointsScored === 0) {
          return [
            {
              id: this.nextId(),
              type: "card_played",
              actor: asSeat(raw.player),
              card: describeCard(raw.card),
              runningCount: raw.runningCount,
              points: 0,
              beforeBoard: before,
              afterBoard: after,
              revealedFacts: [],
            },
          ];
        }
        const entry = dominantEntry(raw.entries);
        return [
          {
            id: this.nextId(),
            type: "card_played",
            actor: asSeat(raw.player),
            card: describeCard(raw.card),
            runningCount: raw.runningCount,
            points: raw.pointsScored,
            scoringType: entry ? scoringTypeForEntry(entry) : undefined,
            beforeBoard: before,
            afterBoard: after,
            revealedFacts: raw.entries.map((e) => e.label),
          },
        ];
      }

      case "Go":
        return [
          {
            id: this.nextId(),
            type: "go",
            actor: asSeat(raw.player),
            runningCount: pegCount,
            beforeBoard: before,
            afterBoard: after,
            revealedFacts: [raw.reason],
          },
        ];

      case "SegmentEnded":
        if (raw.points !== 1) return []; // 31-reset is already covered by the scoring CardPlayed itself.
        return [
          {
            id: this.nextId(),
            type: "last_card_point",
            actor: asSeat(raw.lastPlayer),
            points: raw.points,
            scoringType: "last_card",
            beforeBoard: before,
            afterBoard: after,
            revealedFacts: [],
          },
        ];

      case "PeggingComplete":
        return [
          {
            id: this.nextId(),
            type: "pegging_complete",
            beforeBoard: before,
            afterBoard: after,
            revealedFacts: [],
          },
        ];

      case "HandScored": {
        const openingType = raw.source === "crib" ? "crib_reveal_opening" : "hand_count_opening";
        const scoredType = raw.source === "crib" ? "crib_scored" : "hand_scored";
        const scoringType: ScoringType = raw.source === "crib" ? "crib_total" : "hand_total";
        return [
          {
            id: this.nextId(),
            type: openingType,
            actor: asSeat(raw.player),
            beforeBoard: before,
            afterBoard: before,
            revealedFacts: [],
          },
          {
            id: this.nextId(),
            type: scoredType,
            actor: asSeat(raw.player),
            points: raw.points,
            scoringType,
            beforeBoard: before,
            afterBoard: after,
            revealedFacts: raw.entries.map((e) => e.label),
          },
        ];
      }

      case "ScoreUpdated":
        // Pure bookkeeping — already folded into before/after board math above.
        return [];

      case "GameWon": {
        const winner = asSeat(raw.player);
        const winningPoints =
          winner === "north"
            ? after.northScore - lastScoreBefore.northScore
            : after.southScore - lastScoreBefore.southScore;
        return [
          {
            id: this.nextId(),
            type: "game_won",
            actor: winner,
            points: winningPoints,
            scoringType: "win",
            beforeBoard: lastScoreBefore,
            afterBoard: after,
            revealedFacts: [
              `final:${raw.finalScore.north}-${raw.finalScore.south}`,
              ...(lastScoreWasPreCount ? ["instant_win_pre_count"] : []),
            ],
          },
        ];
      }

      case "HandComplete":
        return [
          {
            id: this.nextId(),
            type: "hand_complete",
            beforeBoard: before,
            afterBoard: after,
            revealedFacts: [`next_dealer:${raw.nextDealer}`],
          },
        ];

      default:
        return [];
    }
  }
}
