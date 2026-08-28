/**
 * Core domain types for the Commentary Director.
 *
 * Deliberately engine-agnostic: nothing in this file (or in registry/, threads.ts,
 * patterns.ts, cooldowns.ts, intensity.ts, render.ts, director.ts) imports from
 * `@pegboard/engine`. The only file allowed to do that is `engineAdapter.ts` —
 * it is the single seam where hidden-information leakage could be introduced,
 * so it is the only place that needs to be trusted (and is the most heavily
 * tested file in this package).
 *
 * `Seat` intentionally matches `@pegboard/engine`'s `PlayerId` values so the
 * adapter mapping is an identity function, but this type is independently
 * defined — this package must be able to typecheck and run its full test
 * suite with zero knowledge of the engine's internals.
 */

export type Seat = "north" | "south";

export function opponentSeat(seat: Seat): Seat {
  return seat === "north" ? "south" : "north";
}

export type Mode = "minimal" | "broadcast" | "arcade" | "learn" | "expert" | "kids" | "quiet";

export type Phase =
  | "match_open"
  | "discard"
  | "starter_reveal"
  | "pegging"
  | "counting"
  | "crib"
  | "match_end";

export type Role = "play_by_play" | "color" | "booth_exchange";

export type Grade = "S" | "A" | "B" | "C";

export type TimeLens = "past" | "present" | "future" | "pattern" | "none";

export type Intensity = 0 | 1 | 2 | 3 | 4;

export type SkunkState = "none" | "pressure" | "escape_possible" | "secured";

export type ScoringType =
  | "fifteen"
  | "thirty_one"
  | "pair"
  | "pair_royal"
  | "double_pair_royal"
  | "run"
  | "go"
  | "last_card"
  | "flush"
  | "nobs"
  | "heels"
  | "hand_total"
  | "crib_total"
  | "win";

// ---------- public-safe input state ----------

export interface PublicCommentaryMatch {
  readonly matchId: string;
  readonly targetScore: number;
  readonly stakes: "casual" | "ranked" | "league" | "tournament" | "rematch";
  readonly skunkEnabled: boolean;
}

export interface PublicCommentaryBoard {
  readonly northScore: number;
  readonly southScore: number;
  readonly northDistance: number;
  readonly southDistance: number;
  readonly dealer: Seat;
  readonly leader: Seat | "tied";
  readonly margin: number;
  readonly skunkState: SkunkState;
  readonly nextCountOrder?: readonly Seat[];
}

export interface PublicCommentaryState {
  readonly mode: Mode;
  readonly match: PublicCommentaryMatch;
  readonly board: PublicCommentaryBoard;
  readonly phase: Phase;
}

/**
 * A single public, already-happened fact. `revealedFacts` is a small list of
 * plain-language public facts (e.g. "starter is J-hearts") available for
 * templating — never anything that was true before the reveal.
 */
export interface PublicCommentaryEvent {
  readonly id: string;
  readonly type: string;
  readonly actor?: Seat;
  readonly points?: number;
  readonly card?: string;
  readonly runningCount?: number;
  readonly scoringType?: ScoringType;
  readonly beforeBoard: { readonly northScore: number; readonly southScore: number };
  readonly afterBoard: { readonly northScore: number; readonly southScore: number };
  readonly revealedFacts: readonly string[];
}

export interface ApprovedPublicAnalysis {
  readonly decisionQuality?: "strong" | "close" | "risky" | "unclear";
  readonly confidence?: "low" | "medium" | "high";
  readonly reasonCodes?: readonly string[];
  readonly objectiveLabels?: readonly string[];
  readonly publicProbabilityBand?: "slight" | "meaningful" | "large";
}

// ---------- narrative threads ----------

export type ThreadId =
  | "comeback"
  | "count_control"
  | "dealer_pressure"
  | "high_variance_vs_safety"
  | "rivalry_rematch"
  | "rare_moment";

export interface NarrativeThread {
  readonly id: ThreadId;
  readonly startedAtEventId: string;
  readonly lastAdvancedAtEventId: string;
  readonly subject: Seat | "both";
  /** Small factual summary the thread can render from — never a slogan. */
  readonly summary: string;
  readonly data: Readonly<Record<string, unknown>>;
}

// ---------- player pattern memory ----------

export type PatternId =
  | "close_game_low_variance"
  | "close_game_ceiling_chase"
  | "own_crib_aggression"
  | "opponent_crib_defense"
  | "pegging_count_control"
  | "go_management"
  | "comeback_pegging"
  | "patient_endgame";

