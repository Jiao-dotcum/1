declare module "pokersolver" {
  export class Hand {
    name: string;
    descr: string;
    rank: number;
    cards: unknown[];
    /** Solve a hand from 5–7 card strings like ["Ad","As","Kc","2h","Td"]. */
    static solve(cards: string[], game?: string, canDisqualify?: boolean): Hand;
    /** Return the winning hand(s) from a list (ties return multiple). */
    static winners(hands: Hand[]): Hand[];
  }
  /** pokersolver is published as CommonJS: module.exports = { Hand, Game }. */
  const pokersolver: { Hand: typeof Hand; Game: unknown };
  export default pokersolver;
}
