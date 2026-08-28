import { getFamily, requireFamily } from "./registry/index.js";
import { pickVariant, renderLine } from "./render.js";
import { boardConsequenceFactors, distanceToWin, escalateIntensity } from "./intensity.js";
import { updateThreads } from "./threads.js";
import { activationWording, findPattern, updatePatterns } from "./patterns.js";
import { advanceEventIndex, isOnCooldown, recordFire } from "./cooldowns.js";
import { opponentSeat } from "./types.js";
import type {
  CommentaryDirectorInput,
  CommentaryFollowUp,
  CommentaryMemory,
  CommentaryPrimary,
  CommentarySelection,
  ContentFamily,
  PublicCommentaryEvent,
  Seat,
} from "./types.js";

function seatName(seat: Seat): string {
  return seat === "north" ? "North" : "South";
}

function scoreOf(board: { northScore: number; southScore: number }, seat: Seat): number {
  return seat === "north" ? board.northScore : board.southScore;
}

function render(
  family: ContentFamily,
  mode: CommentaryDirectorInput["state"]["mode"],
  placeholders: Record<string, string | number>
): string | null {
  const variant = pickVariant(family, mode);
  if (!variant) return null;
  return renderLine(family, variant, placeholders);
}

/** Deterministic PBP: event type + scoring type -> family id + placeholders. Returns null for silence. */
function resolvePbp(
  event: PublicCommentaryEvent,
  targetScore: number
): { familyId: string; placeholders: Record<string, string | number> } | null {
  switch (event.type) {
    case "starter_revealed":
      return { familyId: "PBP-06", placeholders: { card: event.card ?? "" } };

    case "his_heels":
      return {
        familyId: "PBP-07",
        placeholders: { dealer: seatName(event.actor!), points: event.points ?? 2 },
      };

    case "card_played": {
      if ((event.points ?? 0) > 0) {
        const familyId = FAMILY_FOR_SCORING_TYPE[event.scoringType ?? "fifteen"] ?? "PBP-10";
        return {
          familyId,
          placeholders: {
            player: seatName(event.actor!),
            afterScore: scoreOf(event.afterBoard, event.actor!),
            points: event.points ?? 0,
            length: event.points ?? 0,
          },
        };
      }
      if (event.revealedFacts.includes("followed_by_go")) {
        return { familyId: "ARC-04", placeholders: { player: seatName(event.actor!) } };
      }
      if ((event.runningCount ?? 0) > 21) {
        return { familyId: "PBP-09", placeholders: { count: event.runningCount ?? 0 } };
      }
      return null;
    }

    case "go":
      return {
        familyId: "PBP-16",
        placeholders: { player: seatName(event.actor!), count: event.runningCount ?? 0 },
      };

    case "last_card_point":
      return { familyId: "PBP-17", placeholders: { player: seatName(event.actor!) } };

    case "hand_scored": {
      const player = seatName(event.actor!);
      return {
        familyId: (event.points ?? 0) >= 20 ? "PBP-38" : (event.points ?? 0) >= 12 ? "PBP-33" : "PBP-32",
        placeholders: { player, total: event.points ?? 0 },
      };
    }

    case "crib_scored": {
      const player = `${seatName(event.actor!)}'s crib`;
      const afterScore = scoreOf(event.afterBoard, event.actor!);
      const beforeLeader = event.beforeBoard.northScore === event.beforeBoard.southScore
        ? "tied"
        : event.beforeBoard.northScore > event.beforeBoard.southScore ? "north" : "south";
      const afterLeader = event.afterBoard.northScore === event.afterBoard.southScore
        ? "tied"
        : event.afterBoard.northScore > event.afterBoard.southScore ? "north" : "south";
      const swungLead = beforeLeader !== afterLeader && (event.points ?? 0) >= 10;
      if (swungLead) {
        return { familyId: "PBP-36", placeholders: { player, total: event.points ?? 0, afterScore } };
      }
      return {
        familyId: (event.points ?? 0) >= 20 ? "PBP-38" : "PBP-32",
        placeholders: { player, total: event.points ?? 0 },
      };
    }

    case "game_won": {
      const winner = event.actor!;
      const finalScore = scoreOf(event.afterBoard, winner);
      const exact = finalScore === targetScore;
      // Exact-target wins always lead with ARC-03 regardless of when they
      // happened. Otherwise, a win that pre-empted hand/crib counting
      // (PBP-41) is a meaningfully different rules moment from an ordinary
      // win discovered mid-count (PBP-40) — worth its own call.
      const preCount = event.revealedFacts.includes("instant_win_pre_count");
      const familyId = exact ? "ARC-03" : preCount ? "PBP-41" : "PBP-40";
      return {
        familyId,
        placeholders: { player: seatName(winner), points: event.points ?? 0 },
      };
    }

    default:
      return null;
  }
}

