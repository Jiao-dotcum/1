/**
 * Network message names and payloads between client and server.
 *
 * Position/floor state is synced via Colyseus schema (see server state).
 * These are the discrete message types sent with room.send(name, payload).
 */

import type { PokerAction } from "./poker.js";

/** Client → Server message names. */
export const ClientMessage = {
  /** Player movement input — desired position on the floor. */
  Move: "move",
  /** Request to sit at a table seat. */
  Sit: "sit",
  /** Stand up from current seat. */
  Stand: "stand",
  /** A poker betting action (validated server-side). */
  PokerAction: "poker_action",
  /** Moderation: mute a player locally (also informs server for reporting context). */
  Mute: "mute",
  /** Moderation: block a player. */
  Block: "block",
  /** Moderation: report a player. */
  Report: "report",
  /** Admin-ish: server-side kick (authorized callers only — stubbed auth for now). */
  Kick: "kick",
  /** Toggle the global voice kill switch (moderator). */
  VoiceKillSwitch: "voice_kill_switch",
} as const;

/** Server → Client message names. */
export const ServerMessage = {
  /** Private: your own hole cards for a table. */
  HoleCards: "hole_cards",
  /** A LiveKit join token + url for the voice room. */
  VoiceToken: "voice_token",
  /** A toast/log line for the player (e.g. "You were kicked"). */
  Notice: "notice",
} as const;

export interface MovePayload {
  x: number;
  z: number;
  /** Facing angle in radians (for panning math + rendering). */
  heading: number;
}

export interface SitPayload {
  tableId: string;
  seatIndex: number;
}

export interface PokerActionPayload {
  tableId: string;
  action: PokerAction;
}

export interface ModerationPayload {
  targetId: string;
  /** Free-text reason for reports. */
  reason?: string;
}

export interface VoiceTokenPayload {
  url: string;
  token: string;
  /** The LiveKit room name (one shared casino room; zoning is client-side gain). */
  room: string;
  identity: string;
}

export interface NoticePayload {
  text: string;
  level: "info" | "warn" | "error";
}
