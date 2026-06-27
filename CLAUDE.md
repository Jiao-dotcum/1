# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code
in this repository. It is auto-loaded every session — treat it as the persistent rulebook.

## Project

**PokerPandey** — a browser-based multiplayer poker casino with proximity voice chat.
Roam a 3D casino floor, hear tables swell and fade as you move, sit to join a table's
game *and* its conversation in one act. Movement, voice, and poker are ONE interlocking
system. See `VISION.md` for the north star and `SETUP.md` to run it locally.

## LOCKED STACK (do not re-litigate)

- **TypeScript monorepo**: `/client`, `/server`, `/shared`, pnpm workspaces.
- **Client**: Three.js + Vite.
- **State sync**: Colyseus (authoritative server rooms).
- **Server**: Node.
- **Spatial voice**: LiveKit + Web Audio `PannerNode`s.
- **Hand evaluation**: `pokersolver` — never hand-roll 7-card ranking.

## HARD RULES (never violate)

- **Poker is 100% server-authoritative.** The server owns the deck, deals, validates
  every action, and computes pots/winners. Clients receive ONLY their own hole cards.
  Never trust the client for anything that affects game state.
- **Play money only.** No real-money logic anywhere, ever.
- **Moderation from day one.** Mute / block / report + server-side kick + a global voice
  kill switch exist from the first voice commit. No open mics without moderation hooks.

## CONVENTIONS

- Keep the build green and the repo pushable at all times. **Commit at every gate.**
- Shared types live in `/shared`, imported by both sides — never duplicated.
- Update README's "Built vs Stubbed" section as each phase completes.
- Server is the source of truth; the client renders state and sends intents only.

## Commands

Run from the repo root (pnpm workspaces):

```bash
pnpm install            # install all workspace deps
pnpm -r typecheck       # typecheck every package
pnpm --filter @pokerpandey/shared build   # build shared types (do this before server/client)
pnpm --filter @pokerpandey/server dev     # run Colyseus server (default :2567)
pnpm --filter @pokerpandey/client dev     # run Vite client (default :5173)
pnpm dev                # run server + client together
pnpm -r build           # production build of all packages
pnpm test               # run unit tests (poker engine)
```

To play locally, run the server and client, then open two browser tabs at the client URL.

## Architecture (current)

- `shared/` — `@pokerpandey/shared`. Network message types, game constants, the poker
  engine types, and plain types shared by both sides.
- `server/` — Colyseus rooms. `CasinoRoom` holds floor state (players, positions, tables,
  seat occupancy) and owns all poker logic per table. Authoritative.
- `client/` — Three.js scene, capsule avatars, movement, LiveKit spatial audio wiring,
  and the poker/betting UI.

## Status

See README "Built vs Stubbed". Phases 0–3 are functional; Phase 4 is scaffolded with
stubs + TODOs (many concurrent tables, nicer avatars/animations, spectating, reconnection,
persistent accounts).
