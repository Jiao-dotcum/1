import pokersolver from "pokersolver";
const { Hand } = pokersolver;
import {
  freshDeck,
  POKER,
  type Card,
  type GamePhase,
  type PokerAction,
  type PublicSeatState,
  type PublicTableState,
  type PotState,
} from "@pokerpandey/shared";
import { computePots, type Contribution } from "./sidePots.js";

/** One seated player's full state (server-private; hole cards never broadcast). */
export class Seat {
  playerId: string;
  name: string;
  stack: number;
  holeCards: Card[] = [];
  /** Chips committed in the current betting round. */
  committedRound = 0;
  /** Total chips committed this hand (for side pots). */
  committedHand = 0;
  folded = false;
  allIn = false;
  /** Whether this player has acted since the last bet/raise this round. */
  hasActed = false;
  /** Dealt into the current hand. */
  inHand = false;
  /** Cards revealed at showdown. */
  revealed: Card[] = [];

  constructor(playerId: string, name: string, stack: number) {
    this.playerId = playerId;
    this.name = name;
    this.stack = stack;
  }
}

export interface EngineCallbacks {
  /** Deliver private hole cards to a single player. */
  onHoleCards: (playerId: string, cards: [Card, Card]) => void;
  /** Notify when public state changed (so the room can re-sync schema). */
  onChange: () => void;
}

/**
 * Server-authoritative Texas Hold'em engine for a single table.
 *
 * Pure logic — no Colyseus dependency, so it is unit-testable. The room mirrors
 * `getPublicState()` into schema and routes `onHoleCards` privately.
 */
export class PokerEngine {
  readonly tableId: string;
  readonly maxSeats: number;
  /** Fixed-length seat array; null = empty seat. */
  seats: (Seat | null)[];

  phase: GamePhase = "waiting";
  community: Card[] = [];
  deck: Card[] = [];
  buttonSeat = 0;
  currentBet = 0;
  minRaise = POKER.bigBlind;
  activeSeat = -1;
  lastResult: string | undefined;
  /** Pots locked in at showdown for display. */
  private displayPots: PotState[] = [];

  private cb: EngineCallbacks;
  private rng: () => number;
  /** Optional deck override for deterministic tests. Cards are popped from the end. */
  private deckFactory: (() => Card[]) | null;
  /** When false, hands must be started manually (tests). Production leaves it true. */
  private autoStart: boolean;

  constructor(
    tableId: string,
    cb: EngineCallbacks,
    opts: {
      maxSeats?: number;
      rng?: () => number;
      deck?: () => Card[];
      autoStart?: boolean;
    } = {},
  ) {
    this.tableId = tableId;
    this.cb = cb;
    this.maxSeats = opts.maxSeats ?? POKER.minPlayers * 3;
    this.seats = new Array(this.maxSeats).fill(null);
    this.rng = opts.rng ?? Math.random;
    this.deckFactory = opts.deck ?? null;
    this.autoStart = opts.autoStart ?? true;
  }

  // ── Seating ──────────────────────────────────────────────────────────────

  sit(seatIndex: number, playerId: string, name: string, stack: number): boolean {
    if (seatIndex < 0 || seatIndex >= this.maxSeats) return false;
    if (this.seats[seatIndex]) return false;
    if (this.seatOf(playerId) !== -1) return false; // already seated
    this.seats[seatIndex] = new Seat(playerId, name, stack);
    this.cb.onChange();
    this.maybeStart();
    return true;
  }

  stand(playerId: string): number | null {
    const idx = this.seatOf(playerId);
    if (idx === -1) return null;
    const seat = this.seats[idx]!;
    const returnedStack = seat.stack;
    // If they're in a live hand, fold them first.
    if (seat.inHand && !seat.folded && this.phase !== "waiting") {
      seat.folded = true;
      if (this.activeSeat === idx) this.advanceAfterAction(idx);
    }
    this.seats[idx] = null;
    this.cb.onChange();
    if (this.activePlayers().length < POKER.minPlayers && this.phase !== "waiting") {
      this.endHandEarlyIfNeeded();
    }
    return returnedStack;
  }

  seatOf(playerId: string): number {
    return this.seats.findIndex((s) => s?.playerId === playerId);
  }

  occupiedCount(): number {
    return this.seats.filter(Boolean).length;
  }

  // ── Hand lifecycle ─────────────────────────────────────────────────────────

  /** Start a new hand if idle and enough players have chips. */
  maybeStart(): void {
    if (!this.autoStart) return;
    if (this.phase !== "waiting") return;
    const eligible = this.seats.filter((s): s is Seat => !!s && s.stack > 0);
    if (eligible.length < POKER.minPlayers) return;
    this.startHand();
  }

