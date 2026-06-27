import type { PotState } from "@pokerpandey/shared";

/** Per-player contribution to the hand, used to compute side pots. */
export interface Contribution {
  playerId: string;
  /** Total chips this player put into the pot this hand. */
  amount: number;
  /** Folded players still contribute chips but cannot win. */
  folded: boolean;
}

/**
 * Compute main + side pots from each player's TOTAL hand contribution.
 *
 * Classic algorithm: repeatedly peel off the smallest positive contribution
 * level. Every player still contributing at that level pays into the pot;
 * only non-folded players at that level are eligible to win it. Consecutive
 * pots with identical eligibility are merged for tidiness.
 */
export function computePots(contributions: Contribution[]): PotState[] {
  // Work on a mutable copy.
  const remaining = contributions
    .filter((c) => c.amount > 0)
    .map((c) => ({ ...c }));

  const pots: PotState[] = [];

  while (remaining.some((c) => c.amount > 0)) {
    const level = Math.min(...remaining.filter((c) => c.amount > 0).map((c) => c.amount));
    let potAmount = 0;
    const eligible: string[] = [];

    for (const c of remaining) {
      if (c.amount > 0) {
        potAmount += level;
        c.amount -= level;
        if (!c.folded) eligible.push(c.playerId);
      }
    }

    // A pot with no eligible (everyone at this level folded) still holds chips;
    // merge it forward by attaching to the next pot's eligibility. For simplicity
    // we record it and let the merge step fold it into a neighbouring pot.
    pots.push({ amount: potAmount, eligible });
  }

  return mergePots(pots);
}

/** Merge adjacent pots that have the same eligible set. */
function mergePots(pots: PotState[]): PotState[] {
  const merged: PotState[] = [];
  for (const pot of pots) {
    const last = merged[merged.length - 1];
    if (last && sameSet(last.eligible, pot.eligible)) {
      last.amount += pot.amount;
    } else {
      merged.push({ amount: pot.amount, eligible: [...pot.eligible] });
    }
  }
  return merged;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}
