import { describe, it, expect, vi } from "vitest";
import { PokerEngine } from "./engine.js";
import type { Card } from "@pokerpandey/shared";

function makeEngine(deck?: Card[]) {
  const holeCards: Record<string, Card[]> = {};
  const engine = new PokerEngine(
    "t1",
    {
      onHoleCards: (pid, cards) => {
        holeCards[pid] = cards;
      },
      onChange: () => {},
    },
    { maxSeats: 6, autoStart: false, deck: deck ? () => [...deck] : undefined },
  );
  return { engine, holeCards };
}

describe("PokerEngine", () => {
  it("deals only two hole cards per player, privately", () => {
    const { engine, holeCards } = makeEngine();
    engine.sit(0, "a", "Alice", 1000);
    engine.sit(1, "b", "Bob", 1000);
    engine.startHand();
    expect(holeCards["a"]).toHaveLength(2);
    expect(holeCards["b"]).toHaveLength(2);
    // Public state never exposes another player's hole cards pre-showdown.
    const pub = engine.getPublicState();
    for (const seat of pub.seats) {
      expect(seat.revealed).toHaveLength(0);
    }
    expect(JSON.stringify(pub)).not.toContain(holeCards["a"][0]);
  });

  it("awards the pot uncontested when everyone folds to one player", () => {
    const { engine } = makeEngine();
    engine.sit(0, "a", "Alice", 1000);
    engine.sit(1, "b", "Bob", 1000);
    engine.startHand();
    // Heads-up: button (seat0) is SB and acts first preflop.
    const active = engine.getPublicState().activeSeat;
    const actor = engine.getPublicState().seats.find((s) => s.seatIndex === active)!;
    // Whoever is to act folds; the other player wins the blinds.
    engine.act(actor.playerId, { type: "fold" });
    const pub = engine.getPublicState();
    const total = pub.seats.reduce((s, x) => s + x.stack, 0);
    expect(total).toBe(2000); // chips conserved
    expect(pub.lastResult).toMatch(/uncontested/);
  });

  it("computes correct side pots and showdown payouts on a 3-way all-in", () => {
    // Deck is popped from the end. Engineered so the dealt cards are:
    //   Alice(seat0): Ah As   Bob(seat1): 9c 9d   Cara(seat2): Kh Ks
    //   board: Ac Kd 2h 7s 3d
    // => Alice trip aces (best), Cara trip kings, Bob pair nines.
    const deck: Card[] = [
      "3d", "Tc", "7s", "8c", "2h", "6c", "Kd", "5c", "Ac", "4c",
      "Ks", "Kh", "9d", "9c", "As", "Ah",
    ];
    const { engine } = makeEngine(deck);
    engine.sit(0, "a", "Alice", 50);
    engine.sit(1, "b", "Bob", 100);
    engine.sit(2, "c", "Cara", 250);
    engine.startHand();

    // Button=seat1, SB=seat2(5), BB=seat0(10). UTG/first to act = seat1 (Bob).
    expect(engine.getPublicState().activeSeat).toBe(1);

    engine.act("b", { type: "allin" }); // Bob shoves 100
    engine.act("c", { type: "allin" }); // Cara shoves 245 + 5 blind = 250 total
    engine.act("a", { type: "allin" }); // Alice shoves 40 + 10 blind = 50 total

    const pub = engine.getPublicState();
    expect(pub.phase).toBe("showdown");

    const stack = (id: string) => pub.seats.find((s) => s.playerId === id)!.stack;
    // Main pot 150 (50x3) -> Alice (best). Side pot 100 (50x Bob,Cara) -> Cara.
    // Side pot 150 (Cara only, uncalled overbet) -> Cara back.
    expect(stack("a")).toBe(150);
    expect(stack("b")).toBe(0);
    expect(stack("c")).toBe(250);

    // Chips conserved.
    expect(stack("a") + stack("b") + stack("c")).toBe(50 + 100 + 250);

    // Three pots: main + two side pots.
    expect(pub.pots).toHaveLength(3);
    expect(pub.pots[0].amount).toBe(150);
  });

  it("rejects actions out of turn and illegal checks", () => {
    const { engine } = makeEngine();
    engine.sit(0, "a", "Alice", 1000);
    engine.sit(1, "b", "Bob", 1000);
    engine.startHand();
    const active = engine.getPublicState().activeSeat;
    const waiting = engine.getPublicState().seats.find((s) => s.seatIndex !== active)!;
    expect(engine.act(waiting.playerId, { type: "check" })).toMatch(/not your turn/);
    const actor = engine.getPublicState().seats.find((s) => s.seatIndex === active)!;
    // Facing the big blind, the SB cannot check.
    expect(engine.act(actor.playerId, { type: "check" })).toMatch(/cannot check/);
  });
});

// Silence the post-showdown auto-restart timer noise during tests.
vi.useRealTimers();
