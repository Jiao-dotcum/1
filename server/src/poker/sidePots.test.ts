import { describe, it, expect } from "vitest";
import { computePots } from "./sidePots.js";

describe("computePots", () => {
  it("single pot when everyone contributes equally", () => {
    const pots = computePots([
      { playerId: "a", amount: 100, folded: false },
      { playerId: "b", amount: 100, folded: false },
      { playerId: "c", amount: 100, folded: false },
    ]);
    expect(pots).toHaveLength(1);
    expect(pots[0].amount).toBe(300);
    expect(pots[0].eligible.sort()).toEqual(["a", "b", "c"]);
  });

  it("builds a side pot when a short stack is all-in", () => {
    // a is all-in for 50, b and c each put in 200.
    const pots = computePots([
      { playerId: "a", amount: 50, folded: false },
      { playerId: "b", amount: 200, folded: false },
      { playerId: "c", amount: 200, folded: false },
    ]);
    expect(pots).toHaveLength(2);
    // Main pot: 50 from each of a,b,c = 150, all eligible.
    expect(pots[0].amount).toBe(150);
    expect(pots[0].eligible.sort()).toEqual(["a", "b", "c"]);
    // Side pot: 150 from each of b,c = 300, only b,c eligible.
    expect(pots[1].amount).toBe(300);
    expect(pots[1].eligible.sort()).toEqual(["b", "c"]);
  });

  it("handles three all-in levels (main + two side pots)", () => {
    const pots = computePots([
      { playerId: "a", amount: 50, folded: false },
      { playerId: "b", amount: 100, folded: false },
      { playerId: "c", amount: 250, folded: false },
    ]);
    expect(pots).toHaveLength(3);
    expect(pots[0]).toEqual({ amount: 150, eligible: ["a", "b", "c"] });
    expect(pots[1]).toEqual({ amount: 100, eligible: ["b", "c"] });
    expect(pots[2]).toEqual({ amount: 150, eligible: ["c"] });
  });

  it("folded players add chips but are not eligible", () => {
    // b folded after putting in 200; a (all-in 50) and c (200) contest.
    const pots = computePots([
      { playerId: "a", amount: 50, folded: false },
      { playerId: "b", amount: 200, folded: true },
      { playerId: "c", amount: 200, folded: false },
    ]);
    expect(pots).toHaveLength(2);
    expect(pots[0].amount).toBe(150);
    expect(pots[0].eligible.sort()).toEqual(["a", "c"]);
    expect(pots[1].amount).toBe(300);
    expect(pots[1].eligible.sort()).toEqual(["c"]);
  });

  it("total chips are conserved", () => {
    const contributions = [
      { playerId: "a", amount: 33, folded: false },
      { playerId: "b", amount: 77, folded: false },
      { playerId: "c", amount: 120, folded: true },
      { playerId: "d", amount: 200, folded: false },
    ];
    const pots = computePots(contributions);
    const total = pots.reduce((s, p) => s + p.amount, 0);
    expect(total).toBe(33 + 77 + 120 + 200);
  });
});