const FAMILY_FOR_SCORING_TYPE: Readonly<Record<string, string>> = {
  fifteen: "PBP-10",
  thirty_one: "PBP-11",
  pair: "PBP-12",
  pair_royal: "PBP-13",
  double_pair_royal: "PBP-14",
  run: "PBP-15",
};

/** Priority-ordered color candidates. First one whose facts + cooldown + mode allow it wins. */
function resolveColor(
  input: CommentaryDirectorInput,
  event: PublicCommentaryEvent,
  memory: CommentaryMemory
): { familyId: string; placeholders: Record<string, string | number> } | null {
  const { mode } = input.state;
  const targetScore = input.state.match.targetScore;
  const factors = boardConsequenceFactors(event.beforeBoard, event.afterBoard, targetScore);

  // Priority 1: exact board consequence (only when this event actually moved the board meaningfully).
  if (factors.leadChanged && event.actor) {
    const family = getFamily("BX-01");
    if (family?.modeAllowlist.includes(mode)) {
      return {
        familyId: "BX-01",
        placeholders: { player: seatName(event.actor), afterScore: scoreOf(event.afterBoard, event.actor) },
      };
    }
  }

  // Priority 2: immediate public strategic objective. Uses the event's own
  // afterBoard (always accurate at this moment) rather than `input.state.board`,
  // which the caller may not have refreshed yet within a multi-event batch.
  if (event.actor && ["card_played", "hand_scored", "crib_scored"].includes(event.type)) {
    const northDistance = distanceToWin(event.afterBoard.northScore, targetScore);
    const southDistance = distanceToWin(event.afterBoard.southScore, targetScore);
    const nearest = Math.min(northDistance, southDistance);
    if (nearest <= 10 && nearest > 0) {
      const family = getFamily("ARC-11");
      if (family?.modeAllowlist.includes(mode)) {
        return { familyId: "ARC-11", placeholders: { distance: nearest } };
      }
    }
  }

  // Priority 3: fresh, evidence-backed pattern callback.
  if (event.actor) {
    for (const patternId of ["pegging_count_control", "comeback_pegging", "go_management"] as const) {
      const pattern = findPattern(memory.patterns, patternId, event.actor);
      const wording = activationWording(pattern);
      if (wording === "none" || !pattern) continue;
      const familyId = wording === "strong" ? "ARC-08" : "ARC-07";
      const family = getFamily(familyId);
      if (family?.modeAllowlist.includes(mode)) {
        return {
          familyId,
          placeholders: { player: seatName(event.actor), count: pattern.sampleSize },
        };
      }
    }
  }

  return null;
}

