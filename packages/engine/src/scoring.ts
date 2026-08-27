import { type Card, pipValue, rankValue } from "./card.js";

export type ScoreType = "fifteen" | "pair" | "run" | "flush" | "nobs" | "heels";

export interface ScoreEntry {
  readonly type: ScoreType;
  readonly points: number;
  readonly cards: readonly Card[];
  readonly label: string;
}

export interface HandScore {
  readonly total: number;
  readonly entries: readonly ScoreEntry[];
}

function combinations<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (size > items.length) return [];
  const [first, ...rest] = items;
  const withFirst = combinations(rest, size - 1).map((c) => [first, ...c]);
  const withoutFirst = combinations(rest, size);
  return [...withFirst, ...withoutFirst];
}

/** All subsets (size 2+) of the five cards summing to exactly 15. 2 points each. */
export function scoreFifteens(cards: readonly Card[]): ScoreEntry[] {
  const entries: ScoreEntry[] = [];
  for (let size = 2; size <= cards.length; size++) {
    for (const combo of combinations(cards, size)) {
      const sum = combo.reduce((acc, c) => acc + pipValue(c.rank), 0);
      if (sum === 15) {
        entries.push({ type: "fifteen", points: 2, cards: combo, label: "Fifteen for two" });
      }
    }
  }
  return entries;
}

/** Every same-rank pair among the five cards. 2 / 6 / 12 points depending on group size. */
export function scorePairs(cards: readonly Card[]): ScoreEntry[] {
  const entries: ScoreEntry[] = [];
  const byRank = new Map<string, Card[]>();
  for (const card of cards) {
    const group = byRank.get(card.rank) ?? [];
    group.push(card);
    byRank.set(card.rank, group);
  }
  for (const group of byRank.values()) {
    if (group.length < 2) continue;
    for (const pair of combinations(group, 2)) {
      entries.push({ type: "pair", points: 2, cards: pair, label: "Pair for two" });
    }
  }
  return entries;
}

/** The single longest run of consecutive distinct ranks (length 3+) among the five cards. */
export function scoreRuns(cards: readonly Card[]): ScoreEntry[] {
  const byRankValue = new Map<number, Card[]>();
  for (const card of cards) {
    const value = rankValue(card.rank);
    const group = byRankValue.get(value) ?? [];
    group.push(card);
    byRankValue.set(value, group);
  }
  const distinctValues = [...byRankValue.keys()].sort((a, b) => a - b);

  let bestRun: number[] = [];
  let current: number[] = [];
  for (const value of distinctValues) {
    if (current.length === 0 || value === current[current.length - 1] + 1) {
      current.push(value);
    } else {
      if (current.length > bestRun.length) bestRun = current;
      current = [value];
    }
  }
  if (current.length > bestRun.length) bestRun = current;

  if (bestRun.length < 3) return [];

  const groupsInRun = bestRun.map((value) => byRankValue.get(value)!);
  const combos: Card[][] = groupsInRun.reduce<Card[][]>(
    (acc, group) => acc.flatMap((prefix) => group.map((card) => [...prefix, card])),
    [[]]
  );

  return combos.map((combo) => ({
    type: "run" as const,
    points: bestRun.length,
    cards: combo,
    label: `Run of ${bestRun.length}`,
  }));
}

/**
 * Flush points. A hand needs only its 4 cards to share a suit (4, or 5 with a
 * matching starter). A crib needs all 5 — starter included — or it scores 0.
 */
export function scoreFlush(
  handCards: readonly Card[],
  starter: Card,
  isCrib: boolean
): ScoreEntry[] {
  const suit = handCards[0]?.suit;
  const handIsFlush = suit !== undefined && handCards.every((c) => c.suit === suit);
  if (!handIsFlush) return [];

  const starterMatches = starter.suit === suit;
  if (isCrib) {
    return starterMatches
      ? [{ type: "flush", points: 5, cards: [...handCards, starter], label: "Five-card flush" }]
      : [];
  }
  return starterMatches
    ? [{ type: "flush", points: 5, cards: [...handCards, starter], label: "Five-card flush" }]
    : [{ type: "flush", points: 4, cards: handCards, label: "Four-card flush" }];
}

/** His nobs: the hand holds the jack matching the starter's suit. 1 point. */
export function scoreNobs(handCards: readonly Card[], starter: Card): ScoreEntry[] {
  const nobs = handCards.find((c) => c.rank === "J" && c.suit === starter.suit);
  return nobs ? [{ type: "nobs", points: 1, cards: [nobs], label: "His nobs" }] : [];
}

/** His heels: the starter itself is a jack. 2 points to the dealer, awarded on the cut. */
export function scoreHisHeels(starter: Card): ScoreEntry[] {
  return starter.rank === "J"
    ? [{ type: "heels", points: 2, cards: [starter], label: "His heels" }]
    : [];
}

/**
 * Full hand/crib count: fifteens + pairs + runs + flush + nobs.
 * `handCards` is the 4-card hand or 4-card crib; `starter` is the shared cut card.
 */
export function scoreHand(
  handCards: readonly Card[],
  starter: Card,
  isCrib: boolean
): HandScore {
  const all = [...handCards, starter];
  const entries = [
    ...scoreFifteens(all),
    ...scorePairs(all),
    ...scoreRuns(all),
    ...scoreFlush(handCards, starter, isCrib),
    ...scoreNobs(handCards, starter),
  ];
  const total = entries.reduce((sum, e) => sum + e.points, 0);
  return { total, entries };
}
