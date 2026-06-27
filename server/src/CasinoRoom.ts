import { Room, type Client } from "colyseus";
import {
  ClientMessage,
  FLOOR_HALF,
  POKER,
  POSITION_BROADCAST_HZ,
  ServerMessage,
  TABLE,
  type MovePayload,
  type SitPayload,
  type PokerActionPayload,
  type ModerationPayload,
  type NoticePayload,
} from "@pokerpandey/shared";
import { CasinoState, PlayerState, TableState, SeatSchema, PotSchema } from "./state.js";
import { PokerEngine } from "./poker/engine.js";
import { mintVoiceToken } from "./voice.js";
import { ArraySchema } from "@colyseus/schema";

/** Where the tables sit on the floor. ~4 tables for Phase 2/3. */
const TABLE_LAYOUT = [
  { id: "table-1", x: -8, z: -8 },
  { id: "table-2", x: 8, z: -8 },
  { id: "table-3", x: -8, z: 8 },
  { id: "table-4", x: 8, z: 8 },
];

/** Distance within which a player may sit at a table. */
const SIT_RANGE = TABLE.seatRadius + 2.0;

/** Shared LiveKit room name. Spatial "zones" are applied client-side as gain. */
const VOICE_ROOM = "pokerpandey-casino";

export class CasinoRoom extends Room<CasinoState> {
  maxClients = 32;

  /** sessionId -> client, for routing private messages (hole cards, notices). */
  private clients_ = new Map<string, Client>();
  /** One authoritative poker engine per table. */
  private engines = new Map<string, PokerEngine>();
  /** In-memory play-money balances keyed by sessionId. Phase 4: persist. */
  private balances = new Map<string, number>();
  /** Self/peer mutes & blocks for moderation context (sessionId -> set). */
  private blocks = new Map<string, Set<string>>();

  onCreate(): void {
    this.state = new CasinoState();
    this.setPatchRate(1000 / POSITION_BROADCAST_HZ);

    // Build tables + their engines.
    for (const t of TABLE_LAYOUT) {
      const ts = new TableState();
      ts.id = t.id;
      ts.x = t.x;
      ts.z = t.z;
      this.state.tables.push(ts);

      const engine = new PokerEngine(t.id, {
        onHoleCards: (playerId, cards) => {
          const client = this.clients_.get(playerId);
          client?.send(ServerMessage.HoleCards, { tableId: t.id, cards });
        },
        onChange: () => this.syncTable(t.id),
      });
      this.engines.set(t.id, engine);
    }

    this.registerMessageHandlers();
  }

  // ── Connection lifecycle ─────────────────────────────────────────────────

  async onJoin(client: Client, options?: { name?: string }): Promise<void> {
    this.clients_.set(client.sessionId, client);
    const name = (options?.name?.trim() || `Panda-${client.sessionId.slice(0, 4)}`).slice(0, 24);

    const player = new PlayerState();
    player.id = client.sessionId;
    player.name = name;
    // Spawn near the entrance (south edge), spread a little.
    player.x = (Math.random() - 0.5) * 6;
    player.z = FLOOR_HALF - 3;
    player.heading = Math.PI; // facing into the room
    this.state.players.set(client.sessionId, player);

    this.balances.set(client.sessionId, POKER.startingStack);
    this.blocks.set(client.sessionId, new Set());

    // Mint a LiveKit token (or null if voice unconfigured — client runs silent).
    const voice = await mintVoiceToken(client.sessionId, name, VOICE_ROOM);
    if (voice) {
      client.send(ServerMessage.VoiceToken, voice);
    } else {
      this.notice(client, "Voice not configured (no LiveKit keys) — running silent.", "warn");
    }
  }

