# SETUP.md — Running PokerPandey locally

## Prerequisites

- **Node.js** ≥ 20 (tested on Node 22)
- **pnpm** ≥ 9 (`npm i -g pnpm`)
- A modern browser (Chrome/Edge/Firefox). Microphone permission needed for voice.

## 1. Install

```bash
pnpm install
```

## 2. Get LiveKit Cloud keys (free tier)

Proximity voice (Phase 1+) needs a LiveKit server. The free Cloud tier is the easiest path.

1. Go to **https://cloud.livekit.io** and sign up (free).
2. Create a **project**. LiveKit will give you a project (a.k.a. "server") URL that looks
   like `wss://YOUR-PROJECT.livekit.cloud`.
3. In the project, open **Settings → Keys** and create an **API key**. You'll get:
   - an **API Key** (looks like `APIxxxxxxxx`)
   - an **API Secret** (a long string — shown once, copy it now)
4. Copy `.env.example` to `.env` in the repo root and fill in:

   ```bash
   cp .env.example .env
   ```

   ```ini
   LIVEKIT_URL=wss://YOUR-PROJECT.livekit.cloud
   LIVEKIT_API_KEY=APIxxxxxxxx
   LIVEKIT_API_SECRET=your-secret-here
   ```

The server reads these to mint short-lived join tokens for clients. **Never commit `.env`.**

> No LiveKit keys yet? Everything except voice still runs. The voice layer degrades
> gracefully: without keys the server won't mint tokens and the client simply runs silent
> (movement, the floor, and poker all work). You can do all of Phases 0, 2, and 3 keyless.

### Optional: self-hosted LiveKit

You can run LiveKit locally instead of Cloud:

```bash
docker run --rm -p 7880:7880 -p 7881:7881 \
  -e LIVEKIT_KEYS="devkey: devsecret" livekit/livekit-server --dev
```

Then set `LIVEKIT_URL=ws://localhost:7880`, `LIVEKIT_API_KEY=devkey`,
`LIVEKIT_API_SECRET=devsecret`.

## 3. Run everything

```bash
pnpm dev
```

This starts the Colyseus server (`http://localhost:2567`) and the Vite client
(`http://localhost:5173`) together. Open **two browser tabs** at the client URL to see two
avatars sync.

Or run them separately:

```bash
pnpm --filter @pokerpandey/server dev
pnpm --filter @pokerpandey/client dev
```

## 4. Verify

```bash
pnpm -r typecheck   # types are clean across all packages
pnpm test           # poker engine unit tests (side pots, ranking)
```

See the README's **"Verify manually"** checklist for the perceptual things (audio gets
louder/panned as you approach a table) that can't be unit-tested.

## Ports & env

| What            | Default                  | Override                         |
| --------------- | ------------------------ | -------------------------------- |
| Server          | `2567`                   | `PORT`                           |
| Client          | `5173`                   | Vite `--port`                    |
| Client → server | `ws://localhost:2567`    | `VITE_SERVER_URL` (client `.env`)|
| LiveKit         | from `.env`              | `LIVEKIT_URL`                    |
