import type { Intensity, Seat } from "./types.js";

export interface BoardConsequenceFactors {
  readonly leadChanged: boolean;
  readonly finishLine: boolean;
  readonly bigSwing: boolean;
}

export function leaderOf(board: { readonly northScore: number; readonly southScore: number }): Seat | "tied" {
  if (board.northScore === board.southScore) return "tied";
  return board.northScore > board.southScore ? "north" : "south";
}

export function marginOf(board: { readonly northScore: number; readonly southScore: number }): number {
  return Math.abs(board.northScore - board.southScore);
}

export function distanceToWin(score: number, targetScore: number): number {
  return Math.max(0, targetScore - score);
}

export function isFinishLine(distance: number): boolean {
  return distance <= 5;
}

export function boardConsequenceFactors(
  before: { readonly northScore: number; readonly southScore: number },
  after: { readonly northScore: number; readonly southScore: number },
  targetScore: number
): BoardConsequenceFactors {
  const leaderBefore = leaderOf(before);
  const leaderAfter = leaderOf(after);
  const leadChanged = leaderBefore !== leaderAfter && leaderAfter !== "tied";

  const nearestDistanceAfter = Math.min(
    distanceToWin(after.northScore, targetScore),
    distanceToWin(after.southScore, targetScore)
  );

  const marginBefore = marginOf(before);
  const marginAfter = marginOf(after);
  const bigSwing = Math.abs(marginAfter - marginBefore) >= 8;

  return { leadChanged, finishLine: isFinishLine(nearestDistanceAfter), bigSwing };
}

/**
 * Escalates a family's static base intensity when the same event type
 * carries extra board weight this time — "the same event has materially
 * different wording and density" is handled by mode/tier selection, but
 * intensity itself must also flex with consequence, not just event type.
 * Never escalates above 4, and never invents rarity a family didn't already
 * declare (routine card calls stay routine even during a tight finish).
 */
export function escalateIntensity(base: Intensity, factors: BoardConsequenceFactors): Intensity {
  let level = base as number;
  if (factors.leadChanged) level += 1;
  if (factors.finishLine) level += 1;
  if (factors.bigSwing) level += 1;
  return Math.min(4, level) as Intensity;
}