  onLeave(client: Client): void {
    // TODO(phase4): reconnection. Wrap in `await this.allowReconnection(client, 30)`
    // for consented disconnects — hold the seat + chips, restore on reconnect keyed
    // by a durable account id (see persistence.ts) instead of dropping immediately.
    //
    // If seated, stand them so their chips return to balance and the seat frees up.
    const player = this.state.players.get(client.sessionId);
    if (player && player.seatedTable) {
      this.doStand(client.sessionId);
    }
    this.state.players.delete(client.sessionId);
    this.clients_.delete(client.sessionId);
    this.balances.delete(client.sessionId);
    this.blocks.delete(client.sessionId);
  }

  // ── Message handlers ──────────────────────────────────────────────────────

  private registerMessageHandlers(): void {
    this.onMessage(ClientMessage.Move, (client, msg: MovePayload) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      // Seated players don't roam.
      if (p.seatedTable) return;
      p.x = clamp(msg.x, -FLOOR_HALF, FLOOR_HALF);
      p.z = clamp(msg.z, -FLOOR_HALF, FLOOR_HALF);
      p.heading = Number.isFinite(msg.heading) ? msg.heading : p.heading;
    });

    this.onMessage(ClientMessage.Sit, (client, msg: SitPayload) => {
      this.doSit(client, msg);
    });

    this.onMessage(ClientMessage.Stand, (client) => {
      this.doStand(client.sessionId);
    });

    this.onMessage(ClientMessage.PokerAction, (client, msg: PokerActionPayload) => {
      const engine = this.engines.get(msg.tableId);
      if (!engine) return;
      const err = engine.act(client.sessionId, msg.action);
      if (err) this.notice(client, `Action rejected: ${err}`, "warn");
    });

    // Moderation. Mute/block/report are tracked server-side for context; actual
    // audio muting is applied client-side per the block set + kill switch.
    this.onMessage(ClientMessage.Block, (client, msg: ModerationPayload) => {
      this.blocks.get(client.sessionId)?.add(msg.targetId);
      this.notice(client, `Blocked ${this.nameOf(msg.targetId)}.`, "info");
    });
    this.onMessage(ClientMessage.Mute, (client, msg: ModerationPayload) => {
      this.blocks.get(client.sessionId)?.add(msg.targetId);
    });
    this.onMessage(ClientMessage.Report, (client, msg: ModerationPayload) => {
      // Phase 4: route to a real moderation queue. For now, log it.
      console.warn(
        `[REPORT] ${this.nameOf(client.sessionId)} reported ${this.nameOf(msg.targetId)}: ${msg.reason ?? "(no reason)"}`,
      );
      this.notice(client, "Report submitted to moderators.", "info");
    });

    // Server-side kick. TODO(phase4): gate behind real moderator auth.
    this.onMessage(ClientMessage.Kick, (_client, msg: ModerationPayload) => {
      const target = this.clients_.get(msg.targetId);
      if (!target) return;
      this.notice(target, "You were kicked by a moderator.", "error");
      target.leave(4000);
    });

