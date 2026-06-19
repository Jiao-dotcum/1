# 🎮 Pixel Pal — Voice Task Reminder

A fun, retro **pixel-art** task reminder you talk to. Tap the mic, say what you
need to remember, and your pixel buddy keeps nudging you with notifications until
you've done it. Built to be playful and engaging enough that even a restless,
easily-distracted brain *wants* to look at it.

![pixel art, arcade-style UI](https://img.shields.io/badge/style-pixel%20art-7b5cff)

## ✨ What it does

- 🎙️ **Speak your tasks** — uses the browser's Speech Recognition to capture
  what you say. It even understands timing like *"remind me to drink water in
  10 minutes"* or *"call mom tomorrow."*
- ⏰ **Keeps reminding you** — fires in-app toast notifications **and** native OS
  notifications when the time comes. Turn on **"nag me until done"** and it'll
  keep poking you every few minutes until the quest is complete.
- 🔊 **It talks back** — your buddy reads reminders aloud and plays chiptune sound
  effects.
- 🕹️ **A living pixel buddy** — a hand-drawn 16×16 sprite (rendered cell-by-cell
  on a canvas) that blinks, bobs, chatters while listening, and cheers when you
  finish something.
- 🏆 **Gamified focus** — earn XP, level up, and build a daily streak. Completing
  quests feels rewarding (floating XP, level-up bursts, satisfying sounds) — the
  hook that helps an ADHD brain keep coming back.
- ⭐ Animated starfield, CRT scanlines, and a `Press Start 2P` arcade UI.

## 🚀 Run it

No build step, no dependencies. Just open the file:

```bash
# from the repo root
open index.html        # macOS
xdg-open index.html    # Linux
# or simply double-click index.html
```

For the best experience (microphone + notifications), use **Google Chrome** or
another Chromium-based browser and allow mic + notification permissions when
prompted. Serving over `http://localhost` or `https://` is recommended, since
some browsers restrict the microphone on `file://`:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

## 🎛️ How to use

1. Tap **TAP TO SPEAK** (or press the **Space** bar) and say your task.
2. Pick when to be reminded with the chips (*now-ish, 10m, 30m, 1h, 3h*), or just
   say it ("...in 2 hours").
3. Flip **"nag me until done"** for tasks you tend to ignore.
4. When a reminder pops, hit **✓ done** or **+10m** to snooze.
5. No mic? Click **⌨ type** to add a quest by keyboard.

## 🧩 Tech

Pure vanilla **HTML / CSS / JavaScript** — no frameworks, no network calls.

| Concern            | How |
|--------------------|-----|
| Voice input        | Web Speech API (`SpeechRecognition`) |
| Spoken reminders   | Web Speech API (`SpeechSynthesis`) |
| Notifications      | Notification API + custom in-app toasts |
| Sound effects      | Web Audio API (procedural chiptune) |
| Pixel buddy + stars| `<canvas>` drawn pixel-by-pixel |
| Persistence        | `localStorage` |

### Files

- `index.html` — markup and layout
- `styles.css` — the pixel/arcade theme
- `app.js` — voice, reminders, the buddy, gamification

## 📝 Notes

- Everything is stored locally in your browser; nothing leaves your device.
- Native OS notifications and timers run while the tab is open. Keep the tab
  alive for reminders to fire reliably.
