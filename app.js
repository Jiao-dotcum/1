/* ============================================================
   PIXEL PAL — app logic
   Voice capture, reminders, gamification, the pixel buddy.

   Data lives behind a "Store":
     - SHARED mode (Supabase): tasks sync live across every device, and a
       scheduled Edge Function pushes reminders to phones even when closed.
     - LOCAL mode (no backend): tasks live in localStorage on this device.
   Either way the UI is identical. Your XP / level / streak is always
   per-device (in localStorage) — only the task list is shared.

   No external libraries in this file. store.js handles Supabase.
   ============================================================ */
(() => {
  "use strict";

  /* ---------------- per-device profile (never shared) ---------------- */
  const PROFILE_KEY = "pixelpal.profile.v1";
  const profile = loadProfile();
  function loadProfile() {
    try {
      const raw = JSON.parse(localStorage.getItem(PROFILE_KEY));
      if (raw && typeof raw === "object") return Object.assign(defProfile(), raw);
    } catch (_) {}
    // migrate old combined state if present
    try {
      const old = JSON.parse(localStorage.getItem("pixelpal.v1"));
      if (old) return Object.assign(defProfile(), {
        xp: old.xp, level: old.level, streak: old.streak,
        lastDoneDay: old.lastDoneDay, sound: old.sound,
      });
    } catch (_) {}
    return defProfile();
  }
  function defProfile() {
    return { xp: 0, level: 1, streak: 0, lastDoneDay: null, sound: true, pushAsked: false };
  }
  function saveProfile() { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); }

  /* ---------------- built-in LOCAL store (fallback) ---------------- */
  const LocalStore = (() => {
    const KEY = "pixelpal.tasks.v1";
    let tasks = load();
    const subs = [];
    function load() {
      try {
        const raw = JSON.parse(localStorage.getItem(KEY));
        if (Array.isArray(raw)) return raw;
        const old = JSON.parse(localStorage.getItem("pixelpal.v1"));
        if (old && Array.isArray(old.tasks)) return old.tasks;
      } catch (_) {}
      return [];
    }
    function persist() { localStorage.setItem(KEY, JSON.stringify(tasks)); }
    function emit() { subs.forEach((cb) => cb(tasks.slice())); }
    return {
      mode: "local",
      subscribe(cb) { subs.push(cb); cb(tasks.slice()); },
      onPush() {},
      getRoom() { return null; },          // no sharing on-device
      async setRoom() { return null; },
      async add(task) { tasks.unshift(task); persist(); emit(); },
      async update(id, patch) {
        const t = tasks.find((x) => x.id === id);
        if (t) { Object.assign(t, patch); persist(); emit(); }
      },
      async remove(id) { tasks = tasks.filter((x) => x.id !== id); persist(); emit(); },
      async clearDone() { tasks = tasks.filter((x) => !x.done); persist(); emit(); },
      async enablePush() {
        if (!("Notification" in window)) return "denied";
        let perm = Notification.permission;
        if (perm === "default") perm = await Notification.requestPermission();
        return perm === "granted" ? "local" : "denied";
      },
    };
  })();

  /* ---------------- pick which store to use ---------------- */
  let Store = LocalStore;          // replaced by the Supabase store if available
  let tasks = [];                  // mirror of the current task list

  function bootStore() {
    return new Promise((resolve) => {
      let settled = false;
      const decide = () => {
        if (settled) return true;
        if (window.PixelStore) { settled = true; resolve(window.PixelStore); return true; }
        if (window.__pixelStoreLocal) { settled = true; resolve(LocalStore); return true; }
        return false;
      };
      if (decide()) return;
      window.addEventListener("pixelstore-ready", decide, { once: true });
      window.addEventListener("pixelstore-local", decide, { once: true });
      // If Supabase is mid-load, wait longer; otherwise fall back quickly.
      const wait = window.__pixelStorePending ? 9000 : 2000;
      setTimeout(() => { if (!settled) { settled = true; resolve(LocalStore); } }, wait);
    });
  }

  /* ---------------- dom ---------------- */
  const $ = (id) => document.getElementById(id);
  const els = {
    micBtn: $("micBtn"),
    buddyText: $("buddyText"),
    speechBubble: $("speechBubble"),
    liveTranscript: $("liveTranscript"),
    taskList: $("taskList"),
    emptyState: $("emptyState"),
    taskCount: $("taskCount"),
    clearDone: $("clearDone"),
    whenChips: $("whenChips"),
    repeatToggle: $("repeatToggle"),
    statLevel: $("statLevel"),
    statXp: $("statXp"),
    statStreak: $("statStreak"),
    xpFill: $("xpFill"),
    toastStack: $("toastStack"),
    soundBtn: $("soundBtn"),
    alertsBtn: $("alertsBtn"),
    installBtn: $("installBtn"),
    addManualBtn: $("addManualBtn"),
    manualModal: $("manualModal"),
    manualInput: $("manualInput"),
    manualSave: $("manualSave"),
    manualCancel: $("manualCancel"),
    levelup: $("levelup"),
    levelupText: $("levelupText"),
    buddyCanvas: $("buddy"),
    stars: $("stars"),
    syncPill: $("syncPill"),
    syncText: $("syncText"),
    roomPill: $("roomPill"),
    roomName: $("roomName"),
    roomModal: $("roomModal"),
    roomCodeBig: $("roomCodeBig"),
    roomCopy: $("roomCopy"),
    roomShare: $("roomShare"),
    roomInput: $("roomInput"),
    roomNew: $("roomNew"),
    roomCancel: $("roomCancel"),
    roomJoin: $("roomJoin"),
  };

  let selectedDelayMin = 0;

  /* ============================================================
     SOUND — tiny chiptune synth via Web Audio
     ============================================================ */
  let audioCtx = null;
  function ac() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (_) { audioCtx = null; }
    }
    return audioCtx;
  }
  function beep(freq, dur = 0.09, type = "square", vol = 0.05, when = 0) {
    if (!profile.sound) return;
    const ctx = ac(); if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t); osc.stop(t + dur);
  }
  const sfx = {
    add:     () => { beep(523, 0.07); beep(784, 0.09, "square", 0.05, 0.07); },
    done:    () => { beep(523, 0.07); beep(659, 0.07, "square", 0.05, 0.07); beep(988, 0.14, "square", 0.05, 0.14); },
    remind:  () => { beep(880, 0.1); beep(880, 0.1, "square", 0.05, 0.16); },
    levelup: () => { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.12, "square", 0.06, i * 0.1)); },
    listen:  () => { beep(440, 0.06, "sine", 0.04); },
    click:   () => { beep(330, 0.04, "square", 0.03); },
    error:   () => { beep(180, 0.18, "sawtooth", 0.05); },
  };

  /* ============================================================
     SPEECH SYNTHESIS — buddy speaks reminders aloud
     ============================================================ */
  function speak(text) {
    if (!profile.sound || !("speechSynthesis" in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.02; u.pitch = 1.25; u.volume = 0.9;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (_) {}
  }

  /* ============================================================
     THE PIXEL BUDDY — drawn cell-by-cell on a canvas
     ============================================================ */
  const buddy = (() => {
    const cv = els.buddyCanvas;
    const ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const GRID = 16;
    const CELL = cv.width / GRID;
    let mood = "idle";
    let frame = 0;

    const C = {
      _: null,
      B: "#1a1640", P: "#7b5cff", L: "#a98bff", W: "#ffffff",
      K: "#101024", C: "#00e5c0", M: "#ff4f9a", Y: "#ffd23f",
    };

    function sprite(eyesOpen, mouth) {
      const e = eyesOpen ? "W" : "B";
      const p = eyesOpen ? "K" : "B";
      return [
        "______YY________",
        "______BB________",
        "______BB________",
        "____BBBBBB______",
        "___BPPPPPPB_____",
        "__BPLLLLLLPB____",
        "__BP" + e + e + "PP" + e + e + "PB____",
        "__BP" + e + p + "PP" + e + p + "PB____",
        "__BPPPPPPPPB____",
        "_BPCPPPPPPCPB___",
        "_BPP" + mline(mouth) + "PPPPB___",
        "_BPPPPPPPPPPB___",
        "__BPPPPPPPPB____",
        "___BPP__PPB_____",
        "___BB____BB_____",
        "________________",
      ];
    }
    function mline(mouth) {
      if (mouth === "smile") return "MMMM";
      if (mouth === "o") return "MKKM";
      return "BMMB";
    }

    function draw() {
      frame++;
      ctx.clearRect(0, 0, cv.width, cv.height);
      let eyesOpen = true, mouth = "smile";
      if (mood === "idle") { eyesOpen = (frame % 140) > 6; mouth = "smile"; }
      else if (mood === "listen") { eyesOpen = true; mouth = (frame % 20 < 10) ? "o" : "smile"; }
      else if (mood === "happy") { eyesOpen = (frame % 16 < 8); mouth = "smile"; }
      else if (mood === "think") { eyesOpen = (frame % 60) > 6; mouth = "flat"; }

      const rows = sprite(eyesOpen, mouth);
      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          const col = C[rows[y][x]];
          if (!col) continue;
          ctx.fillStyle = col;
          ctx.fillRect(Math.round(x * CELL), Math.round(y * CELL),
                       Math.ceil(CELL), Math.ceil(CELL));
        }
      }
      requestAnimationFrame(draw);
    }
    draw();

    return {
      setMood(m, holdMs) {
        mood = m;
        if (holdMs) {
          clearTimeout(this._t);
          this._t = setTimeout(() => { mood = "idle"; }, holdMs);
        }
      },
    };
  })();

  function say(text) {
    els.buddyText.textContent = text;
    els.speechBubble.animate(
      [{ transform: "scale(1.04)" }, { transform: "scale(1)" }],
      { duration: 180 }
    );
  }

  /* ============================================================
     STARFIELD background
     ============================================================ */
  (function starfield() {
    const cv = els.stars, ctx = cv.getContext("2d");
    let stars = [];
    function resize() {
      cv.width = window.innerWidth; cv.height = window.innerHeight;
      stars = Array.from({ length: 90 }, () => ({
        x: Math.random() * cv.width, y: Math.random() * cv.height,
        s: Math.random() < 0.8 ? 2 : 3,
        sp: 0.15 + Math.random() * 0.5,
        tw: Math.random() * Math.PI * 2,
      }));
    }
    resize();
    window.addEventListener("resize", resize);
    function tick() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const st of stars) {
        st.y += st.sp; st.tw += 0.05;
        if (st.y > cv.height) { st.y = 0; st.x = Math.random() * cv.width; }
        const a = 0.4 + Math.abs(Math.sin(st.tw)) * 0.6;
        ctx.fillStyle = `rgba(170,160,255,${a})`;
        ctx.fillRect(st.x, st.y, st.s, st.s);
      }
      requestAnimationFrame(tick);
    }
    tick();
  })();

  /* ============================================================
     NATURAL-ish TIME PARSING from spoken text
     ============================================================ */
  function parseWhen(text) {
    let t = " " + text.toLowerCase() + " ";
    let delayMs = null;
    const numWords = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
      six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20,
      thirty: 30, forty: 40, fifty: 50, sixty: 60, half: 0.5 };
    const unitMs = { sec: 1000, min: 60000, hour: 3600000, day: 86400000 };

    const m = t.match(/\bin\s+([a-z0-9.]+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?)\b/);
    if (m) {
      let n = parseFloat(m[1]);
      if (isNaN(n)) n = numWords[m[1]] ?? null;
      if (n != null) {
        const u = m[2];
        const per = u.startsWith("sec") ? unitMs.sec
                  : u.startsWith("min") ? unitMs.min
                  : (u.startsWith("hour") || u.startsWith("hr")) ? unitMs.hour
                  : unitMs.day;
        delayMs = n * per;
        t = t.replace(m[0], " ");
      }
    } else if (/\btomorrow\b/.test(t)) {
      delayMs = 86400000; t = t.replace(/\btomorrow\b/, " ");
    } else if (/\btonight\b/.test(t)) {
      delayMs = 6 * 3600000; t = t.replace(/\btonight\b/, " ");
    }

    let clean = t.replace(/\b(remind me to|remind me|remember to|remember|note to self|note that|to)\b/g, " ")
                 .replace(/\s+/g, " ").trim();
    if (clean) clean = clean[0].toUpperCase() + clean.slice(1);
    return { cleanText: clean || text.trim(), delayMs };
  }

  /* ============================================================
     TASKS  (all writes go through Store)
     ============================================================ */
  async function addTask(text, delayMsOverride) {
    const parsed = parseWhen(text);
    let delay = delayMsOverride;
    if (delay == null) {
      delay = parsed.delayMs != null ? parsed.delayMs : selectedDelayMin * 60000;
    }
    const task = {
      id: Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      text: parsed.cleanText,
      created: Date.now(),
      remindAt: Date.now() + (delay || 0),
      repeat: !!els.repeatToggle.checked,
      done: false,
      notified: false,
    };
    sfx.add();
    buddy.setMood("happy", 1500);
    const whenTxt = delay ? "I'll remind you " + humanDelay(delay) : "got it, on the list!";
    const shared = Store.mode !== "local" ? " (everyone in your room)" : "";
    say('"' + truncate(task.text, 36) + '" — ' + whenTxt + shared);
    ensureAlerts();
    await Store.add(task);
  }

  function humanDelay(ms) {
    const min = Math.round(ms / 60000);
    if (min < 1) return "in a moment";
    if (min < 60) return `in ${min} min`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `in ${hr} hr`;
    return `in ${Math.round(hr / 24)} day(s)`;
  }
  function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  function completeTask(id, ev) {
    const task = tasks.find((t) => t.id === id);
    if (!task || task.done) return;
    sfx.done();
    buddy.setMood("happy", 2000);
    grantXp(15, ev);
    bumpStreak();
    say(pick(["Nice one! 🎉", "Quest complete!", "You did it! ⭐", "Boom. Done."]));
    Store.update(id, { done: true, repeat: false, notified: true });
  }

  function deleteTask(id) { sfx.click(); Store.remove(id); }
  function clearCompleted() { sfx.click(); Store.clearDone(); }

  /* ============================================================
     GAMIFICATION  (per-device)
     ============================================================ */
  function xpForLevel(lvl) { return 50 + (lvl - 1) * 40; }
  function grantXp(amount, ev) {
    profile.xp += amount;
    floatXp("+" + amount + " XP", ev);
    let leveled = false;
    while (profile.xp >= xpForLevel(profile.level)) {
      profile.xp -= xpForLevel(profile.level);
      profile.level++;
      leveled = true;
    }
    if (leveled) showLevelUp();
    saveProfile(); renderStats();
  }
  function bumpStreak() {
    const today = new Date().toDateString();
    if (profile.lastDoneDay === today) return;
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    profile.streak = profile.lastDoneDay === yesterday ? profile.streak + 1 : 1;
    profile.lastDoneDay = today;
    saveProfile();
  }
  function showLevelUp() {
    sfx.levelup();
    els.levelupText.textContent = "You reached Level " + profile.level;
    els.levelup.hidden = false;
    setTimeout(() => { els.levelup.hidden = true; }, 1800);
  }
  function floatXp(txt, ev) {
    const pop = document.createElement("div");
    pop.className = "xp-pop";
    pop.textContent = txt;
    pop.style.left = (ev ? ev.clientX : innerWidth / 2) + "px";
    pop.style.top = (ev ? ev.clientY : innerHeight / 2) + "px";
    document.body.appendChild(pop);
    setTimeout(() => pop.remove(), 1000);
  }

  /* ============================================================
     REMINDER SCHEDULER
       - local mode: this client fires AND advances task state.
       - shared mode (Supabase): the Edge Function is authoritative for firing
         (so phones ring when closed). This client only shows an in-app
         reminder for tasks that are due, once each, so open tabs react.
     ============================================================ */
  const shownLocally = new Set(); // `${id}@${remindAt}` keys, shared mode

  function presentReminder(task) {
    sfx.remind();
    buddy.setMood("happy", 4000);
    say("⏰ Reminder: " + truncate(task.text, 40));
    speak("Reminder. " + task.text);
    pushToast(task);
    nativeNotify("⏰ Pixel Pal reminder", task.text, task.id);
  }

  function nativeNotify(title, body, tag) {
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        const n = new Notification(title, { body, tag, icon: faviconDataUrl() });
        n.onclick = () => { window.focus(); n.close(); };
      } catch (_) {}
    }
  }

  function tickReminders() {
    const now = Date.now();
    if (Store.mode === "local") {
      for (const t of tasks) {
        if (t.done || t.notified) continue;
        if ((t.remindAt || 0) <= now) {
          presentReminder(t);
          if (t.repeat) Store.update(t.id, { remindAt: now + 5 * 60000, notified: false });
          else Store.update(t.id, { notified: true });
        }
      }
    } else {
      // shared: present once per (id, remindAt); the Edge Function owns state.
      for (const t of tasks) {
        if (t.done) continue;
        if ((t.remindAt || 0) <= now && !t.notified) {
          const key = t.id + "@" + t.remindAt;
          if (!shownLocally.has(key)) {
            shownLocally.add(key);
            // avoid replaying very old reminders on first load
            if (now - (t.remindAt || 0) < 90 * 1000) presentReminder(t);
          }
        }
      }
    }
    markDueVisuals();
  }

  function markDueVisuals() {
    document.querySelectorAll(".task-item").forEach((el) => {
      const t = tasks.find((x) => x.id === el.dataset.id);
      if (!t) return;
      el.classList.toggle("due", !t.done && t.repeat && (t.remindAt || 0) <= Date.now());
    });
  }

  function pushToast(task) {
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `
      <div class="toast-ico">⏰</div>
      <div class="toast-body">
        <div class="toast-title">REMINDER!</div>
        <div class="toast-msg"></div>
        <div class="toast-btns">
          <button class="toast-done">✓ done</button>
          <button class="toast-snooze">+10m</button>
        </div>
      </div>`;
    el.querySelector(".toast-msg").textContent = task.text;
    el.querySelector(".toast-done").onclick = (e) => { completeTask(task.id, e); removeToast(el); };
    el.querySelector(".toast-snooze").onclick = () => {
      Store.update(task.id, { remindAt: Date.now() + 10 * 60000, notified: false });
      removeToast(el); sfx.click(); say("Snoozed 10 min ⏳");
    };
    els.toastStack.appendChild(el);
    setTimeout(() => { if (el.isConnected) removeToast(el); }, 12000);
  }
  function removeToast(el) { el.classList.add("leaving"); setTimeout(() => el.remove(), 300); }

  function infoToast(title, msg) {
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `<div class="toast-ico">🔔</div><div class="toast-body">
      <div class="toast-title"></div><div class="toast-msg"></div></div>`;
    el.querySelector(".toast-title").textContent = title;
    el.querySelector(".toast-msg").textContent = msg;
    els.toastStack.appendChild(el);
    setTimeout(() => { if (el.isConnected) removeToast(el); }, 6000);
  }

  function faviconDataUrl() {
    return "data:image/svg+xml," + encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><rect width='16' height='16' fill='#7b5cff'/><rect x='4' y='5' width='2' height='2' fill='white'/><rect x='10' y='5' width='2' height='2' fill='white'/><rect x='5' y='10' width='6' height='2' fill='white'/></svg>");
  }

  /* ============================================================
     PUSH / NOTIFICATIONS opt-in
     ============================================================ */
  let alertsState = "off"; // off | local | push | denied
  async function ensureAlerts(force) {
    if (!force && (profile.pushAsked || alertsState === "push")) return;
    profile.pushAsked = true; saveProfile();
    try {
      const res = await Store.enablePush();
      alertsState = res;
      reflectAlerts();
      if (force) {
        if (res === "push") infoToast("Phone alerts ON", "I'll ring this phone even when the site is closed. 🔔");
        else if (res === "local") infoToast("Notifications ON", "You'll get alerts while this tab is open.");
        else if (res === "denied") infoToast("Notifications blocked", "Enable them in your browser to get reminders.");
      }
    } catch (_) {}
  }
  function reflectAlerts() {
    const on = alertsState === "push" || alertsState === "local";
    els.alertsBtn.classList.toggle("armed", on);
    els.alertsBtn.textContent = alertsState === "push" ? "🔔 on"
      : alertsState === "local" ? "🔔 tab"
      : alertsState === "denied" ? "🔕 off" : "🔔 alerts";
    els.alertsBtn.title = alertsState === "push"
      ? "Phone push is on — rings even when closed"
      : alertsState === "local"
      ? "In-app alerts on (open the deployed site for full phone push)"
      : "Turn on phone notifications";
  }

  /* ============================================================
     SPEECH RECOGNITION
     ============================================================ */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recog = null, listening = false;

  function initRecognition() {
    if (!SR) return null;
    const r = new SR();
    r.lang = "en-US"; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    r.onstart = () => {
      listening = true;
      els.micBtn.classList.add("listening");
      els.micBtn.setAttribute("aria-pressed", "true");
      buddy.setMood("listen");
      say("Listening… speak now! 👂");
      sfx.listen();
    };
    r.onerror = (e) => {
      listening = false;
      els.micBtn.classList.remove("listening");
      buddy.setMood("idle");
      if (e.error === "not-allowed" || e.error === "service-not-allowed") say("I need mic permission to hear you 🎙️");
      else if (e.error === "no-speech") say("Didn't catch that — try again?");
      sfx.error();
    };
    r.onend = () => {
      listening = false;
      els.micBtn.classList.remove("listening");
      els.micBtn.setAttribute("aria-pressed", "false");
      buddy.setMood("idle");
    };
    r.onresult = (ev) => {
      let interim = "", final = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const txt = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) final += txt; else interim += txt;
      }
      els.liveTranscript.textContent = interim || final;
      if (final.trim()) { els.liveTranscript.textContent = ""; addTask(final.trim()); }
    };
    return r;
  }

  function startListening() {
    ac(); // unlock audio on user gesture
    ensureAlerts();
    if (!SR) { say("Voice isn't supported here — type instead ⌨️"); openModal(); return; }
    if (listening) { try { recog.stop(); } catch (_) {} return; }
    recog = recog || initRecognition();
    try { recog.start(); } catch (_) {}
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function render() {
    const active = tasks.filter((t) => !t.done);
    els.emptyState.hidden = tasks.length > 0;
    els.taskList.innerHTML = "";

    for (const t of tasks) {
      const li = document.createElement("li");
      li.className = "task-item" + (t.done ? " done" : "");
      li.dataset.id = t.id;

      const check = document.createElement("button");
      check.className = "task-check";
      check.setAttribute("aria-label", t.done ? "Completed" : "Mark complete");
      check.textContent = t.done ? "✓" : "";
      check.onclick = (e) => completeTask(t.id, e);

      const body = document.createElement("div");
      body.className = "task-body";
      const text = document.createElement("div");
      text.className = "task-text";
      text.textContent = t.text;
      const meta = document.createElement("div");
      meta.className = "task-meta";
      meta.appendChild(makeTag(reminderLabel(t)));
      if (t.repeat) meta.appendChild(makeTag("🔁 nagging", "repeat"));
      body.append(text, meta);

      const del = document.createElement("button");
      del.className = "task-del";
      del.setAttribute("aria-label", "Delete");
      del.textContent = "✕";
      del.onclick = () => deleteTask(t.id);

      li.append(check, body, del);
      els.taskList.appendChild(li);
    }

    els.taskCount.textContent = active.length + " active";
    renderStats();
    markDueVisuals();
  }

  function makeTag(txt, cls) {
    const s = document.createElement("span");
    s.className = "tag" + (cls ? " " + cls : "");
    s.textContent = txt;
    return s;
  }
  function reminderLabel(t) {
    if (t.done) return "✓ completed";
    const diff = (t.remindAt || 0) - Date.now();
    if (t.notified && !t.repeat) return "✦ reminded";
    if (diff <= 0) return "⏰ due now";
    const min = Math.round(diff / 60000);
    if (min < 1) return "⏰ in <1 min";
    if (min < 60) return `⏰ in ${min} min`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `⏰ in ${hr} hr`;
    return `⏰ in ${Math.round(hr / 24)}d`;
  }
  function renderStats() {
    els.statLevel.textContent = profile.level;
    els.statXp.textContent = profile.xp;
    els.statStreak.textContent = profile.streak;
    const need = xpForLevel(profile.level);
    els.xpFill.style.width = Math.min(100, (profile.xp / need) * 100) + "%";
  }

  setInterval(() => { if (tasks.length) render(); }, 30000);

  /* ============================================================
     MODAL
     ============================================================ */
  function openModal() {
    els.manualModal.hidden = false;
    els.manualInput.value = "";
    setTimeout(() => els.manualInput.focus(), 30);
  }
  function closeModal() { els.manualModal.hidden = true; }

  /* ============================================================
     EVENTS
     ============================================================ */
  function wireEvents() {
    els.micBtn.addEventListener("click", startListening);

    els.whenChips.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      els.whenChips.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      selectedDelayMin = parseInt(chip.dataset.min, 10) || 0;
      sfx.click();
    });

    els.repeatToggle.addEventListener("change", () => sfx.click());
    els.clearDone.addEventListener("click", clearCompleted);

    els.soundBtn.addEventListener("click", () => {
      profile.sound = !profile.sound;
      els.soundBtn.textContent = profile.sound ? "🔊" : "🔇";
      saveProfile();
      if (profile.sound) sfx.click();
    });

    els.alertsBtn.addEventListener("click", () => { sfx.click(); ensureAlerts(true); });

    els.addManualBtn.addEventListener("click", openModal);
    els.manualCancel.addEventListener("click", closeModal);
    els.manualSave.addEventListener("click", () => {
      const v = els.manualInput.value.trim();
      if (v) addTask(v);
      closeModal();
    });
    els.manualInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") els.manualSave.click();
      if (e.key === "Escape") closeModal();
    });
    els.manualModal.addEventListener("click", (e) => { if (e.target === els.manualModal) closeModal(); });

    document.addEventListener("keydown", (e) => {
      if (e.code === "Space" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName) && els.manualModal.hidden) {
        e.preventDefault();
        startListening();
      }
    });
  }

  /* ============================================================
     PWA — install prompt + service worker (offline / installable)
     ============================================================ */
  let deferredInstall = null;

  function initPWA() {
    // Register the service worker early so the app is installable and works
    // offline. Needs https or localhost (won't run on file://).
    const securish =
      location.protocol === "https:" ||
      ["localhost", "127.0.0.1"].includes(location.hostname);
    if ("serviceWorker" in navigator && securish) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }

    // Chromium fires this when the app is installable; stash it for our button.
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredInstall = e;
      if (els.installBtn) els.installBtn.hidden = false;
    });

    if (els.installBtn) {
      els.installBtn.addEventListener("click", async () => {
        sfx.click();
        if (!deferredInstall) {
          // iOS Safari has no prompt API — guide the user instead.
          say("To install: tap Share ⬆ then 'Add to Home Screen' 📲");
          return;
        }
        deferredInstall.prompt();
        try { await deferredInstall.userChoice; } catch (_) {}
        deferredInstall = null;
        els.installBtn.hidden = true;
      });
    }

    window.addEventListener("appinstalled", () => {
      deferredInstall = null;
      if (els.installBtn) els.installBtn.hidden = true;
      say("Installed! 🎉 Launch Pixel Pal from your home screen.");
    });

    // Already running as an installed app? No need for the button.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    if (standalone && els.installBtn) els.installBtn.hidden = true;
  }

  /* ---------------- helpers ---------------- */
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function setSyncPill() {
    const live = Store.mode !== "local";
    els.syncPill.classList.toggle("live", live);
    els.syncPill.classList.toggle("local", !live);
    els.syncText.textContent = live ? "LIVE · shared" : "on-device";
    els.syncPill.title = live
      ? "Connected — this list is shared live with everyone in your room."
      : "On-device only. Add your Supabase keys to share the list & get phone push.";
  }

  /* ============================================================
     ROOMS — a shared code; same code = same private list
     ============================================================ */
  function roomLink(code) {
    return location.origin + location.pathname + "?room=" + encodeURIComponent(code);
  }
  function updateRoomUI() {
    const code = Store.getRoom && Store.getRoom();
    const sharing = Store.mode !== "local" && !!code;
    els.roomPill.hidden = !sharing;
    if (sharing) els.roomName.textContent = code;
  }
  function openRoomModal() {
    const code = Store.getRoom();
    els.roomCodeBig.textContent = code;
    els.roomInput.value = "";
    els.roomModal.hidden = false;
    setTimeout(() => els.roomInput.focus(), 30);
  }
  function closeRoomModal() { els.roomModal.hidden = true; }

  async function copyText(text, okMsg) {
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(text);
      else {
        const ta = document.createElement("textarea");
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); ta.remove();
      }
      sfx.add(); say(okMsg);
    } catch (_) { say("Couldn't copy — here it is: " + text); }
  }

  async function switchRoom(code) {
    const next = await Store.setRoom(code); // falsy code -> brand new room
    shownLocally.clear();
    updateRoomUI();
    setSyncPill();
    closeRoomModal();
    sfx.done();
    say("You're in room “" + next + "” 👥");
  }

  function wireRoom() {
    els.roomPill.addEventListener("click", () => { sfx.click(); openRoomModal(); });
    els.roomCancel.addEventListener("click", closeRoomModal);
    els.roomModal.addEventListener("click", (e) => { if (e.target === els.roomModal) closeRoomModal(); });
    els.roomCopy.addEventListener("click", () => copyText(Store.getRoom(), "Code copied! 📋"));
    els.roomShare.addEventListener("click", () => copyText(roomLink(Store.getRoom()), "Invite link copied! 🔗"));
    els.roomJoin.addEventListener("click", () => {
      const v = els.roomInput.value.trim();
      if (v) switchRoom(v);
    });
    els.roomInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") els.roomJoin.click();
      if (e.key === "Escape") closeRoomModal();
    });
    els.roomNew.addEventListener("click", () => {
      if (confirm("Start a fresh, empty room? Your current room keeps its tasks — you can rejoin it with its code.")) {
        switchRoom(""); // empty -> store generates a new code
      }
    });
  }

  /* ============================================================
     BOOT
     ============================================================ */
  els.soundBtn.textContent = profile.sound ? "🔊" : "🔇";
  renderStats();
  wireEvents();
  reflectAlerts();
  initPWA();

  bootStore().then((s) => {
    Store = s;
    setSyncPill();
    wireRoom();
    updateRoomUI();
    Store.subscribe((list) => { tasks = list; render(); });
    if (Store.onPush) {
      Store.onPush((p) => {
        // foreground push (shared): surface it in-app too
        infoToast(p.title || "⏰ Reminder", p.body || "");
        sfx.remind();
      });
    }
    setInterval(tickReminders, 1000);

    if (Store.mode !== "local") {
      say("Connected! 👥 Room “" + Store.getRoom() + "”. Tap it up top to share. Now speak a task 🎙️");
    } else if (!SR) {
      say("Tap 🎙️ to talk (or ⌨ type). Tip: voice works best in Chrome.");
    }
    // Re-arm alerts if the user already opted in before.
    if (profile.pushAsked) ensureAlerts(false);
  });
})();
