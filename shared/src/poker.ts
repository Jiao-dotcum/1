/**
 * Poker domain types shared by client and server.
 *
 * IMPORTANT: hole cards are ONLY ever sent to their owner. The public table
 * state (PublicTableState) never contains another player's hole cards.
 */

/** A card in `pokersolver` notation, e.g. "Ah", "Td", "2c", "Ks". */
export type Card = string;

/** Phases of a Texas Hold'em hand. */
export type GamePhase =
  | "waiting" // not enough players / between hands
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown";

/** Actions a player can take on their turn. */
export type PokerActionType = "fold" | "check" | "call" | "bet" | "raise" | "allin";

/** A betting intent sent from client → server. The server validates everything. */
export interface PokerAction {
  type: PokerActionType;
  /** For bet/raise: the total amount the player wants their bet to reach this round. */
  amount?: number;
}

/** Public, per-seat poker state (safe to broadcast to everyone). */
export interface PublicSeatState {
  seatIndex: number;
  playerId: string;
  name: string;
  /** Chips behind (not yet in the pot). */
  stack: number;
  /** Chips this player has committed in the CURRENT betting round. */
  committed: number;
  folded: boolean;
  allIn: boolean;
  /** True only for the seat whose turn it is to act. */
  toAct: boolean;
  /** Revealed hole cards at showdown, otherwise empty. */
  revealed: Card[];
}

/** A pot (main or side) and who is eligible to win it. */
export interface PotState {
  amount: number;
  /** playerIds eligible to win this pot. */
  eligible: string[];
}

/** Public, broadcastable poker state for a single table. No hidden hole cards. */
export interface PublicTableState {
  phase: GamePhase;
  community: Card[];
  pots: PotState[];
  /** Total chips in all pots + uncollected current-round bets, for display. */
  totalPot: number;
  /** The amount a player must match to call in the current round. */
  currentBet: number;
  /** Minimum raise increment for the current round. */
  minRaise: number;
  /** seatIndex of the dealer button. */
  buttonSeat: number;
  /** seatIndex whose turn it is, or -1. */
  activeSeat: number;
  seats: PublicSeatState[];
  /** Result text shown briefly after showdown. */
  lastResult?: string;
}

/** Private message sent ONLY to the owning player: their two hole cards. */
export interface HoleCardsMessage {
  tableId: string;
  cards: [Card, Card];
}

/** A full 52-card deck in pokersolver notation. */
export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"] as const;
export const SUITS = ["s", "h", "d", "c"] as const;

export function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (const r of RANKS) for (const s of SUITS) deck.push(`${r}${s}`);
  return deck;
}
