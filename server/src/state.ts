import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

/** A player on the casino floor (avatar position + seat membership). */
export class PlayerState extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("number") x = 0;
  @type("number") z = 0;
  @type("number") heading = 0;
  /** Table id the player is seated at, or "" if roaming. */
  @type("string") seatedTable = "";
  /** Seat index at that table, or -1. */
  @type("number") seatIndex = -1;
  /** Whether this player's mic is muted by the global kill switch / self. */
  @type("boolean") voiceMuted = false;
}

/** A pot mirrored from the engine for display. */
export class PotSchema extends Schema {
  @type("number") amount = 0;
  @type(["string"]) eligible = new ArraySchema<string>();
}

/** A poker seat mirrored from the engine (public-safe; no hidden hole cards). */
export class SeatSchema extends Schema {
  @type("number") seatIndex = -1;
  @type("string") playerId = "";
  @type("string") name = "";
  @type("number") stack = 0;
  @type("number") committed = 0;
  @type("boolean") folded = false;
  @type("boolean") allIn = false;
  @type("boolean") toAct = false;
  @type(["string"]) revealed = new ArraySchema<string>();
}

/** A poker table: floor position + mirrored public poker state. */
export class TableState extends Schema {
  @type("string") id = "";
  @type("number") x = 0;
  @type("number") z = 0;
  @type("string") phase = "waiting";
  @type(["string"]) community = new ArraySchema<string>();
  @type([PotSchema]) pots = new ArraySchema<PotSchema>();
  @type("number") totalPot = 0;
  @type("number") currentBet = 0;
  @type("number") minRaise = 0;
  @type("number") buttonSeat = 0;
  @type("number") activeSeat = -1;
  @type("string") lastResult = "";
  @type([SeatSchema]) seats = new ArraySchema<SeatSchema>();
}

/** Root casino-floor state synced to all clients. */
export class CasinoState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type([TableState]) tables = new ArraySchema<TableState>();
  /** Global voice kill switch (moderator toggle). When true, all mics are silenced. */
  @type("boolean") voiceKillSwitch = false;
}
