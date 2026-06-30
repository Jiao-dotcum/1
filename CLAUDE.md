# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Pixel Pal — Voice Task Reminder

A retro pixel-art, voice-driven task reminder web app. The user speaks tasks, the
app captures them, and a pixel buddy nags them with notifications until tasks are
done. Gamified (XP / levels / streaks) to be engaging for easily-distracted users.

## Architecture

Vanilla front-end (no build step). An **optional Supabase backend** adds a
shared realtime task list and phone push; when it's off the app runs fully
on-device. The app degrades gracefully if Supabase isn't configured or fails.
Supabase is used (not Firebase) specifically because its free tier needs no
credit card, including the scheduled function.

### Front-end

- `index.html` — markup/layout. Loads `store.js` as `<script type="module">`
  in `<head>`, and `app.js` with `defer` at end of body (order matters: the
  store sets `window.__pixelStorePending` synchronously before `app.js` runs).
- `styles.css` — pixel/arcade theme (CSS only).
- `app.js` — single IIFE with all UI logic:
  - **Store abstraction**: `bootStore()` resolves to either `window.PixelStore`
    (Firebase, set by `store.js`) or a built-in `LocalStore` (localStorage).
    Common API: `mode`, `subscribe`, `add`, `update`, `remove`, `clearDone`,
    `enablePush`, `onPush`.
  - **Speech recognition** via `webkitSpeechRecognition`; `parseWhen` parses
    "in 10 minutes", "tomorrow", etc.
  - **Reminders** (1s `setInterval`): in **local** mode this client fires AND
    advances task state; in **supabase** mode the Edge Function is authoritative
    for firing (so phones ring when closed) and the client only shows an in-app
    reminder once per `(id, remindAt)`. "Nag" re-arms every 5 min.
  - **Pixel buddy**: 16×16 sprite on `<canvas>` (idle/listen/happy/think) +
    starfield canvas.
  - **Gamification** is per-device: XP/level/streak in `localStorage` under
    `pixelpal.profile.v1`. Tasks (shared) are `pixelpal.tasks.v1` in local mode.
  - Mode checks use `Store.mode === "local"` vs everything else — don't hardcode
    the backend name in app.js.

### Backend (optional, off by default)

- `supabase-config.js` — user pastes `SUPABASE_URL` + `SUPABASE_ANON_KEY`;
  `ENABLED` flag gates everything. `VAPID_PUBLIC_KEY` is the public Web Push key
  (committed; safe). The VAPID *private* key is NEVER committed — it's a Supabase
  Edge Function secret.
- `store.js` — ES module (`mode: "supabase"`). Lazy-imports `@supabase/supabase-js`
  from esm.sh, does realtime sync via `postgres_changes` on the `tasks` table
  (re-fetches on change), and subscribes to standard Web Push (`pushManager`),
  saving the subscription to `push_subscriptions`. Exposes `window.PixelStore`.
  DB columns are snake_case (`remind_at`); `fromRow`/`toRow` map to camelCase.
  Lists are scoped by a **room code** (localStorage `pixelpal.room.v1`, or
  `?room=`/`#room=` in the URL); queries/realtime/push all filter by `room`.
  `getRoom()`/`setRoom(code)` switch rooms (empty code = generate a new one).
- `sw.js` — standard service worker: shows the OS notification on `push`,
  relays to open tabs via `postMessage` ({type:"pixelpal-push"}).
- `supabase/schema.sql` — `tasks` + `push_subscriptions` tables, realtime
  publication, open RLS policies (global shared list).
- `supabase/functions/fire-reminders/index.ts` — Deno Edge Function; every
  minute pushes due reminders to all `push_subscriptions` (via `npm:web-push`)
  and advances task state. Reads VAPID_* secrets.
- `supabase/cron.sql` — `pg_cron` + `pg_net` job invoking the Edge Function
  every minute (user fills project ref + service_role key).

## Commands

- No front-end build/lint/test. To run: open `index.html`, or serve with
  `python3 -m http.server 8000` and visit `http://localhost:8000`.
- Syntax-check JS: `node --check app.js` (also `store.js`, `sw.js`).
- Deploy backend: run `supabase/schema.sql` in the SQL editor;
  `supabase functions deploy fire-reminders`; then run `supabase/cron.sql`.

## Guidance

- Keep the app runnable with zero setup — Supabase must stay optional and the
  local fallback must never break.
- Tasks are shared; XP/level/streak are intentionally per-device.
- NEVER commit the VAPID private key or the service_role key. Public VAPID key,
  Supabase URL, and anon key are safe to ship in client code.
- Microphone/Notification/Service Worker/Push APIs need a user gesture and an
  http(s) origin (service workers don't run on `file://`).
