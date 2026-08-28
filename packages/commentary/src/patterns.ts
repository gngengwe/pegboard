import type {
  PatternConfidence,
  PatternId,
  PatternWording,
  PlayerPattern,
  PublicCommentaryEvent,
  Seat,
} from "./types.js";

/**
 * Evidence-gated player-pattern memory.
 *
 * Coverage note: three of the eight `PatternId`s are implemented with real,
 * public-fact-only detectors below (`go_management`, `pegging_count_control`,
 * `comeback_pegging`). The remaining five — `close_game_low_variance`,
 * `close_game_ceiling_chase`, `own_crib_aggression`, `opponent_crib_defense`,
 * `patient_endgame` — fundamentally require discard-shape or alternatives-
 * aware reasoning that isn't derivable from public facts alone without an
 * upstream strategy/analysis service (matching the taxonomy's own design:
 * those need `ApprovedPublicAnalysis` reason codes). The type union, registry
 * hooks, and activation-rule engine below already support them; adding a
 * detector for one is additive once that analysis service exists.
 */

const SOFT_MIN = 2;
const STRONG_MIN = 5;

export function activationWording(pattern: PlayerPattern | undefined): PatternWording {
  if (!pattern) return "none";
  if (pattern.contradictingEventIds.length >= pattern.evidenceEventIds.length) return "none";
  if (pattern.confidence === "low") return "none";
  if (pattern.sampleSize >= STRONG_MIN) return "strong";
  if (pattern.sampleSize >= SOFT_MIN) return "soft";
  return "none";
}

function confidenceFor(sampleSize: number, contradictions: number): PatternConfidence {
  if (contradictions >= sampleSize) return "low";
  if (sampleSize >= STRONG_MIN && contradictions === 0) return "high";
  if (sampleSize >= SOFT_MIN) return "medium";
  return "low";
}

function upsertPattern(
  patterns: readonly PlayerPattern[],
  patternId: PatternId,
  subject: Seat,
  eventId: string,
  summary: string,
  nowIso: string,
  isContradiction: boolean
): readonly PlayerPattern[] {
  const existing = patterns.find((p) => p.patternId === patternId && p.subject === subject);
  const withoutExisting = patterns.filter((p) => !(p.patternId === patternId && p.subject === subject));

  const evidenceEventIds = isContradiction
    ? existing?.evidenceEventIds ?? []
    : [...(existing?.evidenceEventIds ?? []), eventId];
  const contradictingEventIds = isContradiction
    ? [...(existing?.contradictingEventIds ?? []), eventId]
    : existing?.contradictingEventIds ?? [];
  const supportingExamples = isContradiction
    ? existing?.supportingExamples ?? []
    : [...(existing?.supportingExamples ?? []), summary];

  const sampleSize = evidenceEventIds.length;
  const confidence = confidenceFor(sampleSize, contradictingEventIds.length);

  const updated: PlayerPattern = {
    patternId,
    subject,
    evidenceEventIds,
    supportingExamples,
    contradictingEventIds,
    sampleSize,
    confidence,
    scope: "match",
    lastObservedAt: nowIso,
    visibleToAudience: true,
  };

  return [...withoutExisting, updated];
}

/**
 * `go_management`: evidence is drawn purely from public `Go`/last-card facts
 * — a seat that repeatedly forces or absorbs a go without conceding a score
 * is demonstrating public go-management, independent of what either hand held.
 */
function detectGoManagement(
  patterns: readonly PlayerPattern[],
  event: PublicCommentaryEvent,
  nowIso: string
): readonly PlayerPattern[] {
  if (event.type !== "last_card_point" || !event.actor) return patterns;
  return upsertPattern(
    patterns,
    "go_management",
    event.actor,
    event.id,
    `${event.actor} took the last-card point at count ${event.runningCount ?? "?"}.`,
    nowIso,
    false
  );
}

/**
 * `pegging_count_control`: a simplified, fully public-fact heuristic — a play
 * that lands the running count at or below a conservative threshold (staying
 * out of the 26-31 "awkward" zone) without conceding a score counts as
 * evidence of count-control play. This does not require knowing what
 * alternative cards the player held; it only reads the played card and the
 * resulting public running count.
 */
const SAFE_COUNT_CEILING = 21;

function detectPeggingCountControl(
  patterns: readonly PlayerPattern[],
  event: PublicCommentaryEvent,
  nowIso: string
): readonly PlayerPattern[] {
  if (event.type !== "card_played" || !event.actor || event.runningCount === undefined) return patterns;
  const scored = (event.points ?? 0) > 0;
  if (scored) return patterns;
  if (event.runningCount > SAFE_COUNT_CEILING) return patterns;

  return upsertPattern(
    patterns,
    "pegging_count_control",
    event.actor,
    event.id,
    `${event.actor} kept the count at ${event.runningCount} rather than pushing higher.`,
    nowIso,
    false
  );
}

/**
 * `comeback_pegging`: a seat who is behind on the board scores during
 * pegging — both facts (trailing, and the pegging score) are fully public.
 */
function detectComebackPegging(
  patterns: readonly PlayerPattern[],
  event: PublicCommentaryEvent,
  nowIso: string
): readonly PlayerPattern[] {
  if (event.type !== "card_played" || !event.actor || !event.points || event.points <= 0) return patterns;
  const opponentScore = event.actor === "north" ? event.beforeBoard.southScore : event.beforeBoard.northScore;
  const actorScore = event.actor === "north" ? event.beforeBoard.northScore : event.beforeBoard.southScore;
  if (actorScore >= opponentScore) return patterns;

  return upsertPattern(
    patterns,
    "comeback_pegging",
    event.actor,
    event.id,
    `${event.actor} scored ${event.points} while trailing on the board.`,
    nowIso,
    false
  );
}

export function updatePatterns(
  patterns: readonly PlayerPattern[],
  event: PublicCommentaryEvent,
  nowIso: string
): readonly PlayerPattern[] {
  let next = patterns;
  next = detectGoManagement(next, event, nowIso);
  next = detectPeggingCountControl(next, event, nowIso);
  next = detectComebackPegging(next, event, nowIso);
  return next;
}

export function findPattern(
  patterns: readonly PlayerPattern[],
  patternId: PatternId,
  subject: Seat
): PlayerPattern | undefined {
  return patterns.find((p) => p.patternId === patternId && p.subject === subject);
}