export type PatternConfidence = "low" | "medium" | "high";
export type PatternScope = "match" | "recent_session" | "career";

export interface PlayerPattern {
  readonly patternId: PatternId;
  readonly subject: Seat;
  readonly evidenceEventIds: readonly string[];
  readonly supportingExamples: readonly string[];
  readonly contradictingEventIds: readonly string[];
  readonly sampleSize: number;
  readonly confidence: PatternConfidence;
  readonly scope: PatternScope;
  readonly lastObservedAt: string;
  readonly expiresAt?: string;
  readonly visibleToAudience: boolean;
}

/** How a pattern claim may be worded, calibrated to evidence strength. */
export type PatternWording = "none" | "soft" | "strong";

// ---------- cooldowns ----------

export interface CommentaryCooldowns {
  /** cooldown_group -> event index (of the director's internal event counter) it last fired at */
  readonly lastFiredAt: Readonly<Record<string, number>>;
  readonly currentEventIndex: number;
}

export function emptyCooldowns(): CommentaryCooldowns {
  return { lastFiredAt: {}, currentEventIndex: 0 };
}

// ---------- memory (threads + patterns + repetition) ----------

export interface CommentaryMemory {
  readonly threads: readonly NarrativeThread[];
  readonly patterns: readonly PlayerPattern[];
  /** Board margin history, oldest first, for comeback/gap-tightening math. */
  readonly marginHistory: readonly number[];
  /**
   * Highest deficit observed so far this match, per trailing seat. Tracked
   * independently of whether a `comeback` thread has actually started yet —
   * the thread only starts once the deficit has *already* been cut by 5+
   * from this peak, so the peak itself must survive even while the deficit
   * is still just building up and no thread exists to hold it.
   */
  readonly peakDeficit: Readonly<Partial<Record<Seat, number>>>;
  /** Player has opted out of history-based (session/career) commentary. */
  readonly historyOptOut: Readonly<Partial<Record<Seat, boolean>>>;
  /** Set once a rare-hand ceremonial callback has been used, per fact key. */
  readonly usedCallbacks: readonly string[];
  /** Last PBP intensity fired, used to gate color follow-ups. */
  readonly lastPbpIntensity: Intensity | null;
}

export function emptyMemory(): CommentaryMemory {
  return {
    threads: [],
    patterns: [],
    marginHistory: [],
    peakDeficit: {},
    historyOptOut: {},
    usedCallbacks: [],
    lastPbpIntensity: null,
  };
}

// ---------- director input/output ----------

export interface CommentaryDirectorInput {
  readonly state: PublicCommentaryState;
  readonly event: PublicCommentaryEvent;
  readonly analysis?: ApprovedPublicAnalysis;
  readonly memory: CommentaryMemory;
  readonly cooldowns: CommentaryCooldowns;
}

export type SuppressionReason =
  | "routine_event"
  | "cooldown"
  | "signature_pbp_needs_space"
  | "insufficient_pattern_evidence"
  | "low_analysis_confidence"
  | "mode_density"
  | "unsafe_or_hidden_input"
  | "no_matching_family";

export interface CommentaryPrimary {
  readonly familyId: string;
  readonly role: Role;
  readonly intensity: Intensity;
  readonly timeLens: TimeLens;
  readonly line: string;
}

export interface CommentaryFollowUp {
  readonly familyId: string;
  readonly role: "color" | "booth_exchange";
  readonly delayMs: number;
  readonly line: string;
}

export interface CommentarySelection {
  readonly primary?: CommentaryPrimary;
  readonly followUp?: CommentaryFollowUp;
  readonly suppressed: boolean;
  readonly suppressionReason?: SuppressionReason;
  readonly activeNarrativeThreads: readonly NarrativeThread[];
  /** Updated memory/cooldowns to carry into the next call. Callers must thread this through. */
  readonly nextMemory: CommentaryMemory;
  readonly nextCooldowns: CommentaryCooldowns;
}

// ---------- content registry ----------

export interface LineVariant {
  readonly tier: "clean" | "broadcast" | "arcade" | "learn" | "expert" | "kids";
  readonly text: string;
}

export interface ContentFamily {
  readonly familyId: string;
  readonly role: Role;
  readonly grade: Grade;
  readonly phases: readonly Phase[];
  readonly modeAllowlist: readonly Mode[];
  readonly intensityLevel: Intensity;
  readonly cooldownGroup: string;
  readonly requiredPublicFacts: readonly string[];
  readonly allowedPlaceholders: readonly string[];
  readonly forbiddenInferences: readonly string[];
  readonly variants: readonly LineVariant[];
}