export function selectCommentary(input: CommentaryDirectorInput): CommentarySelection {
  const { state, event, memory: memoryIn, cooldowns: cooldownsIn } = input;
  let cooldowns = advanceEventIndex(cooldownsIn);

  // Always update memory — patterns and threads accumulate evidence whether
  // or not anything gets said about this particular event.
  const { threads, peakDeficit } = updateThreads(memoryIn.threads, event, state.board, memoryIn.peakDeficit);
  const patterns = updatePatterns(memoryIn.patterns, event, new Date().toISOString());
  let memory: CommentaryMemory = { ...memoryIn, threads, patterns, peakDeficit };

  const pbpCandidate = resolvePbp(event, state.match.targetScore);

  if (!pbpCandidate) {
    return {
      suppressed: true,
      suppressionReason: "routine_event",
      activeNarrativeThreads: threads,
      nextMemory: { ...memory, lastPbpIntensity: null },
      nextCooldowns: cooldowns,
    };
  }

  const family = getFamily(pbpCandidate.familyId);
  if (!family || !family.modeAllowlist.includes(state.mode)) {
    return {
      suppressed: true,
      suppressionReason: "mode_density",
      activeNarrativeThreads: threads,
      nextMemory: { ...memory, lastPbpIntensity: null },
      nextCooldowns: cooldowns,
    };
  }

  if (isOnCooldown(cooldowns, family.cooldownGroup)) {
    return {
      suppressed: true,
      suppressionReason: "cooldown",
      activeNarrativeThreads: threads,
      nextMemory: { ...memory, lastPbpIntensity: null },
      nextCooldowns: cooldowns,
    };
  }

  const factors = boardConsequenceFactors(event.beforeBoard, event.afterBoard, state.match.targetScore);
  const intensity = escalateIntensity(family.intensityLevel, factors);
  const line = render(family, state.mode, pbpCandidate.placeholders);
  if (!line) {
    return {
      suppressed: true,
      suppressionReason: "mode_density",
      activeNarrativeThreads: threads,
      nextMemory: { ...memory, lastPbpIntensity: null },
      nextCooldowns: cooldowns,
    };
  }

  cooldowns = recordFire(cooldowns, family.cooldownGroup);

  const primary: CommentaryPrimary = {
    familyId: family.familyId,
    role: family.role === "booth_exchange" ? "booth_exchange" : "play_by_play",
    intensity,
    timeLens: "present",
    line,
  };

  let followUp: CommentaryFollowUp | undefined;

  // Gated on the FAMILY actually selected, not just event type + final
  // intensity: intensity can reach 4 on an ordinary hand purely through
  // board-consequence escalation (a big swing near the finish line), which
  // must not trigger the "hands like that are why players remember
  // cribbage for years" ceremony — that claim is only true for the two
  // genuinely rare-hand families.
  const isRareHandFamily = family.familyId === "PBP-38" || family.familyId === "PBP-39";
  const needsSpace = intensity === 4 && !isRareHandFamily && event.type !== "game_won";

  if (!needsSpace) {
    if (event.type === "game_won") {
      const closingFamily = requireFamily("BX-12");
      if (closingFamily.modeAllowlist.includes(state.mode) && !isOnCooldown(cooldowns, closingFamily.cooldownGroup)) {
        const winner = event.actor!;
        const loser = opponentSeat(winner);
        const closingLine = render(closingFamily, state.mode, {
          player: seatName(winner),
          winnerScore: scoreOf(event.afterBoard, winner),
          loserScore: scoreOf(event.afterBoard, loser),
        });
        if (closingLine) {
          cooldowns = recordFire(cooldowns, closingFamily.cooldownGroup);
          followUp = { familyId: "BX-12", role: "booth_exchange", delayMs: 600, line: closingLine };
        }
      }
    } else if (isRareHandFamily) {
      // Rare-hand ceremony: PBP gets a pause, then CLR-40 provides the one
      // permitted follow-up (this is the taxonomy's explicit ceremonial
      // exception to "intensity-4 PBP suppresses ordinary color").
      const ceremonyFamily = getFamily("CLR-40");
      if (ceremonyFamily?.modeAllowlist.includes(state.mode) && !isOnCooldown(cooldowns, ceremonyFamily.cooldownGroup)) {
        const ceremonyLine = render(ceremonyFamily, state.mode, {});
        if (ceremonyLine) {
          cooldowns = recordFire(cooldowns, ceremonyFamily.cooldownGroup);
          followUp = { familyId: "CLR-40", role: "color", delayMs: 1000, line: ceremonyLine };
        }
      }
    } else {
      const colorCandidate = resolveColor(input, event, memory);
      if (colorCandidate) {
        const colorFamily = getFamily(colorCandidate.familyId);
        if (colorFamily && !isOnCooldown(cooldowns, colorFamily.cooldownGroup)) {
          const colorLine = render(colorFamily, state.mode, colorCandidate.placeholders);
          if (colorLine) {
            cooldowns = recordFire(cooldowns, colorFamily.cooldownGroup);
            followUp = { familyId: colorFamily.familyId, role: "color", delayMs: 400, line: colorLine };
          }
        }
      }
    }
  }

  memory = { ...memory, lastPbpIntensity: intensity };

  return {
    primary,
    followUp,
    suppressed: false,
    activeNarrativeThreads: threads,
    nextMemory: memory,
    nextCooldowns: cooldowns,
  };
}