    // Global voice kill switch (moderator). Silences all mics immediately.
    this.onMessage(ClientMessage.VoiceKillSwitch, (_client: Client, on: boolean) => {
      this.state.voiceKillSwitch = Boolean(on);
      this.state.players.forEach((p) => {
        p.voiceMuted = this.state.voiceKillSwitch;
      });
      this.broadcastNotice(
        this.state.voiceKillSwitch ? "Voice disabled by a moderator." : "Voice re-enabled.",
        "warn",
      );
    });
  }

  // ── Seating ───────────────────────────────────────────────────────────────

  private doSit(client: Client, msg: SitPayload): void {
    const player = this.state.players.get(client.sessionId);
    const engine = this.engines.get(msg.tableId);
    const table = this.state.tables.find((t) => t.id === msg.tableId);
    if (!player || !engine || !table) return;
    if (player.seatedTable) {
      this.notice(client, "You're already seated.", "warn");
      return;
    }

    // Must be near the table to sit (movement → seating are one system).
    const dist = Math.hypot(player.x - table.x, player.z - table.z);
    if (dist > SIT_RANGE) {
      this.notice(client, "Walk closer to the table to sit.", "warn");
      return;
    }

    const buyIn = Math.min(this.balances.get(client.sessionId) ?? 0, POKER.startingStack);
    if (buyIn < POKER.bigBlind) {
      this.notice(client, "Not enough chips to sit.", "warn");
      return;
    }

    const ok = engine.sit(msg.seatIndex, client.sessionId, player.name, buyIn);
    if (!ok) {
      this.notice(client, "Seat unavailable.", "warn");
      return;
    }

    // Move the buy-in from balance onto the table.
    this.balances.set(client.sessionId, (this.balances.get(client.sessionId) ?? 0) - buyIn);
    player.seatedTable = msg.tableId;
    player.seatIndex = msg.seatIndex;
    // Snap avatar to the seat position around the table.
    const angle = (msg.seatIndex / TABLE.seats) * Math.PI * 2;
    player.x = table.x + Math.cos(angle) * TABLE.seatRadius;
    player.z = table.z + Math.sin(angle) * TABLE.seatRadius;
    player.heading = Math.atan2(table.z - player.z, table.x - player.x);
    this.syncTable(msg.tableId);
  }

  private doStand(sessionId: string): void {
    const player = this.state.players.get(sessionId);
    if (!player || !player.seatedTable) return;
    const engine = this.engines.get(player.seatedTable);
    if (engine) {
      const returnedStack = engine.stand(sessionId);
      if (returnedStack != null) {
        this.balances.set(sessionId, (this.balances.get(sessionId) ?? 0) + returnedStack);
      }
      this.syncTable(player.seatedTable);
    }
    player.seatedTable = "";
    player.seatIndex = -1;
    // Step back from the table.
    player.z = clamp(player.z + 2, -FLOOR_HALF, FLOOR_HALF);
  }

  // ── State mirroring ─────────────────────────────────────────────────────────

  /** Copy an engine's public state into the corresponding TableState schema. */
  private syncTable(tableId: string): void {
    const engine = this.engines.get(tableId);
    const table = this.state.tables.find((t) => t.id === tableId);
    if (!engine || !table) return;
    const pub = engine.getPublicState();

    table.phase = pub.phase;
    table.totalPot = pub.totalPot;
    table.currentBet = pub.currentBet;
    table.minRaise = pub.minRaise;
    table.buttonSeat = pub.buttonSeat;
    table.activeSeat = pub.activeSeat;
    table.lastResult = pub.lastResult ?? "";

    table.community = new ArraySchema<string>(...pub.community);

    table.pots = new ArraySchema<PotSchema>(
      ...pub.pots.map((p) => {
        const ps = new PotSchema();
        ps.amount = p.amount;
        ps.eligible = new ArraySchema<string>(...p.eligible);
        return ps;
      }),
    );

    table.seats = new ArraySchema<SeatSchema>(
      ...pub.seats.map((s) => {
        const ss = new SeatSchema();
        ss.seatIndex = s.seatIndex;
        ss.playerId = s.playerId;
        ss.name = s.name;
        ss.stack = s.stack;
        ss.committed = s.committed;
        ss.folded = s.folded;
        ss.allIn = s.allIn;
        ss.toAct = s.toAct;
        ss.revealed = new ArraySchema<string>(...s.revealed);
        return ss;
      }),
    );
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private nameOf(sessionId: string): string {
    return this.state.players.get(sessionId)?.name ?? sessionId.slice(0, 6);
  }

  private notice(client: Client, text: string, level: NoticePayload["level"]): void {
    client.send(ServerMessage.Notice, { text, level } satisfies NoticePayload);
  }

  private broadcastNotice(text: string, level: NoticePayload["level"]): void {
    this.broadcast(ServerMessage.Notice, { text, level } satisfies NoticePayload);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
