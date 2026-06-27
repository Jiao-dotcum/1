import { Client, Room } from "colyseus.js";
import {
  ClientMessage,
  ServerMessage,
  type MovePayload,
  type SitPayload,
  type PokerActionPayload,
  type ModerationPayload,
  type HoleCardsMessage,
  type VoiceTokenPayload,
  type NoticePayload,
  type PokerAction,
} from "@pokerpandey/shared";

const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ??
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:2567`;

export interface NetCallbacks {
  onHoleCards?: (msg: HoleCardsMessage) => void;
  onVoiceToken?: (msg: VoiceTokenPayload) => void;
  onNotice?: (msg: NoticePayload) => void;
}

/**
 * Thin wrapper over the Colyseus room. State is read via `room.state`
 * (decoded by colyseus.js reflection — no local schema needed).
 */
export class Net {
  client: Client;
  room!: Room;
  cb: NetCallbacks = {};

  constructor() {
    this.client = new Client(SERVER_URL);
  }

  async join(name: string): Promise<Room> {
    this.room = await this.client.joinOrCreate("casino", { name });

    this.room.onMessage(ServerMessage.HoleCards, (m: HoleCardsMessage) => this.cb.onHoleCards?.(m));
    this.room.onMessage(ServerMessage.VoiceToken, (m: VoiceTokenPayload) => this.cb.onVoiceToken?.(m));
    this.room.onMessage(ServerMessage.Notice, (m: NoticePayload) => this.cb.onNotice?.(m));

    return this.room;
  }

  get sessionId(): string {
    return this.room.sessionId;
  }

  // ── Senders ────────────────────────────────────────────────────────────────

  move(p: MovePayload): void {
    this.room.send(ClientMessage.Move, p);
  }
  sit(p: SitPayload): void {
    this.room.send(ClientMessage.Sit, p);
  }
  stand(): void {
    this.room.send(ClientMessage.Stand, {});
  }
  pokerAction(tableId: string, action: PokerAction): void {
    this.room.send(ClientMessage.PokerAction, { tableId, action } satisfies PokerActionPayload);
  }
  block(targetId: string): void {
    this.room.send(ClientMessage.Block, { targetId } satisfies ModerationPayload);
  }
  mute(targetId: string): void {
    this.room.send(ClientMessage.Mute, { targetId } satisfies ModerationPayload);
  }
  report(targetId: string, reason: string): void {
    this.room.send(ClientMessage.Report, { targetId, reason } satisfies ModerationPayload);
  }
  kick(targetId: string): void {
    this.room.send(ClientMessage.Kick, { targetId } satisfies ModerationPayload);
  }
  voiceKillSwitch(on: boolean): void {
    this.room.send(ClientMessage.VoiceKillSwitch, on);
  }
}
