# 🐼 PokerPandey

A browser-based multiplayer **poker casino with proximity voice chat**. Roam a 3D casino
floor, hear tables swell and fade as you move, and **sit to join a table's game *and* its
conversation in one act**. Movement, voice, and poker are one interlocking system, not three
bolted-together features.

See **[VISION.md](./VISION.md)** for the north star and **[SETUP.md](./SETUP.md)** to run it.

## Architecture

TypeScript monorepo (pnpm workspaces):

```
shared/   @pokerpandey/shared — network messages, constants, poker domain types (one source of truth)
server/   @pokerpandey/server — Colyseus authoritative room + per-table Hold'em engine + LiveKit tokens
client/   @pokerpandey/client — Three.js scene, capsule avatars, Web Audio spatial voice, betting UI
```

- **State sync**: [Colyseus](https://colyseus.io) — one `CasinoRoom` owns floor state
  (players, positions, tables, seat occupancy) and the authoritative poker logic per table.
- **Rendering**: [Three.js](https://threejs.org) + [Vite](https://vitejs.dev).
- **Spatial voice**: [LiveKit](https://livekit.io) mics routed through Web Audio
  `PannerNode`s positioned at each avatar — distance falloff, max-distance cutoff, stereo
  panning by direction.
- **Hand evaluation**: [`pokersolver`](https://github.com/goldfire/pokersolver) for 7-card
  ranking (never hand-rolled). The server owns deck, deals, betting, pots, and side pots.

### Hard rules (enforced in [CLAUDE.md](./CLAUDE.md))

- **100% server-authoritative poker.** Clients receive only their own hole cards; the server
  validates every action and computes pots/winners. Never trust the client.
- **Play money only.** No real-money logic anywhere.
- **Moderation from day one.** Mute / block / report + server-side kick + a global voice kill
  switch ship with the first voice commit.

## Run it

```bash
pnpm install
cp .env.example .env       # add LiveKit keys for voice (optional — see SETUP.md)
pnpm dev                   # server :2567 + client :5173
```

Open **two browser tabs** at http://localhost:5173 to see two avatars sync. Move with
**WASD**/arrows, press **E** near a table to sit, **E** again to stand. Walk toward a table
to hear it get louder (voice requires LiveKit keys).

### Commands

```bash
pnpm dev          # run server + client together
pnpm -r typecheck # typecheck every package
pnpm test         # poker engine unit tests (side pots, payouts, privacy)
pnpm build        # production build of all packages
# integration smoke (start a server first):
pnpm --filter @pokerpandey/server start &   # or: pnpm --filter @pokerpandey/server dev
pnpm --filter @pokerpandey/client smoke      # drives 2 clients: join→sit→deal, asserts no leaks
```

## Built vs Stubbed

### ✅ Built (Phases 0–3)

- **Phase 0 — Netcode skeleton.** Colyseus + Three.js; capsule avatars on a floor; positions
  sync at 15 Hz with client-side prediction + remote interpolation. Two tabs drive two avatars.
- **Phase 1 — Proximity voice.** LiveKit mics routed through Web Audio `PannerNode`s at each
  avatar's position: distance falloff, max-distance cutoff, HRTF stereo panning by direction.
  Degrades gracefully to silent if LiveKit isn't configured.
- **Phase 2 — Casino floor.** A room with 4 tables + 6 seat slots each; walk up and press E to
  sit, stand to leave; occupancy synced; each table is a voice zone (tablemates full volume,
  passersby get falloff). Spectators near a table see its live state.
- **Phase 3 — Poker engine.** Server-side Texas Hold'em per table: blinds, deal, betting
  rounds, all-ins, **main pot + correct side pots**, showdown via `pokersolver`, payout. Clean
  betting UI (fold / check / call / bet / raise slider / all-in), play-money balances. Multiple
  tables run concurrent hands. **No card leaks** (verified in tests + the integration smoke).
- **Moderation.** Mute/block (client-side audio gain), report (server-logged), server-side
  kick, and a global voice kill switch — all wired from the first voice commit.

### 🟡 Stubbed (Phase 4 — see [docs/PHASE4.md](./docs/PHASE4.md))

- Many concurrent tables / multi-room scaling (single room caps at 32 clients).
- Persistent accounts + chip balances (currently in-memory per session).
- Reconnection (currently drops on disconnect; chips returned).
- Nicer avatars + sit/deal/chip animations (currently capsules + instant snaps).

## ✋ Verify manually (perceptual — can't be unit-tested)

These need a human ear/eye. Open two+ tabs (a second device or headphones help), give mic
permission, and with LiveKit keys configured check:

1. **Roaming sounds alive** — moving around the floor, you can hear other players/tables as
   ambient, directional sound.
2. **Approach raises volume** — walking *toward* another player/table makes them **audibly
   louder**; walking away makes them quieter.
3. **Direction is correct** — someone on your **left** sounds like they're on your left;
   panning tracks their position as you turn.
4. **Max-distance cutoff** — far enough away, a source goes **silent** (no faint bleed).
5. **Sitting joins the voice zone** — taking a seat snaps tablemates to clear, **full-volume**
   audio regardless of seat spacing; standing fades them back to proximity falloff.
6. **Moderation by ear** — muting/blocking a player silences *them only*; the **voice kill
   switch** silences **all** mics immediately; **kick** removes a player.
7. **Poker feels right end-to-end** — deal, bet, fold, all-in, showdown, payout; the board and
   pot read clearly; you only ever see your own hole cards.

(Automatable gates — typecheck, build, unit tests, and the 2-client integration smoke — are
all green; see Commands above.)
