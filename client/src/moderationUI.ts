/** Moderation panel: per-player mute/block/report/kick + global voice kill switch. */
export class ModerationUI {
  private listEl: HTMLElement;
  private killSwitchEl: HTMLInputElement;
  /** Locally blocked/muted ids (drive client-side audio gain). */
  blocked = new Set<string>();

  onBlock: (id: string) => void = () => {};
  onMute: (id: string) => void = () => {};
  onReport: (id: string, reason: string) => void = () => {};
  onKick: (id: string) => void = () => {};
  onKillSwitch: (on: boolean) => void = () => {};

  constructor() {
    const toggle = document.getElementById("mod-toggle")!;
    const panel = document.getElementById("mod-panel")!;
    toggle.addEventListener("click", () => panel.classList.toggle("hidden"));
    document.getElementById("mod")!.classList.remove("hidden");

    this.listEl = document.getElementById("player-list")!;
    this.killSwitchEl = document.getElementById("kill-switch") as HTMLInputElement;
    this.killSwitchEl.addEventListener("change", () => this.onKillSwitch(this.killSwitchEl.checked));
  }

  setKillSwitch(on: boolean): void {
    this.killSwitchEl.checked = on;
  }

  isMuted(id: string): boolean {
    return this.blocked.has(id);
  }

  /** `players` is the colyseus MapSchema; `localId` excluded from the list. */
  render(players: Map<string, any>, localId: string): void {
    const rows: string[] = [];
    players.forEach((p: any, id: string) => {
      if (id === localId) return;
      const muted = this.blocked.has(id);
      rows.push(`
        <div class="player-row" data-id="${id}">
          <span class="pname">${escapeHtml(p.name)}</span>
          <button class="mute-btn ${muted ? "muted" : ""}">${muted ? "Unmute" : "Mute"}</button>
          <button class="report-btn">Report</button>
          <button class="kick-btn">Kick</button>
        </div>`);
    });
    this.listEl.innerHTML = rows.join("") || `<div class="seat-pill">No one else here yet.</div>`;

    this.listEl.querySelectorAll<HTMLElement>(".player-row").forEach((row) => {
      const id = row.dataset.id!;
      row.querySelector(".mute-btn")?.addEventListener("click", () => {
        if (this.blocked.has(id)) {
          this.blocked.delete(id);
        } else {
          this.blocked.add(id);
          this.onMute(id);
          this.onBlock(id);
        }
        this.render(players, localId);
      });
      row.querySelector(".report-btn")?.addEventListener("click", () => {
        const reason = prompt("Report reason?") ?? "";
        if (reason) this.onReport(id, reason);
      });
      row.querySelector(".kick-btn")?.addEventListener("click", () => {
        if (confirm("Kick this player?")) this.onKick(id);
      });
    });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
