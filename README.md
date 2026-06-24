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

## 🌐 Shared live list + phone push (optional, recommended)

Out of the box, Pixel Pal is **on-device only** (the pill in the header reads
`on-device`). Turn on a small free Firebase backend and it becomes a **shared
live list** — when anyone speaks *"reservation, 7 PM Friday"*, it pops up on
**every** open device instantly — plus **real phone push that rings even when
the site is closed**. The header pill flips to `LIVE · shared`.

### 1. Create the Firebase project (free)

1. Go to <https://console.firebase.google.com> → **Add project**.
2. Inside it, click the **`</>` (Web)** icon to register a web app. Copy the
   `firebaseConfig` values it shows you.
3. **Build → Firestore Database → Create database** (test mode is fine to start;
   the real rules are in [`firestore.rules`](firestore.rules)).
4. **Project settings (gear) → Cloud Messaging → Web Push certificates →
   Generate key pair.** Copy that key string.

### 2. Paste your keys in two places

- [`firebase-config.js`](firebase-config.js): fill in `firebaseConfig`, set
  `vapidKey` to the Web Push key, and set **`ENABLED = true`**.
- [`firebase-messaging-sw.js`](firebase-messaging-sw.js): paste the **same**
  `firebaseConfig` (the background push worker needs its own copy).

That's enough for the **shared live list** and for push **while at least one
device has the app open/installed**.

### 3. Ring even when *everyone* has it closed

The included Cloud Function does the firing server-side, so phones ring with no
device awake. Deploy it once:

```bash
npm i -g firebase-tools          # one-time
firebase login
firebase use --add               # pick your project
cd functions && npm install && cd ..
firebase deploy                  # deploys hosting + rules + the function
```

- The scheduled function ([`functions/index.js`](functions/index.js)) needs
  Firebase's **Blaze** (pay-as-you-go) plan enabled — at personal scale this
  realistically costs **$0**.
- `firebase deploy` also hosts the site, giving you an `https://…web.app` URL.
  **Open that URL on your phone and "Add to Home Screen"** — that installs it as
  an app so push can ring reliably (iOS requires the home-screen install for web
  push).

> ⚠️ You chose **one global list everyone shares**, so the Firestore rules are
> open: anyone with the URL can see and edit the tasks. To lock it down later,
> add Firebase Auth or a shared secret and tighten [`firestore.rules`](firestore.rules).

If Firebase is off or can't load, the app silently falls back to the private
on-device list — nothing breaks.

## 🧩 Tech

Vanilla **HTML / CSS / JavaScript** front-end. Optional **Firebase** backend
(Firestore + Cloud Messaging + one Cloud Function) for sync and push.

| Concern              | How |
|----------------------|-----|
| Voice input          | Web Speech API (`SpeechRecognition`) |
| Spoken reminders     | Web Speech API (`SpeechSynthesis`) |
| In-app notifications | Notification API + custom pixel toasts |
| Live shared list     | Cloud Firestore realtime listeners |
| Phone push (closed)  | Firebase Cloud Messaging + scheduled Cloud Function |
| Sound effects        | Web Audio API (procedural chiptune) |
| Pixel buddy + stars  | `<canvas>` drawn pixel-by-pixel |
| Per-device progress  | `localStorage` (XP / level / streak) |

### Files

- `index.html` — markup and layout
- `styles.css` — the pixel/arcade theme
- `app.js` — voice, reminders, the buddy, gamification, UI
- `store.js` — data layer; realtime Firestore sync + push registration
- `firebase-config.js` — **your keys go here** (off by default)
- `firebase-messaging-sw.js` — background push service worker
- `functions/` — Cloud Function that fires reminders when all devices are closed
- `firebase.json`, `firestore.rules`, `firestore.indexes.json` — deploy config

## 📝 Notes

- **On-device mode:** everything stays in your browser; nothing leaves the device.
- **Shared mode:** the task list lives in your Firestore; your XP/level/streak
  stay per-device.
- Phone push that rings while closed needs the Cloud Function deployed (step 3).
  Without it, reminders still fire on any device that has the app open.
