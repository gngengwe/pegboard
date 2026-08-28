import type { ContentFamily } from "../types.js";

/**
 * Color families. Every family here either (a) needs no analysis input at
 * all — pure public board/score facts — or (b) requires `ApprovedPublicAnalysis`
 * and is simply unreachable until a strategy-analysis service exists upstream
 * (registered now so the registry/placeholder tests pass and wiring it up
 * later is a pure addition, not a rewrite).
 *
 * ARC-22 (pattern-evidence suppression) is intentionally NOT registered here:
 * per the taxonomy it has no spoken line ("No tendency call") — it is realized
 * directly as `suppressionReason: "insufficient_pattern_evidence"` in the
 * director's output rather than as renderable content.
 */
export const COLOR_FAMILIES: readonly ContentFamily[] = [
  {
    // ARC-10: present+future strategic objective, pure public board math.
    familyId: "ARC-10",
    role: "color",
    grade: "A",
    phases: ["pegging", "counting", "crib"],
    modeAllowlist: ["broadcast", "arcade", "learn", "expert"],
    intensityLevel: 2,
    cooldownGroup: "objective",
    requiredPublicFacts: ["distance_to_win", "dealer", "phase"],
    allowedPlaceholders: [],
    forbiddenInferences: ["specific_card", "specific_discard", "guaranteed_result"],
    variants: [
      { tier: "clean", text: "The next job is simple: get to the line before the count comes back around." },
      { tier: "arcade", text: "Next job: get to the line before the count comes back around." },
      { tier: "learn", text: "From here, the plan is just to keep scoring cleanly toward the target." },
      { tier: "expert", text: "Board math favors closing the distance before the count order turns over again." },
    ],
  },
  {
    // ARC-11: endgame distance makes one clean point worth more than a pretty hand.
    familyId: "ARC-11",
    role: "color",
    grade: "A",
    phases: ["pegging", "counting", "crib"],
    modeAllowlist: ["broadcast", "arcade", "learn", "expert"],
    intensityLevel: 2,
    cooldownGroup: "objective",
    requiredPublicFacts: ["distance_to_win"],
    allowedPlaceholders: ["distance"],
    forbiddenInferences: ["specific_card", "specific_discard", "guaranteed_result"],
    variants: [
      { tier: "clean", text: "At [distance] out, one clean pegging point can matter more than a pretty hand." },
      { tier: "arcade", text: "This close, one clean point can be worth more than a pretty hand." },
      { tier: "learn", text: "When you're this close to winning, small safe points matter more than big risky ones." },
    ],
  },
  {
    // ARC-13: a modest score carries outsized board-state leverage.
    familyId: "ARC-13",
    role: "color",
    grade: "A",
    phases: ["pegging", "counting", "crib"],
    modeAllowlist: ["broadcast", "arcade", "expert"],
    intensityLevel: 2,
    cooldownGroup: "objective",
    requiredPublicFacts: ["points", "lead_change"],
    allowedPlaceholders: ["points"],
    forbiddenInferences: ["specific_card"],
    variants: [
      { tier: "clean", text: "It's only [points], but that may be the most expensive [points] on the board." },
      { tier: "arcade", text: "Only [points] — but that might be the biggest [points] of the match." },
      { tier: "expert", text: "Small point total, large leverage — that changes who dictates the next hand." },
    ],
  },
  {
    // ARC-15: a verified comeback spanning multiple phases (tied to the
    // `comeback` narrative thread rather than a single-event margin shrink).
    familyId: "ARC-15",
    role: "color",
    grade: "A",
    phases: ["pegging", "counting", "crib"],
    modeAllowlist: ["broadcast", "arcade", "expert"],
    intensityLevel: 3,
    cooldownGroup: "comeback",
    requiredPublicFacts: ["prior_deficit", "current_deficit"],
    allowedPlaceholders: ["priorDeficit", "currentDeficit"],
    forbiddenInferences: ["momentum_changed_odds"],
    variants: [
      { tier: "clean", text: "Down [priorDeficit], now down [currentDeficit] — the comeback has real shape." },
      { tier: "arcade", text: "Down [priorDeficit], now down [currentDeficit] — this comeback has teeth." },
      { tier: "expert", text: "The deficit has closed from [priorDeficit] to [currentDeficit] across multiple hands." },
    ],
  },
  {
    // CLR-33: a single-event version of comeback context (smaller bar than ARC-15).
    familyId: "CLR-33",
    role: "color",
    grade: "A",
    phases: ["pegging", "counting", "crib"],
    modeAllowlist: ["broadcast", "arcade", "learn", "expert"],
    intensityLevel: 2,
    cooldownGroup: "comeback",
    requiredPublicFacts: ["prior_margin", "new_margin"],
    allowedPlaceholders: ["margin"],
    forbiddenInferences: ["momentum_changed_odds"],
    variants: [
      { tier: "clean", text: "That's no longer theoretical — the gap is down to [margin]." },
      { tier: "arcade", text: "Now it's real — down to just [margin]." },
      { tier: "learn", text: "The score gap shrank to [margin] points — this game is getting close." },
    ],
  },
  {
    // ARC-07: a public tactical pattern has repeated within this match.
    familyId: "ARC-07",
    role: "color",
    grade: "A",
    phases: ["pegging"],
    modeAllowlist: ["broadcast", "arcade", "expert"],
    intensityLevel: 2,
    cooldownGroup: "pattern_callback",
    requiredPublicFacts: ["pattern_sample_size_soft"],
    allowedPlaceholders: ["player", "count"],
    forbiddenInferences: ["personality", "emotion", "intelligence"],
    variants: [
      { tier: "clean", text: "That's [count] times this match [player] has chosen the quiet lane over the flashy one." },
      { tier: "arcade", text: "Another one — [player] keeps taking the quiet lane." },
      { tier: "expert", text: "Match-local sample of [count] shows a repeated preference for the safer count." },
    ],
  },
  {
    // ARC-08: current action matches an evidenced tendency (medium/high confidence).
    familyId: "ARC-08",
    role: "color",
    grade: "A",
    phases: ["pegging", "counting", "crib"],
    modeAllowlist: ["broadcast", "arcade", "expert"],
    intensityLevel: 2,
    cooldownGroup: "pattern_callback",
    requiredPublicFacts: ["pattern_sample_size_strong"],
    allowedPlaceholders: ["player", "count"],
    forbiddenInferences: ["personality", "emotion", "intelligence"],
    variants: [
      { tier: "clean", text: "That has been the pattern from [player] all match: protect the board, then make them chase." },
      { tier: "arcade", text: "Classic [player]: control first, chase later." },
      { tier: "expert", text: "Consistent with the observed pattern — control-first sequencing from [player]." },
    ],
  },
  {
    // CLR-40: historical/ceremonial context for a rare hand — pairs with
    // PBP-38/PBP-39 as the color half of the rare-hand exchange (ARC-18 / BX-11).
    familyId: "CLR-40",
    role: "color",
    grade: "S",
    phases: ["counting", "crib"],
    modeAllowlist: ["broadcast", "arcade", "learn", "expert", "kids"],
    intensityLevel: 4,
    cooldownGroup: "rare_hand_color",
    requiredPublicFacts: ["points"],
    allowedPlaceholders: [],
    forbiddenInferences: [],
    variants: [
      { tier: "clean", text: "Hands like that are why players remember cribbage for years." },
      { tier: "arcade", text: "That's one for the memory book." },
      { tier: "learn", text: "That kind of hand is rare — most games never see one this big." },
      { tier: "kids", text: "Wow — that's an amazing hand!" },
    ],
  },
  {
    // CLR-21/22/23/24: decision-quality lines. All four require
    // `analysis.decisionQuality` — deliberately unreachable without an
    // approved analysis input, matching "no color line fires without a
    // public factual anchor or an approved analysis output."
    familyId: "CLR-21",
    role: "color",
    grade: "A",
    phases: ["pegging", "discard", "counting", "crib"],
    modeAllowlist: ["broadcast", "arcade", "learn", "expert"],
    intensityLevel: 1,
    cooldownGroup: "decision_quality",
    requiredPublicFacts: ["decision_quality_strong", "poor_result"],
    allowedPlaceholders: [],
    forbiddenInferences: ["hidden_hand", "hidden_discard"],
    variants: [
      { tier: "clean", text: "Good idea, bad turn of the cards." },
      { tier: "arcade", text: "Good idea, bad break." },
      { tier: "learn", text: "That was a sound choice — it just didn't get a friendly card this time." },
    ],
  },
  {
    familyId: "CLR-23",
    role: "color",
    grade: "A",
    phases: ["pegging", "discard", "counting", "crib"],
    modeAllowlist: ["broadcast", "arcade", "learn", "expert"],
    intensityLevel: 1,
    cooldownGroup: "decision_quality",
    requiredPublicFacts: ["decision_quality_risky", "good_result"],
    allowedPlaceholders: [],
    forbiddenInferences: ["hidden_hand", "hidden_discard"],
    variants: [
      { tier: "clean", text: "That worked out, but it was a generous outcome." },
      { tier: "arcade", text: "It worked — but that was a gift." },
      { tier: "learn", text: "That result was better than the choice deserved, and that's alright." },
    ],
  },
  {
    familyId: "CLR-24",
    role: "color",
    grade: "A",
    phases: ["pegging", "discard", "counting", "crib"],
    modeAllowlist: ["broadcast", "arcade", "learn", "expert"],
    intensityLevel: 1,
    cooldownGroup: "decision_quality",
    requiredPublicFacts: ["decision_quality_close"],
    allowedPlaceholders: [],
    forbiddenInferences: ["hidden_hand", "hidden_discard"],
    variants: [
      { tier: "clean", text: "There wasn't much daylight between those options." },
      { tier: "arcade", text: "Razor-thin call between the two options there." },
      { tier: "learn", text: "Either choice there would have been reasonable." },
    ],
  },
];
