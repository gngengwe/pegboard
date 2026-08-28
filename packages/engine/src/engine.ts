import { type Card, type CardId, createDeck, findCard } from "./card.js";
import { canPlay, peggingTotal, scorePeggingPlay } from "./pegging.js";
import { type RandomSource, SecureRandomSource, SeededRandomSource, shuffle } from "./rng.js";
import { scoreHand, scoreHisHeels } from "./scoring.js";
import {
  type GameEvent,
  type GamePhase,
  type PlayerId,
  type PlayerProjection,
  opponentOf,
} from "./types.js";

export interface CribbageGameOptions {
  /** Points needed to win. 61 for Quick Jam, 121 for Classic. */
  readonly targetScore?: number;
  /** Deterministic seed for golden tests/replays. Omit for a real, secure shuffle. */
  readonly seed?: number;
}

function removeCard(hand: Card[], id: CardId): Card {
  const index = hand.findIndex((c) => c.id === id);
  if (index === -1) {
    throw new Error(`Card ${id} is not available to play from this hand.`);
  }
  return hand.splice(index, 1)[0];
}

export class CribbageGame {
  private readonly targetScore: number;
  private readonly rng: RandomSource;
  private events: GameEvent[] = [];

  private phase_: GamePhase = "GAME_CREATED";
  private dealer: PlayerId = "north";
  private pone: PlayerId = "south";
  private deck: Card[] = [];
  private hands: Record<PlayerId, Card[]> = { north: [], south: [] };
  private toPlay: Record<PlayerId, Card[]> = { north: [], south: [] };
  private crib: Card[] = [];
  private starter: Card | null = null;
  private scores: Record<PlayerId, number> = { north: 0, south: 0 };
  private runningCount = 0;
  private pegStack: Card[] = [];
  private turnPlayer_: PlayerId | null = null;
  private winner_: PlayerId | null = null;

  constructor(options: CribbageGameOptions = {}) {
    this.targetScore = options.targetScore ?? 121;
    this.rng = options.seed !== undefined ? new SeededRandomSource(options.seed) : new SecureRandomSource();
  }

  get phase(): GamePhase {
    return this.phase_;
  }

  get turnPlayer(): PlayerId | null {
    return this.turnPlayer_;
  }

  get winner(): PlayerId | null {
    return this.winner_;
  }

  getScores(): Record<PlayerId, number> {
    return { ...this.scores };
  }

  private emit(event: GameEvent): void {
    this.events.push(event);
  }

