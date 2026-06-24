# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Pixel Pal — Voice Task Reminder

A retro pixel-art, voice-driven task reminder web app. The user speaks tasks, the
app captures them, and a pixel buddy nags them with notifications until tasks are
done. Gamified (XP / levels / streaks) to be engaging for easily-distracted users.

## Architecture

Vanilla front-end (no build step). An **optional Firebase backend** adds a
shared realtime task list and phone push; when it's off the app runs fully
on-device. The app degrades gracefully if Firebase isn't configured or fails.

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
    advances task state; in **firebase** mode the Cloud Function is authoritative
    for firing (so phones ring when closed) and the client only shows an in-app
    reminder once per `(id, remindAt)`. "Nag" re-arms every 5 min.
  - **Pixel buddy**: 16×16 sprite on `<canvas>` (idle/listen/happy/think) +
    starfield canvas.
  - **Gamification** is per-device: XP/level/streak in `localStorage` under
    `pixelpal.profile.v1`. Tasks (shared) are `pixelpal.tasks.v1` in local mode.

### Backend (optional, off by default)

- `firebase-config.js` — user pastes keys; `ENABLED` flag gates everything.
- `store.js` — ES module. Lazy-imports Firebase from the gstatic CDN, does
  Firestore `onSnapshot` realtime sync of the `tasks` collection, and registers
  FCM tokens into `pushTokens`. Exposes `window.PixelStore`.
- `firebase-messaging-sw.js` — background push service worker (needs its own
  copy of `firebaseConfig` pasted in).
- `functions/index.js` — scheduled Cloud Function (`every 1 minutes`) that pushes
  due reminders to all `pushTokens` and advances task state. Requires Blaze plan.
- `firebase.json`, `firestore.rules` (open — global shared list), `firestore.indexes.json`.

## Commands

- No front-end build/lint/test. To run: open `index.html`, or serve with
  `python3 -m http.server 8000` and visit `http://localhost:8000`.
- Syntax-check JS: `node --check app.js` (also `store.js`, `functions/index.js`).
- Deploy backend: `firebase deploy` (after `cd functions && npm install`).

## Guidance

- Keep the app runnable with zero setup — Firebase must stay optional and the
  local fallback must never break.
- Tasks are shared; XP/level/streak are intentionally per-device.
- If you change `firebaseConfig` keys, they must be updated in BOTH
  `firebase-config.js` and `firebase-messaging-sw.js`.
- Microphone/Notification/Service Worker APIs need a user gesture and an
  http(s) origin (service workers don't run on `file://`).
