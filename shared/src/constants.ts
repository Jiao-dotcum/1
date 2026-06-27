/**
 * Shared constants for the casino floor, movement, spatial audio, and poker.
 * Imported by both client and server — never duplicate these.
 */

/** Network tick rate for position broadcasts (Hz). */
export const POSITION_BROADCAST_HZ = 15;

/** Movement speed of an avatar in world units per second. */
export const MOVE_SPEED = 4.0;

/** Radius of the capsule avatar (world units). Used for collision-ish spacing. */
export const AVATAR_RADIUS = 0.4;

/** Casino floor half-extent (world is [-FLOOR_HALF, FLOOR_HALF] on X and Z). */
export const FLOOR_HALF = 20;

/** Spatial audio tuning. Distances are in world units (== meters for PannerNode). */
export const AUDIO = {
  /** Below this distance a source is at full volume. */
  refDistance: 1.5,
  /** Beyond this distance a source is silent (hard cutoff). */
  maxDistance: 12,
  /** How aggressively volume falls off between ref and max. */
  rolloffFactor: 1.4,
  /** Inner cone is omni; we use distance-only + panning, so cone is full sphere. */
  panningModel: "HRTF" as PanningModelType,
  distanceModel: "linear" as DistanceModelType,
} as const;

/** Poker table geometry / seating. */
export const TABLE = {
  /** Number of seats per table. */
  seats: 6,
  /** Radius of the table model (world units). */
  radius: 1.6,
  /** Distance from table center to a seated avatar. */
  seatRadius: 2.2,
};

/** Poker game economics (play money only). */
export const POKER = {
  smallBlind: 5,
  bigBlind: 10,
  /** Chips granted to a new identity. */
  startingStack: 1000,
  /** Minimum players to start a hand. */
  minPlayers: 2,
  /** Seconds before an auto-action (check/fold) on timeout. 0 = disabled for now. */
  actionTimeoutSec: 0,
};

/** Re-export type aliases for Web Audio enums so non-DOM (server) builds compile. */
type PanningModelType = "equalpower" | "HRTF";
type DistanceModelType = "linear" | "inverse" | "exponential";
