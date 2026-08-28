import type { CommentaryCooldowns } from "./types.js";

/**
 * Minimum number of processed events between two firings of the same
 * cooldown group, where `isOnCooldown` blocks whenever
 * `currentEventIndex - lastFired < minGap`. Because the event index always
 * advances by exactly 1 between any two distinct director calls, a value of
 * `1` can *never* actually block anything (the gap between two calls is
 * always >= 1) — it's `0` in disguise. Real spacing needs `2+` (blocks the
 * very next event) or higher.
 *
 * `0` means "no cooldown needed." That covers both rarity-gated families
 * (taxonomy: rare hands don't need spacing because rarity already gates
 * them) AND ordinary distinct scoring calls — a second pair-for-two a few
 * plays after the first is still newsworthy on its own, not "repetition."
 * Cooldowns exist for things that would get genuinely repetitive if voiced
 * every single time: finish-line reminders, count-control door-slams,
 * strategic-objective reminders, pattern callbacks, decision-quality asides.
 *
 * These are a deliberately simple event-count approximation of the richer
 * "once per hand" / "until margin changes" rules described in the taxonomy;
 * the more nuanced versions (hand-scoped, margin-delta-scoped) are handled
 * directly in `director.ts` where the relevant context is already at hand.
 */
const DEFAULT_MIN_GAP: Readonly<Record<string, number>> = {
  starter_reveal: 0,
  his_heels: 0,
  card_call: 2,
  scoring_call: 0,
  rare_pegging: 0,
  go_call: 0,
  board_race: 0,
  finish_line: 2,
  count_open: 0,
  hand_total: 0,
  big_hand: 0,
  count_control_call: 3,
  match_end: 0,
  match_end_color: 0,
  objective: 4,
  comeback: 3,
  pattern_callback: 4,
  decision_quality: 2,
  board_consequence: 0,
  rare_hand: 0,
  rare_hand_color: 0,
};

export function minGapFor(cooldownGroup: string): number {
  if (cooldownGroup in DEFAULT_MIN_GAP) return DEFAULT_MIN_GAP[cooldownGroup];
  // Fail loudly rather than silently: falling back to `1` would be exactly
  // the dead-no-op value this file's own comment warns about (the gap
  // between any two distinct calls is always >= 1, so minGap=1 can never
  // actually block anything). A family registered with a cooldown group
  // that has no table entry — new or misspelled — is an authoring bug that
  // should surface immediately, not silently ship with no real cooldown.
  throw new Error(
    `No cooldown spacing configured for group "${cooldownGroup}". Add it to DEFAULT_MIN_GAP in cooldowns.ts.`
  );
}

export function isOnCooldown(cooldowns: CommentaryCooldowns, cooldownGroup: string): boolean {
  const lastFired = cooldowns.lastFiredAt[cooldownGroup];
  if (lastFired === undefined) return false;
  return cooldowns.currentEventIndex - lastFired < minGapFor(cooldownGroup);
}

export function recordFire(
  cooldowns: CommentaryCooldowns,
  cooldownGroup: string
): CommentaryCooldowns {
  return {
    ...cooldowns,
    lastFiredAt: { ...cooldowns.lastFiredAt, [cooldownGroup]: cooldowns.currentEventIndex },
  };
}

export function advanceEventIndex(cooldowns: CommentaryCooldowns): CommentaryCooldowns {
  return { ...cooldowns, currentEventIndex: cooldowns.currentEventIndex + 1 };
}
