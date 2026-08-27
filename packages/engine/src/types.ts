import type { Card, CardId } from "./card.js";
import type { ScoreEntry } from "./scoring.js";

export type PlayerId = "north" | "south";

export type GamePhase =
  | "GAME_CREATED"
  | "DEAL"
  | "DISCARD_TO_CRIB"
  | "REVEAL_STARTER"
  | "PEGGING"
  | "COUNTING"
  | "HAND_COMPLETE"
  | "GAME_COMPLETE";

export function opponentOf(player: PlayerId): PlayerId {
  return player === "north" ? "south" : "north";
}

// ---------- commands (the only player-facing decisions) ----------

export interface DiscardCommand {
  readonly type: "DISCARD";
  readonly player: PlayerId;
  readonly cards: readonly [CardId, CardId];
}

export interface PlayCardCommand {
  readonly type: "PLAY_CARD";
  readonly player: PlayerId;
  readonly card: CardId;
}

export type Command = DiscardCommand | PlayCardCommand;

// ---------- events (everything the engine can emit) ----------

export interface GameStartedEvent {
  readonly type: "GameStarted";
  readonly targetScore: number;
  readonly dealer: PlayerId;
  readonly pone: PlayerId;
}

export interface HandDealtEvent {
  readonly type: "HandDealt";
  readonly dealer: PlayerId;
  readonly handSizes: Record<PlayerId, number>;
}

export interface CardsDiscardedEvent {
  readonly type: "CardsDiscarded";
  readonly player: PlayerId;
  readonly cards: readonly CardId[];
}

export interface StarterRevealedEvent {
  readonly type: "StarterRevealed";
  readonly card: CardId;
}

export interface HisHeelsEvent {
  readonly type: "HisHeels";
  readonly dealer: PlayerId;
  readonly points: number;
}

export interface CardPlayedEvent {
  readonly type: "CardPlayed";
  readonly player: PlayerId;
  readonly card: CardId;
  readonly runningCount: number;
  readonly entries: readonly ScoreEntry[];
  readonly pointsScored: number;
}

export interface GoEvent {
  readonly type: "Go";
  readonly player: PlayerId;
  readonly reason: "no-legal-card" | "hand-empty";
}

export interface SegmentEndedEvent {
  readonly type: "SegmentEnded";
  readonly lastPlayer: PlayerId;
  readonly points: number;
  readonly reachedThirtyOne: boolean;
}

export interface PeggingCompleteEvent {
  readonly type: "PeggingComplete";
}

export interface HandScoredEvent {
  readonly type: "HandScored";
  readonly player: PlayerId;
  readonly source: "hand" | "crib";
  readonly entries: readonly ScoreEntry[];
  readonly points: number;
}

export interface ScoreUpdatedEvent {
  readonly type: "ScoreUpdated";
  readonly player: PlayerId;
  readonly total: number;
  readonly delta: number;
}

export interface GameWonEvent {
  readonly type: "GameWon";
  readonly player: PlayerId;
  readonly finalScore: Record<PlayerId, number>;
}

export interface HandCompleteEvent {
  readonly type: "HandComplete";
  readonly nextDealer: PlayerId;
}

export type GameEvent =
  | GameStartedEvent
  | HandDealtEvent
  | CardsDiscardedEvent
  | StarterRevealedEvent
  | HisHeelsEvent
  | CardPlayedEvent
  | GoEvent
  | SegmentEndedEvent
  | PeggingCompleteEvent
  | HandScoredEvent
  | ScoreUpdatedEvent
  | GameWonEvent
  | HandCompleteEvent;

/** Hidden-information-safe view of the game for a given seat (or a spectator/public view when omitted). */
export interface PlayerProjection {
  readonly phase: GamePhase;
  readonly dealer: PlayerId;
  readonly pone: PlayerId;
  readonly scores: Record<PlayerId, number>;
  readonly targetScore: number;
  /** The fixed 4-card hand used for counting (unaffected by pegging plays). */
  readonly ownHand: readonly Card[] | null;
  /** Cards this seat still has left to play during pegging (null outside PEGGING). */
  readonly remainingToPlay: readonly Card[] | null;
  readonly opponentHandSize: number;
  readonly starter: Card | null;
  readonly runningCount: number;
  readonly pegStack: readonly Card[];
  readonly turnPlayer: PlayerId | null;
  readonly legalPlays: readonly CardId[];
  readonly winner: PlayerId | null;
}
