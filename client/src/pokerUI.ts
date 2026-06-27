import type { PokerAction } from "@pokerpandey/shared";

const SUIT = {
  s: { sym: "♠", red: false },
  h: { sym: "♥", red: true },
  d: { sym: "♦", red: true },
  c: { sym: "♣", red: false },
} as const;

function cardHtml(card: string | null): string {
  if (!card) return `<div class="card back">?</div>`;
  const rank = card[0] === "T" ? "10" : card[0];
  const suit = SUIT[card[1] as keyof typeof SUIT];
  return `<div class="card ${suit?.red ? "red" : ""}">${rank}${suit?.sym ?? ""}</div>`;
}

/** Renders the seated poker experience: board, pot, seats, hole cards, actions. */
export class PokerUI {
  private el: HTMLElement;
  private holeCards = new Map<string, [string, string]>();
  onAction: (tableId: string, action: PokerAction) => void = () => {};
  onStand: () => void = () => {};

  constructor(el: HTMLElement) {
    this.el = el;
  }

  setHoleCards(tableId: string, cards: [string, string]): void {
    this.holeCards.set(tableId, cards);
  }

  clearHoleCards(): void {
    this.holeCards.clear();
  }

  hide(): void {
    this.el.classList.add("hidden");
    this.el.innerHTML = "";
  }

  /** `table` is the colyseus TableState (read generically). */
  render(table: any, localId: string): void {
    if (!table) {
      this.hide();
      return;
    }
    this.el.classList.remove("hidden");

    const seats: any[] = Array.from(table.seats ?? []);
    const mySeat = seats.find((s) => s.playerId === localId);
    const community: string[] = Array.from(table.community ?? []);
    const hole = this.holeCards.get(table.id) ?? null;

    const board = [0, 1, 2, 3, 4].map((i) => cardHtml(community[i] ?? null)).join("");

    const seatPills = seats
      .map((s) => {
        const tag = s.folded ? "folded" : s.allIn ? "all-in" : "";
        const btn = s.seatIndex === table.buttonSeat ? "Ⓓ" : "";
        const turn = s.toAct ? "●" : "";
        return `<span class="seat-pill">${turn} ${escapeHtml(s.name)} ${btn} — ${s.stack}${
          s.committed ? ` (bet ${s.committed})` : ""
        } ${tag}</span>`;
      })
      .join("");

    const status = `
      <div class="table-status">
        <span><b>${table.phase}</b></span>
        <span>Pot: <b>${table.totalPot}</b></span>
        ${table.currentBet ? `<span>To call: ${table.currentBet}</span>` : ""}
        ${table.lastResult ? `<span>🏆 ${escapeHtml(table.lastResult)}</span>` : ""}
      </div>`;

    const myCards = hole ? `${cardHtml(hole[0])}${cardHtml(hole[1])}` : `${cardHtml(null)}${cardHtml(null)}`;

    this.el.innerHTML = `
      ${status}
      <div class="community">${board}</div>
      <div class="seat-pill" style="flex-wrap:wrap;justify-content:center">${seatPills}</div>
      <div class="hole-cards">${myCards}</div>
      <div class="actions" id="action-row"></div>
    `;

    this.renderActions(table, mySeat);
  }

  private renderActions(table: any, mySeat: any): void {
    const row = this.el.querySelector("#action-row") as HTMLElement;
    if (!row) return;

    const standBtn = `<button class="secondary" id="stand-btn">Stand up</button>`;

    const myTurn = mySeat && mySeat.toAct && table.activeSeat === mySeat.seatIndex;
    if (!myTurn) {
      row.innerHTML = `<span class="seat-pill">${
        mySeat ? "Waiting for your turn…" : "Spectating"
      }</span>${standBtn}`;
      this.wireStand(row);
      return;
    }

    const toCall = Math.max(0, table.currentBet - mySeat.committed);
    const myMax = mySeat.stack + mySeat.committed; // total reachable this round
    const minRaiseTarget = Math.min(myMax, table.currentBet + (table.minRaise || table.currentBet || 1));
    const canRaise = myMax > table.currentBet;

    const callLabel = toCall > 0 ? `Call ${toCall}` : "Check";
    const raiseLabel = table.currentBet > 0 ? "Raise to" : "Bet";

    row.innerHTML = `
      <button class="fold" id="fold-btn">Fold</button>
      <button id="call-btn">${callLabel}</button>
      ${
        canRaise
          ? `<div class="bet-row">
               <input type="range" id="bet-range" min="${minRaiseTarget}" max="${myMax}" value="${minRaiseTarget}" />
               <button id="raise-btn">${raiseLabel} <span id="bet-amt">${minRaiseTarget}</span></button>
             </div>`
          : ""
      }
      <button class="secondary" id="allin-btn">All-in (${myMax})</button>
      ${standBtn}
    `;

    const id = table.id;
    row.querySelector("#fold-btn")?.addEventListener("click", () => this.onAction(id, { type: "fold" }));
    row.querySelector("#call-btn")?.addEventListener("click", () =>
      this.onAction(id, { type: toCall > 0 ? "call" : "check" }),
    );
    row.querySelector("#allin-btn")?.addEventListener("click", () =>
      this.onAction(id, { type: "allin" }),
    );

    const range = row.querySelector("#bet-range") as HTMLInputElement | null;
    const amt = row.querySelector("#bet-amt");
    if (range && amt) {
      range.addEventListener("input", () => (amt.textContent = range.value));
    }
    row.querySelector("#raise-btn")?.addEventListener("click", () => {
      const amount = Number(range?.value ?? minRaiseTarget);
      this.onAction(id, { type: table.currentBet > 0 ? "raise" : "bet", amount });
    });

    this.wireStand(row);
  }

  private wireStand(row: HTMLElement): void {
    row.querySelector("#stand-btn")?.addEventListener("click", () => this.onStand());
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
