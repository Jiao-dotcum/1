# Phase 4 — Scaffold (stubs + TODOs)

Phase 4 is intentionally **scaffolded, not built**. Phases 0–3 are functional; this
file enumerates the Phase 4 surface and points at the seams in the code where each
piece plugs in. Every item below is a `TODO(phase4)` in the source.

## Status of each item

| Item | State today | Where it plugs in |
| --- | --- | --- |
| **Multiple concurrent tables** | ✅ Works: 4 tables, one authoritative `PokerEngine` each, dealing/betting independently in the same room. | `server/src/CasinoRoom.ts` (`TABLE_LAYOUT`, `engines` map) |
| **Many tables / scaling** | 🟡 Stub: single room caps at `maxClients = 32`. Scaling to many rooms/processes is not done. | `CasinoRoom.maxClients`; Colyseus matchmaking / multiple room instances |
| **Spectating** | ✅ Basic: standing within range of a table shows its live state (read-only); walking up and taking an open seat is the on-ramp. | `client/src/main.ts` (`SPECTATE_RANGE`), `PokerUI` |
| **Persistent accounts + balances** | 🟡 Stub: balances are in-memory per session. | `server/src/persistence.ts` (`AccountStore`), `CasinoRoom.balances` |
| **Reconnection** | 🟡 Stub: disconnect drops the player and returns chips immediately. | `CasinoRoom.onLeave` — wrap in `allowReconnection` |
| **Nicer avatars + sit/deal/chip animations** | 🟡 Stub: capsules + instant snaps; no tweened sit/deal/chip motion. | `client/src/scene.ts` (avatar meshes), `PokerUI` (card reveal) |

## TODO seams

### Persistence (`server/src/persistence.ts`)
- Replace `InMemoryAccountStore` with a durable store (SQLite/Postgres/Redis).
- Key identity off a real auth provider id, not the Colyseus `sessionId`.
- Persist balance on stand-up and disconnect; load on (re)join.

### Reconnection (`server/src/CasinoRoom.ts` → `onLeave`)
- For consented disconnects: `await this.allowReconnection(client, 30)`.
- Hold the seat + chips during the grace window; restore on reconnect.
- Fold the absent player's live hand if the window expires mid-hand.

### Concurrent-table scaling
- Spin up additional room instances / shard across processes via Colyseus
  matchmaking; surface a table browser on the client.

### Avatars & animations (`client/src/scene.ts`, `client/src/pokerUI.ts`)
- Replace capsules with rigged avatars; tween sit/stand.
- Animate dealing (cards flying from the button), chip motion into the pot,
  and showdown card flips.

### Moderation (Phase 4 hardening)
- Gate `kick` and the voice kill switch behind real moderator auth
  (`CasinoRoom` currently trusts the message — see `TODO(phase4)` there).
- Route `report` to a real moderation queue with persistence.