  startHand(): void {
    this.lastResult = undefined;
    this.displayPots = [];
    this.community = [];
    this.deck = this.deckFactory ? this.deckFactory() : this.shuffle(freshDeck());
    this.currentBet = 0;
    this.minRaise = POKER.bigBlind;

    // Reset seats; mark those with chips as in-hand.
    const playing: number[] = [];
    this.seats.forEach((s, i) => {
      if (!s) return;
      s.holeCards = [];
      s.revealed = [];
      s.committedRound = 0;
      s.committedHand = 0;
      s.folded = false;
      s.allIn = false;
      s.hasActed = false;
      s.inHand = s.stack > 0;
      if (s.inHand) playing.push(i);
    });

    if (playing.length < POKER.minPlayers) {
      this.phase = "waiting";
      this.cb.onChange();
      return;
    }

    // Advance the button to the next occupied, in-hand seat.
    this.buttonSeat = this.nextOccupied(this.buttonSeat, playing);

    const heads = playing.length === 2;
    // Blind positions.
    const sbSeat = heads ? this.buttonSeat : this.nextInHand(this.buttonSeat);
    const bbSeat = this.nextInHand(sbSeat);

    this.postBlind(sbSeat, POKER.smallBlind);
    this.postBlind(bbSeat, POKER.bigBlind);
    this.currentBet = POKER.bigBlind;
    this.minRaise = POKER.bigBlind;

    // Deal two hole cards to each in-hand player, button-first order is irrelevant.
    for (const i of playing) {
      const s = this.seats[i]!;
      s.holeCards = [this.deck.pop()!, this.deck.pop()!];
      this.cb.onHoleCards(s.playerId, [s.holeCards[0], s.holeCards[1]]);
    }

    this.phase = "preflop";
    // First to act preflop: seat after BB (UTG). Heads-up: button/SB acts first.
    this.activeSeat = heads ? this.buttonSeat : this.nextInHand(bbSeat);
    this.cb.onChange();
  }

