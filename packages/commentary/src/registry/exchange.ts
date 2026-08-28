import type { ContentFamily } from "../types.js";

/**
 * Booth-exchange families. Several BX/ARC exchange rows in the taxonomy are
 * *structural* patterns rather than distinct spoken content — "PBP line only"
 * (BX-10) or "PBP call -> Color board consequence" (BX-01/ARC-18) describe how
 * the director composes an existing PBP family with an existing color family,
 * not a new line of text. Those are realized directly in `director.ts`'s
 * selection algorithm (attach-a-follow-up vs. stay-silent), not registered
 * here. Only families with their own genuinely distinct text are registered:
 *
 * - BX-01 supplies the actual "exact board consequence" text color reaches
 *   for first (selection-algorithm priority #1) when no more specific color
 *   family (pattern, objective, decision-quality) applies.
 * - BX-12 supplies the match-end "closing thought" that follows the win call.
 */
export const EXCHANGE_FAMILIES: readonly ContentFamily[] = [
  {
    familyId: "BX-01",
    role: "color",
    grade: "A",
    phases: ["pegging", "counting", "crib"],
    modeAllowlist: ["broadcast", "arcade", "learn", "expert"],
    intensityLevel: 2,
    cooldownGroup: "board_consequence",
    requiredPublicFacts: ["lead_change", "afterScore"],
    allowedPlaceholders: ["player", "afterScore"],
    forbiddenInferences: [],
    variants: [
      { tier: "clean", text: "[player] now controls the board at [afterScore]." },
      { tier: "arcade", text: "[player] takes over the board!" },
      { tier: "learn", text: "That gives [player] the lead on the scoreboard." },
    ],
  },
  {
    familyId: "BX-12",
    role: "booth_exchange",
    grade: "A",
    phases: ["match_end"],
    modeAllowlist: ["broadcast", "arcade", "learn", "expert", "kids"],
    intensityLevel: 4,
    cooldownGroup: "match_end_color",
    requiredPublicFacts: ["winner", "final_score"],
    allowedPlaceholders: ["player", "winnerScore", "loserScore"],
    forbiddenInferences: [],
    variants: [
      { tier: "clean", text: "Final score, [winnerScore] to [loserScore]. Good game." },
      { tier: "arcade", text: "Final: [winnerScore]–[loserScore]. That's a wrap." },
      { tier: "learn", text: "The match ends [winnerScore] to [loserScore]." },
      { tier: "kids", text: "Great match! Final score was [winnerScore] to [loserScore]." },
    ],
  },
];
