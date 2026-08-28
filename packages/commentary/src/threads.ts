import { distanceToWin, marginOf } from "./intensity.js";
import type { NarrativeThread, PublicCommentaryBoard, PublicCommentaryEvent, Seat, ThreadId } from "./types.js";

const MAX_DURABLE_THREADS = 2;

export interface ThreadsUpdate {
  readonly threads: readonly NarrativeThread[];
  readonly peakDeficit: Readonly<Partial<Record<Seat, number>>>;
}

/**
 * Narrative-thread bookkeeping. Each thread has start / advance / expire
 * conditions tied to public facts only (per the taxonomy's thread table).
 *
 * `high_variance_vs_safety` and `rivalry_rematch` are structurally supported
 * (the ThreadId union includes them, and this module would happily carry one
 * if given evidence) but have no active starter here: both fundamentally
 * need an upstream signal this MVP doesn't have yet — `high_variance_vs_safety`
 * needs `ApprovedPublicAnalysis` EV/risk bands, `rivalry_rematch` needs
 * cross-match session history. Wiring either up later is additive, not a
 * rewrite of this module.
 */
export function updateThreads(
  existing: readonly NarrativeThread[],
  event: PublicCommentaryEvent,
  board: PublicCommentaryBoard,
  priorPeakDeficit: Readonly<Partial<Record<Seat, number>>> = {}
): ThreadsUpdate {
  let threads = [...existing];

  const { threads: afterComeback, peakDeficit } = updateComeback(threads, event, board, priorPeakDeficit);
  threads = afterComeback;
  threads = updateRareMoment(threads, event, board);
  threads = updateDealerPressure(threads, event, board);

  // Keep at most two durable threads (rare_moment is the one temporary
  // "event thread" and is exempt from the durable cap).
  const durable = threads.filter((t) => t.id !== "rare_moment");
  const temporary = threads.filter((t) => t.id === "rare_moment");
  const trimmedDurable = durable.slice(-MAX_DURABLE_THREADS);
  return { threads: [...trimmedDurable, ...temporary], peakDeficit };
}

function upsert(
  threads: NarrativeThread[],
  id: ThreadId,
  thread: NarrativeThread | null
): NarrativeThread[] {
  const withoutId = threads.filter((t) => t.id !== id);
  return thread ? [...withoutId, thread] : withoutId;
}

function find(threads: readonly NarrativeThread[], id: ThreadId): NarrativeThread | undefined {
  return threads.find((t) => t.id === id);
}

function trailingSeat(board: PublicCommentaryBoard): Seat | "tied" {
  if (board.northScore === board.southScore) return "tied";
  return board.northScore < board.southScore ? "north" : "south";
}

function updateComeback(
  threads: NarrativeThread[],
  event: PublicCommentaryEvent,
  board: PublicCommentaryBoard,
  priorPeakDeficit: Readonly<Partial<Record<Seat, number>>>
): { threads: NarrativeThread[]; peakDeficit: Readonly<Partial<Record<Seat, number>>> } {
  const trailing = trailingSeat(board);
  const currentDeficit = marginOf(board);
  const existingThread = find(threads, "comeback");

  if (trailing === "tied" || currentDeficit === 0) {
    // Deficit closed entirely — the comeback resolved. Reset both seats' peak
    // (a fresh deficit later starts a fresh comeback story) and let any
    // active thread expire rather than keep restating it once level.
    return { threads: upsert(threads, "comeback", null), peakDeficit: {} };
  }

  const subject = trailing as Seat;
  // The peak persists independently of the thread's own lifecycle: it must
  // keep growing even while the deficit is still building and no thread has
  // started yet, so that a later reduction can still be measured against it.
  const priorPeakForSubject = priorPeakDeficit[subject] ?? 0;
  const newPeak = Math.max(priorPeakForSubject, currentDeficit);
  const nextPeakDeficit = { ...priorPeakDeficit, [subject]: newPeak };

  if (!existingThread) {
    // Start condition: a deficit of at least 10 has been reduced by at least 5.
    if (newPeak >= 10 && newPeak - currentDeficit >= 5) {
      return {
        threads: upsert(threads, "comeback", {
          id: "comeback",
          startedAtEventId: event.id,
          lastAdvancedAtEventId: event.id,
          subject,
          summary: `${subject} cut a ${newPeak}-point deficit down to ${currentDeficit}.`,
          data: { peakDeficit: newPeak, currentDeficit, subject },
        }),
        peakDeficit: nextPeakDeficit,
      };
    }
    return { threads, peakDeficit: nextPeakDeficit };
  }

  // Expire condition: the deficit re-expands back near its peak.
  if (currentDeficit >= newPeak - 1 && currentDeficit > (existingThread.data.currentDeficit as number)) {
    return { threads: upsert(threads, "comeback", null), peakDeficit: nextPeakDeficit };
  }

  return {
    threads: upsert(threads, "comeback", {
      ...existingThread,
      lastAdvancedAtEventId: event.id,
      summary: `${subject} cut a ${newPeak}-point deficit down to ${currentDeficit}.`,
      data: { ...existingThread.data, peakDeficit: newPeak, currentDeficit },
    }),
    peakDeficit: nextPeakDeficit,
  };
}

function updateRareMoment(
  threads: NarrativeThread[],
  event: PublicCommentaryEvent,
  _board: PublicCommentaryBoard
): NarrativeThread[] {
  const isRare =
    event.scoringType === "double_pair_royal" ||
    (event.scoringType === "hand_total" && (event.points ?? 0) >= 20) ||
    (event.scoringType === "crib_total" && (event.points ?? 0) >= 20);

  if (isRare && event.actor) {
    return upsert(threads, "rare_moment", {
      id: "rare_moment",
      startedAtEventId: event.id,
      lastAdvancedAtEventId: event.id,
      subject: event.actor,
      summary: `${event.actor} produced a rare ${event.points}-point moment.`,
      data: { points: event.points ?? 0 },
    });
  }

  // Expires on the next phase transition — approximated here as "any later
  // event with a different id," since the caller only asks this module to
  // advance/expire once per incoming event and the phase-transition events
  // (StarterRevealed, HandDealt, PeggingComplete) all flow through here too.
  const existing = find(threads, "rare_moment");
  if (existing && existing.startedAtEventId !== event.id) {
    return upsert(threads, "rare_moment", null);
  }
  return threads;
}

function updateDealerPressure(
  threads: NarrativeThread[],
  event: PublicCommentaryEvent,
  board: PublicCommentaryBoard
): NarrativeThread[] {
  const nearestDistance = Math.min(
    distanceToWin(board.northScore, 121),
    distanceToWin(board.southScore, 121)
  );
  const materiallyClose = nearestDistance <= 15;
  const existing = find(threads, "dealer_pressure");

  if (materiallyClose && (event.type === "hand_count_opening" || event.type === "crib_reveal_opening")) {
    return upsert(threads, "dealer_pressure", {
      id: "dealer_pressure",
      startedAtEventId: event.id,
      lastAdvancedAtEventId: event.id,
      subject: board.dealer,
      summary: `Count order matters with the board this close — ${board.dealer} deals.`,
      data: { dealer: board.dealer },
    });
  }

  if (existing && event.type === "hand_complete") {
    return upsert(threads, "dealer_pressure", null);
  }

  return threads;
}