  private drain(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private applyScore(player: PlayerId, points: number): void {
    if (points <= 0 || this.winner_) return;
    this.scores[player] += points;
    this.emit({ type: "ScoreUpdated", player, total: this.scores[player], delta: points });
    if (this.scores[player] >= this.targetScore) {
      this.winner_ = player;
      this.phase_ = "GAME_COMPLETE";
      this.turnPlayer_ = null;
      this.emit({ type: "GameWon", player, finalScore: { ...this.scores } });
    }
  }

  /** Shuffles, deals 6 cards to each seat, and opens the discard phase. */
  private dealHand(): void {
    this.deck = shuffle(createDeck(), this.rng);
    this.hands = {
      north: this.deck.splice(0, 6),
      south: this.deck.splice(0, 6),
    };
    this.crib = [];
    this.starter = null;
    this.pegStack = [];
    this.runningCount = 0;
    this.turnPlayer_ = null;
    this.phase_ = "DISCARD_TO_CRIB";
    this.emit({
      type: "HandDealt",
      dealer: this.dealer,
      handSizes: { north: this.hands.north.length, south: this.hands.south.length },
    });
  }

  /** Starts the game: picks the first dealer and deals the opening hand. */
  start(): GameEvent[] {
    this.dealer = this.rng.next() < 0.5 ? "north" : "south";
    this.pone = opponentOf(this.dealer);
    this.emit({ type: "GameStarted", targetScore: this.targetScore, dealer: this.dealer, pone: this.pone });
    this.dealHand();
    return this.drain();
  }

  getLegalPlays(player: PlayerId): CardId[] {
    if (this.phase_ !== "PEGGING" || this.turnPlayer_ !== player) return [];
    return this.toPlay[player].filter((c) => canPlay(c, this.runningCount)).map((c) => c.id);
  }

  discard(player: PlayerId, cards: readonly [CardId, CardId]): GameEvent[] {
    if (this.phase_ !== "DISCARD_TO_CRIB") {
      throw new Error(`Cannot discard during phase ${this.phase_}.`);
    }
    if (this.hands[player].length !== 6) {
      throw new Error(`${player} has already discarded this hand.`);
    }
    const [a, b] = cards;
    if (a === b) throw new Error("Cannot discard the same card twice.");

    // Validate both ids exist before mutating either — `removeCard` splices
    // its target out immediately, so removing one before checking the other
    // would silently drop a valid card from the game if the second id turned
    // out to be invalid (the thrown error left no way to put it back).
    const hand = this.hands[player];
    if (!findCard(hand, a)) throw new Error(`${player} does not have ${a} to discard.`);
    if (!findCard(hand, b)) throw new Error(`${player} does not have ${b} to discard.`);

    const discarded = [removeCard(hand, a), removeCard(hand, b)];
    this.crib.push(...discarded);
    this.emit({ type: "CardsDiscarded", player, cards: [a, b] });

    if (this.hands.north.length === 4 && this.hands.south.length === 4) {
      this.revealStarterAndOpenPegging();
    }
    return this.drain();
  }

  private revealStarterAndOpenPegging(): void {
    const starter = this.deck.shift();
    if (!starter) throw new Error("Deck exhausted before the starter could be cut.");
    this.starter = starter;
    this.emit({ type: "StarterRevealed", card: starter.id });

    const heels = scoreHisHeels(starter);
    if (heels.length > 0) {
      this.emit({ type: "HisHeels", dealer: this.dealer, points: heels[0].points });
      this.applyScore(this.dealer, heels[0].points);
      if (this.winner_) return;
    }

    this.phase_ = "PEGGING";
    this.toPlay = { north: [...this.hands.north], south: [...this.hands.south] };
    this.turnPlayer_ = this.pone;
  }

  playCard(player: PlayerId, cardId: CardId): GameEvent[] {
    if (this.phase_ !== "PEGGING") throw new Error(`Cannot play a card during phase ${this.phase_}.`);
    if (this.turnPlayer_ !== player) throw new Error(`It is not ${player}'s turn.`);

    const card = findCard(this.toPlay[player], cardId);
    if (!card) throw new Error(`${player} does not have ${cardId} left to play.`);
    if (!canPlay(card, this.runningCount)) {
      throw new Error(`Playing ${cardId} would exceed 31 (count is ${this.runningCount}).`);
    }

    removeCard(this.toPlay[player], cardId);
    this.pegStack.push(card);
    this.runningCount = peggingTotal(this.pegStack);

    const entries = scorePeggingPlay(this.pegStack);
    const pointsScored = entries.reduce((sum, e) => sum + e.points, 0);
    this.emit({
      type: "CardPlayed",
      player,
      card: cardId,
      runningCount: this.runningCount,
      entries,
      pointsScored,
    });
    this.applyScore(player, pointsScored);
    if (this.winner_) return this.drain();

    if (this.runningCount === 31) {
      this.emit({ type: "SegmentEnded", lastPlayer: player, points: 0, reachedThirtyOne: true });
      this.resetSegment(opponentOf(player));
    } else {
      this.advanceTurn(player);
    }
    return this.drain();
  }

  /** After a non-31 play, hands the turn to whoever can legally act next, auto-resolving any "go". */
  private advanceTurn(lastPlayer: PlayerId): void {
    const opponent = opponentOf(lastPlayer);
    if (this.canAct(opponent)) {
      this.turnPlayer_ = opponent;
      return;
    }

    this.emit({
      type: "Go",
      player: opponent,
      reason: this.toPlay[opponent].length === 0 ? "hand-empty" : "no-legal-card",
    });

    if (this.canAct(lastPlayer)) {
      this.turnPlayer_ = lastPlayer;
      return;
    }

    // Neither seat can play: the last card played earns the go point, and the segment resets.
    this.emit({ type: "SegmentEnded", lastPlayer, points: 1, reachedThirtyOne: false });
    this.applyScore(lastPlayer, 1);
    if (this.winner_) return;
    this.resetSegment(opponentOf(lastPlayer));
  }

  private canAct(player: PlayerId): boolean {
    return this.toPlay[player].some((c) => canPlay(c, this.runningCount));
  }

  private resetSegment(preferredLeader: PlayerId): void {
    this.pegStack = [];
    this.runningCount = 0;

    if (this.toPlay.north.length === 0 && this.toPlay.south.length === 0) {
      this.turnPlayer_ = null;
      this.emit({ type: "PeggingComplete" });
      this.runCounting();
      return;
    }

    this.turnPlayer_ = this.toPlay[preferredLeader].length > 0 ? preferredLeader : opponentOf(preferredLeader);
  }

  private runCounting(): void {
    this.phase_ = "COUNTING";
    const starter = this.starter;
    if (!starter) throw new Error("Cannot count without a revealed starter.");

    const order: { player: PlayerId; source: "hand" | "crib"; cards: Card[]; isCrib: boolean }[] = [
      { player: this.pone, source: "hand", cards: this.hands[this.pone], isCrib: false },
      { player: this.dealer, source: "hand", cards: this.hands[this.dealer], isCrib: false },
      { player: this.dealer, source: "crib", cards: this.crib, isCrib: true },
    ];

    for (const step of order) {
      const { total, entries } = scoreHand(step.cards, starter, step.isCrib);
      this.emit({ type: "HandScored", player: step.player, source: step.source, entries, points: total });
      this.applyScore(step.player, total);
      if (this.winner_) return;
    }

    const nextDealer = opponentOf(this.dealer);
    this.emit({ type: "HandComplete", nextDealer });
    this.dealer = nextDealer;
    this.pone = opponentOf(this.dealer);
    this.dealHand();
  }

  getProjection(forPlayer?: PlayerId): PlayerProjection {
    return {
      phase: this.phase_,
      dealer: this.dealer,
      pone: this.pone,
      scores: this.getScores(),
      targetScore: this.targetScore,
      ownHand: forPlayer ? [...this.hands[forPlayer]] : null,
      remainingToPlay:
        forPlayer && this.phase_ === "PEGGING" ? [...this.toPlay[forPlayer]] : null,
      opponentHandSize: forPlayer ? this.hands[opponentOf(forPlayer)].length : 0,
      starter: this.starter,
      runningCount: this.runningCount,
      pegStack: [...this.pegStack],
      turnPlayer: this.turnPlayer_,
      legalPlays: forPlayer ? this.getLegalPlays(forPlayer) : [],
      winner: this.winner_,
    };
  }
}
