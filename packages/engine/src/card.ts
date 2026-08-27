export type Suit = "clubs" | "diamonds" | "hearts" | "spades";

export type Rank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

export const RANKS: readonly Rank[] = [
  "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K",
];

export const SUITS: readonly Suit[] = ["clubs", "diamonds", "hearts", "spades"];

/** Unique, stable identifier for a card — e.g. "10-hearts", "J-spades". */
export type CardId = string;

export interface Card {
  readonly id: CardId;
  readonly rank: Rank;
  readonly suit: Suit;
}

export function cardId(rank: Rank, suit: Suit): CardId {
  return `${rank}-${suit}`;
}

/** Point value for fifteens/thirty-one/hand totals: A=1, 2-10 face value, J/Q/K=10. */
export function pipValue(rank: Rank): number {
  if (rank === "A") return 1;
  if (rank === "J" || rank === "Q" || rank === "K") return 10;
  return Number(rank);
}

/** Ordinal value for runs: A=1 ... K=13. */
export function rankValue(rank: Rank): number {
  const index = RANKS.indexOf(rank);
  return index + 1;
}

/** Builds a full, canonically-ordered 52-card deck. Shuffle separately. */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: cardId(rank, suit), rank, suit });
    }
  }
  return deck;
}

export function findCard(cards: readonly Card[], id: CardId): Card | undefined {
  return cards.find((c) => c.id === id);
}