  private postBlind(seatIndex: number, amount: number): void {
    const s = this.seats[seatIndex]!;
    const pay = Math.min(amount, s.stack);
    s.stack -= pay;
    s.committedRound += pay;
    s.committedHand += pay;
    if (s.stack === 0) s.allIn = true;
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  /** Handle a validated-or-not player action. Returns an error string, or null on success. */
  act(playerId: string, action: PokerAction): string | null {
    const idx = this.seatOf(playerId);
    if (idx === -1) return "not seated";
    if (idx !== this.activeSeat) return "not your turn";
    const seat = this.seats[idx]!;
    if (!seat.inHand || seat.folded || seat.allIn) return "cannot act";

    const toCall = this.currentBet - seat.committedRound;

    switch (action.type) {
      case "fold": {
        seat.folded = true;
        seat.hasActed = true;
        break;
      }
      case "check": {
        if (toCall > 0) return "cannot check facing a bet";
        seat.hasActed = true;
        break;
      }
      case "call": {
        if (toCall <= 0) return "nothing to call";
        const pay = Math.min(toCall, seat.stack);
        this.commit(seat, pay);
        seat.hasActed = true;
        break;
      }
      case "bet":
      case "raise": {
        // amount = the TOTAL this player wants committed this round.
        const target = action.amount ?? 0;
        const err = this.validateRaise(seat, target, toCall);
        if (err) return err;
        const pay = target - seat.committedRound;
        const raiseSize = target - this.currentBet;
        this.commit(seat, pay);
        // A full raise resets everyone else's obligation to act.
        if (raiseSize >= this.minRaise || seat.allIn) {
          if (raiseSize >= this.minRaise) this.minRaise = raiseSize;
          this.currentBet = target;
          this.resetActionFlags(idx);
        } else {
          // Under-min all-in: raises the bet but does not reopen action.
          this.currentBet = Math.max(this.currentBet, target);
        }
        seat.hasActed = true;
        break;
      }
      case "allin": {
        const pay = seat.stack;
        const target = seat.committedRound + pay;
        this.commit(seat, pay);
        const raiseSize = target - this.currentBet;
        if (target > this.currentBet) {
          if (raiseSize >= this.minRaise) {
            this.minRaise = raiseSize;
            this.resetActionFlags(idx);
          }
          this.currentBet = target;
        }
        seat.hasActed = true;
        break;
      }
      default:
        return "unknown action";
    }

    this.advanceAfterAction(idx);
    this.cb.onChange();
    return null;
  }

  private validateRaise(seat: Seat, target: number, toCall: number): string | null {
    const maxTarget = seat.committedRound + seat.stack;
    if (target > maxTarget) return "not enough chips";
    if (target <= this.currentBet && toCall > 0) return "raise must exceed current bet";
    if (target <= seat.committedRound) return "raise must add chips";
    const raiseSize = target - this.currentBet;
    const isAllIn = target === maxTarget;
    if (raiseSize < this.minRaise && !isAllIn) return `raise must be at least ${this.minRaise}`;
    return null;
  }

  private commit(seat: Seat, amount: number): void {
    const pay = Math.min(amount, seat.stack);
    seat.stack -= pay;
    seat.committedRound += pay;
    seat.committedHand += pay;
    if (seat.stack === 0) seat.allIn = true;
  }

  private resetActionFlags(exceptSeat: number): void {
    this.seats.forEach((s, i) => {
      if (s && s.inHand && !s.folded && !s.allIn && i !== exceptSeat) s.hasActed = false;
    });
  }

  private advanceAfterAction(actedSeat: number): void {
    // Hand ends immediately if only one player remains unfolded.
    const live = this.activePlayers();
    if (live.length === 1) {
      this.awardUncontested(live[0]);
      return;
    }

    if (this.isRoundComplete()) {
      this.endBettingRound();
      return;
    }

    this.activeSeat = this.nextToAct(actedSeat);
  }

  /** Players still in the hand and not folded. */
  private activePlayers(): number[] {
    const out: number[] = [];
    this.seats.forEach((s, i) => {
      if (s && s.inHand && !s.folded) out.push(i);
    });
    return out;
  }

  /** Players who can still take an action (not folded, not all-in). */
  private canAct(): number[] {
    const out: number[] = [];
    this.seats.forEach((s, i) => {
      if (s && s.inHand && !s.folded && !s.allIn) out.push(i);
    });
    return out;
  }

  private isRoundComplete(): boolean {
    const actionable = this.canAct();
    if (actionable.length === 0) return true;
    for (const i of actionable) {
      const s = this.seats[i]!;
      if (!s.hasActed || s.committedRound !== this.currentBet) return false;
    }
    return true;
  }

  private endBettingRound(): void {
    // Reset round-level betting state; committedHand retains the chips.
    this.seats.forEach((s) => {
      if (s) {
        s.committedRound = 0;
        s.hasActed = false;
      }
    });
    this.currentBet = 0;
    this.minRaise = POKER.bigBlind;

    // If at most one player can still act, fast-forward to showdown.
    if (this.canAct().length <= 1 && this.activePlayers().length >= 2) {
      this.runOutBoard();
      this.showdown();
      return;
    }

    switch (this.phase) {
      case "preflop":
        this.dealCommunity(3);
        this.phase = "flop";
        break;
      case "flop":
        this.dealCommunity(1);
        this.phase = "turn";
        break;
      case "turn":
        this.dealCommunity(1);
        this.phase = "river";
        break;
      case "river":
        this.showdown();
        return;
      default:
        break;
    }
    this.activeSeat = this.firstToActPostflop();
  }

  private runOutBoard(): void {
    while (this.community.length < 5) this.dealCommunity(1);
  }

  private dealCommunity(n: number): void {
    this.deck.pop(); // burn
    for (let i = 0; i < n; i++) this.community.push(this.deck.pop()!);
  }

  private firstToActPostflop(): number {
    // First active player left of the button who can act.
    let i = this.nextInHand(this.buttonSeat);
    for (let guard = 0; guard < this.maxSeats; guard++) {
      const s = this.seats[i]!;
      if (s && s.inHand && !s.folded && !s.allIn) return i;
      i = this.nextInHand(i);
    }
    return this.activeSeat;
  }

  // ── Resolution ───────────────────────────────────────────────────────────────

  private awardUncontested(seatIndex: number): void {
    const total = this.totalCommitted();
    const s = this.seats[seatIndex]!;
    s.stack += total;
    this.lastResult = `${s.name} wins ${total} (uncontested)`;
    this.displayPots = [];
    this.finishHand();
  }

  private showdown(): void {
    this.phase = "showdown";
    const contributions: Contribution[] = [];
    this.seats.forEach((s) => {
      if (s && s.committedHand > 0) {
        contributions.push({ playerId: s.playerId, amount: s.committedHand, folded: s.folded });
      }
    });
    const pots = computePots(contributions);
    this.displayPots = pots;

    // Reveal contenders' cards.
    const contenders = this.activePlayers();
    for (const i of contenders) this.seats[i]!.revealed = [...this.seats[i]!.holeCards];

    const resultLines: string[] = [];
    pots.forEach((pot, potIdx) => {
      const winners = this.evaluatePot(pot.eligible);
      const share = Math.floor(pot.amount / winners.length);
      let remainder = pot.amount - share * winners.length;
      // Distribute remainder one chip at a time starting left of the button.
      const ordered = this.orderFromButton(winners);
      for (const pid of ordered) {
        const seat = this.seats[this.seatOf(pid)]!;
        let award = share;
        if (remainder > 0) {
          award += 1;
          remainder -= 1;
        }
        seat.stack += award;
      }
      const label = potIdx === 0 ? "Main pot" : `Side pot ${potIdx}`;
      const winnerNames = ordered.map((pid) => this.seats[this.seatOf(pid)]!.name).join(", ");
      resultLines.push(`${label} (${pot.amount}) → ${winnerNames}`);
    });

    this.lastResult = resultLines.join(" · ");
    this.finishHand();
  }

  /** Use pokersolver to find the winning playerId(s) among eligible at showdown. */
  private evaluatePot(eligible: string[]): string[] {
    const live = eligible.filter((pid) => {
      const idx = this.seatOf(pid);
      return idx !== -1 && !this.seats[idx]!.folded;
    });
    if (live.length === 0) return eligible; // shouldn't happen; safety
    if (live.length === 1) return live;

    const hands = live.map((pid) => {
      const seat = this.seats[this.seatOf(pid)]!;
      const h = Hand.solve([...seat.holeCards, ...this.community]);
      (h as unknown as { _pid: string })._pid = pid;
      return h;
    });
    const winners = Hand.winners(hands);
    return winners.map((h) => (h as unknown as { _pid: string })._pid);
  }

  private orderFromButton(playerIds: string[]): string[] {
    const set = new Set(playerIds);
    const ordered: string[] = [];
    const occupied = this.occupiedIndices();
    // Walk each occupied seat exactly once, in clockwise order from the button.
    let i = this.buttonSeat;
    for (let visited = 0; visited < occupied.length; visited++) {
      i = this.nextOccupied(i, occupied);
      const s = this.seats[i];
      if (s && set.has(s.playerId) && !ordered.includes(s.playerId)) {
        ordered.push(s.playerId);
      }
    }
    // Fallback: include any not covered (e.g. empty-seat edge cases).
    for (const pid of playerIds) if (!ordered.includes(pid)) ordered.push(pid);
    return ordered;
  }

  private finishHand(): void {
    this.activeSeat = -1;
    this.cb.onChange();
    // Brief pause is handled by the room; engine just marks the hand complete.
    this.phase = "showdown";
    // After a short pause, idle and try to start the next hand. unref() so the
    // timer never keeps the process (or a test runner) alive on its own.
    const t = setTimeout(() => {
      this.phase = "waiting";
      this.maybeStart();
      this.cb.onChange();
    }, 4000);
    if (typeof t === "object" && "unref" in t) (t as { unref: () => void }).unref();
  }

  private endHandEarlyIfNeeded(): void {
    const live = this.activePlayers();
    if (live.length === 1) this.awardUncontested(live[0]);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private totalCommitted(): number {
    return this.seats.reduce((sum, s) => sum + (s?.committedHand ?? 0), 0);
  }

  private occupiedIndices(): number[] {
    const out: number[] = [];
    this.seats.forEach((s, i) => s && out.push(i));
    return out;
  }

  /** Next seat index (wrapping) that is occupied and in the given set. */
  private nextOccupied(from: number, set: number[]): number {
    for (let step = 1; step <= this.maxSeats; step++) {
      const i = (from + step) % this.maxSeats;
      if (set.includes(i)) return i;
    }
    return from;
  }

  /** Next seat (wrapping) that is in the current hand (not folded-agnostic). */
  private nextInHand(from: number): number {
    for (let step = 1; step <= this.maxSeats; step++) {
      const i = (from + step) % this.maxSeats;
      const s = this.seats[i];
      if (s && s.inHand) return i;
    }
    return from;
  }

  /** Next seat (wrapping) that can still act. */
  private nextToAct(from: number): number {
    for (let step = 1; step <= this.maxSeats; step++) {
      const i = (from + step) % this.maxSeats;
      const s = this.seats[i];
      if (s && s.inHand && !s.folded && !s.allIn) return i;
    }
    return -1;
  }

  private shuffle(deck: Card[]): Card[] {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  // ── Public state (broadcast-safe; no hidden hole cards) ──────────────────────

  getPublicState(): PublicTableState {
    const seats: PublicSeatState[] = [];
    this.seats.forEach((s, i) => {
      if (!s) return;
      seats.push({
        seatIndex: i,
        playerId: s.playerId,
        name: s.name,
        stack: s.stack,
        committed: s.committedRound,
        folded: s.folded,
        allIn: s.allIn,
        toAct: i === this.activeSeat,
        revealed: s.revealed,
      });
    });

    const handTotal = this.totalCommitted();

    return {
      phase: this.phase,
      community: [...this.community],
      pots: this.displayPots,
      totalPot: handTotal,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      buttonSeat: this.buttonSeat,
      activeSeat: this.activeSeat,
      seats,
      lastResult: this.lastResult,
    };
  }
}
