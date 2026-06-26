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

## 🌐 Shared live list + phone push (optional, 100% free — no credit card)

Out of the box, Pixel Pal is **on-device only** (the header pill reads
`on-device`). Turn on a free **Supabase** backend and it becomes a **shared
live list** — when anyone speaks *"reservation, 7 PM Friday"*, it pops up on
**every** open device instantly — plus **real phone push that rings even when
the site is closed**. The pill flips to `LIVE · shared`.

Supabase's free tier needs **no credit card**. (Firebase's equivalent forces a
billing card for its scheduled function — that's why we use Supabase.)

### 1. Create the Supabase project (free)

1. Sign up at <https://supabase.com> → **New project** (pick any name/password).
2. Open **SQL Editor → New query**, paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql), and **Run**. This creates the
   tables, indexes, realtime, and access rules.
3. **Project Settings → API**: copy the **Project URL** and the **`anon` public**
   key.

### 2. Turn it on in the client (one file)

In [`supabase-config.js`](supabase-config.js): set `SUPABASE_URL` and
`SUPABASE_ANON_KEY` to the values from step 1, and set **`ENABLED = true`**.
(`VAPID_PUBLIC_KEY` is already filled in — that's the public push key.)

That alone gives you the **shared live list** and reminders that ring on any
device currently running the app.

### 3. Ring even when *everyone* has it closed

A scheduled **Edge Function** sends the push server-side, so phones ring with no
device awake. Using the Supabase CLI:

```bash
npm i -g supabase                       # one-time
supabase login
supabase link --project-ref <PROJECT_REF>

# the Web Push private key (pairs with VAPID_PUBLIC_KEY in supabase-config.js)
supabase secrets set \
  VAPID_PUBLIC_KEY="BNPnpzjii_bDl9_bicPrHbd8i4yO-b8P44CJOxCnqvduFNHrCXot4LT6IkUrbLeU8gVSaM2-s0tPneV3lPnq1d0" \
  VAPID_PRIVATE_KEY="<YOUR_VAPID_PRIVATE_KEY>" \
  VAPID_SUBJECT="mailto:you@example.com"

supabase functions deploy fire-reminders
```

Then schedule it: open **SQL Editor**, paste
[`supabase/cron.sql`](supabase/cron.sql), fill in `<PROJECT_REF>` and your
`service_role` key, and **Run**. It fires every minute.

> The **VAPID private key** is a server secret — it is **not** in this repo. It
> was generated alongside the public key; set it via `supabase secrets set` as
> shown. (Regenerate anytime with `npx web-push generate-vapid-keys` and update
> both the secret and `VAPID_PUBLIC_KEY`.)

### 4. Host the site for free + install on your phone

The front-end is static files, so host them anywhere free. Easiest, since this
repo is already on GitHub: **GitHub Pages** — repo **Settings → Pages → Build
from branch**, pick this branch, root. You'll get a `https://<user>.github.io/1/`
URL. (Cloudflare Pages / Netlify / Vercel work identically.)

On your phone, open that URL → **Add to Home Screen** → launch it from the icon →
allow notifications. The home-screen install is what makes push ring reliably
(iOS requires it for web push).

> ⚠️ You chose **one global list everyone shares**, so the rules are open:
> anyone with the URL can read/edit the tasks. To lock it down later, add
> Supabase Auth or a shared secret and tighten the policies in
> [`supabase/schema.sql`](supabase/schema.sql).

If Supabase is off or can't load, the app silently falls back to the private
on-device list — nothing breaks.

## 🧩 Tech

Vanilla **HTML / CSS / JavaScript** front-end. Optional **Supabase** backend
(Postgres realtime + one scheduled Edge Function) and **standard Web Push** for
sync and notifications. No Firebase, no build step.

| Concern              | How |
|----------------------|-----|
| Voice input          | Web Speech API (`SpeechRecognition`) |
| Spoken reminders     | Web Speech API (`SpeechSynthesis`) |
| In-app notifications | Notification API + custom pixel toasts |
| Live shared list     | Supabase Realtime (Postgres changes) |
| Phone push (closed)  | Web Push (VAPID) + scheduled Supabase Edge Function |
| Sound effects        | Web Audio API (procedural chiptune) |
| Pixel buddy + stars  | `<canvas>` drawn pixel-by-pixel |
| Per-device progress  | `localStorage` (XP / level / streak) |

### Files

- `index.html` — markup and layout
- `styles.css` — the pixel/arcade theme
- `app.js` — voice, reminders, the buddy, gamification, UI
- `store.js` — data layer; Supabase realtime sync + Web Push registration
- `sw.js` — service worker that shows pushed reminders in the background
- `supabase-config.js` — **your Supabase URL + anon key go here** (off by default)
- `supabase/schema.sql` — tables, realtime, access policies
- `supabase/functions/fire-reminders/` — Edge Function that fires reminders
  when every device is closed
- `supabase/cron.sql` — schedules that function every minute

## 📝 Notes

- **On-device mode:** everything stays in your browser; nothing leaves the device.
- **Shared mode:** the task list lives in your Supabase project; your
  XP/level/streak stay per-device.
- Phone push that rings while closed needs the Edge Function deployed +
  scheduled (step 3). Without it, reminders still fire on any device that has
  the app open.
