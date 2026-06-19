# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Pixel Pal — Voice Task Reminder

A retro pixel-art, voice-driven task reminder web app. The user speaks tasks, the
app captures them, and a pixel buddy nags them with notifications until tasks are
done. Gamified (XP / levels / streaks) to be engaging for easily-distracted users.

## Architecture

Pure vanilla front-end — no build step, no dependencies, no network calls.

- `index.html` — markup/layout (loads Google Fonts: Press Start 2P, VT323).
- `styles.css` — the pixel/arcade theme (CSS only; box-shadow pixel borders,
  keyframe animations, scanline overlay).
- `app.js` — a single IIFE containing all logic:
  - **Speech recognition** via `webkitSpeechRecognition` (voice → task), with a
    lightweight natural-language time parser (`parseWhen`) for "in 10 minutes",
    "tomorrow", etc.
  - **Reminders**: a 1s `setInterval` scheduler checks `remindAt`; fires in-app
    toasts, native `Notification`, spoken `SpeechSynthesis`, and chiptune SFX.
    "Nag" mode re-arms every 5 minutes until completed.
  - **Pixel buddy**: a 16×16 sprite drawn cell-by-cell on `<canvas>` with mood
    states (idle / listen / happy / think); plus an animated starfield canvas.
  - **Gamification**: XP, levels (`xpForLevel`), daily streak.
  - **Persistence**: all state in `localStorage` under key `pixelpal.v1`.

## Commands

- No build/lint/test tooling. To run: open `index.html`, or serve locally with
  `python3 -m http.server 8000` (recommended so mic/notifications work) and visit
  `http://localhost:8000`.
- Syntax-check JS with: `node --check app.js`.

## Guidance

- Keep it dependency-free and runnable by just opening the file.
- Microphone and Notification APIs require a user gesture and permission; the
  voice features need a Chromium-based browser and ideally an http(s) origin.
