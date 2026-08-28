import {
  emptyCooldowns,
  emptyMemory,
  type CommentaryDirectorInput,
  type Mode,
  type PublicCommentaryBoard,
  type PublicCommentaryEvent,
  type PublicCommentaryState,
  type Seat,
} from "../types.js";

export function board(overrides: Partial<PublicCommentaryBoard> = {}): PublicCommentaryBoard {
  return {
    northScore: 0,
    southScore: 0,
    northDistance: 121,
    southDistance: 121,
    dealer: "north",
    leader: "tied",
    margin: 0,
    skunkState: "none",
    ...overrides,
  };
}

export function state(overrides: Partial<PublicCommentaryState> = {}, mode: Mode = "broadcast"): PublicCommentaryState {
  return {
    mode,
    match: { matchId: "m1", targetScore: 121, stakes: "casual", skunkEnabled: false },
    board: board(),
    phase: "pegging",
    ...overrides,
  };
}

export function event(overrides: Partial<PublicCommentaryEvent> = {}): PublicCommentaryEvent {
  return {
    id: "e1",
    type: "card_played",
    beforeBoard: { northScore: 0, southScore: 0 },
    afterBoard: { northScore: 0, southScore: 0 },
    revealedFacts: [],
    ...overrides,
  };
}

export function input(
  overrides: Partial<CommentaryDirectorInput> = {},
  mode: Mode = "broadcast"
): CommentaryDirectorInput {
  return {
    state: state({}, mode),
    event: event(),
    memory: emptyMemory(),
    cooldowns: emptyCooldowns(),
    ...overrides,
  };
}

export const NORTH: Seat = "north";
export const SOUTH: Seat = "south";
