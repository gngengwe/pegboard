import {
  type Card,
  type CardId,
  pipValue,
  scoreFifteens,
  scorePairs,
  scoreRuns,
} from "@pegboard/engine";

/** Sum of fifteens/pairs/runs among just these cards — no starter, no crib model. */
function selfScore(cards: readonly Card[]): number {
  const entries = [...scoreFifteens(cards), ...scorePairs(cards), ...scoreRuns(cards)];
  return entries.reduce((sum, e) => sum + e.points, 0);
}

function combinations2<T>(items: readonly T[]): [T, T][] {
  const pairs: [T, T][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      pairs.push([items[i], items[j]]);
    }
  }
  return pairs;
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Rookie-tier discard: ranks every possible 2-card discard by the retained
 * hand's own score (no crib model, no starter foresight — a real beginner's
 * shortcut), then usually — but not always — takes the best of the bunch.
 * That occasional near-miss is the "plausible mistake" the spec calls for.
 */
export function chooseBeginnerDiscard(hand: readonly Card[]): [CardId, CardId] {
  const discardOptions = combinations2(hand);
  const ranked = discardOptions
    .map(([a, b]) => {
      const kept = hand.filter((c) => c.id !== a.id && c.id !== b.id);
      // No starter, no crib/opponent model — just "how good do these 4 look
      // on their own," which is exactly the naive shortcut a beginner takes.
      return { discard: [a.id, b.id] as [CardId, CardId], total: selfScore(kept) };
    })
    .sort((x, y) => y.total - x.total);

  const topChoices = ranked.slice(0, Math.min(3, ranked.length));
  return pickRandom(topChoices).discard;
}

/**
 * Rookie-tier pegging: take obvious points (fifteen/thirty-one/pair) when
 * available, otherwise play low to stay safe, otherwise play whatever's legal.
 */
export function chooseBeginnerPlay(
  legalCards: readonly Card[],
  runningCount: number
): CardId {
  const scoring = legalCards.find(
    (c) => runningCount + pipValue(c.rank) === 15 || runningCount + pipValue(c.rank) === 31
  );
  if (scoring) return scoring.id;

  const lowest = [...legalCards].sort((a, b) => pipValue(a.rank) - pipValue(b.rank))[0];
  return lowest.id;
}
