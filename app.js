/* ============================================================
   PIXEL PAL — app logic
   Voice capture, reminders, gamification, the pixel buddy.
   No external libraries. Everything is vanilla JS.
   ============================================================ */
(() => {
  "use strict";

  /* ---------------- state ---------------- */
  const LS_KEY = "pixelpal.v1";
  const state = loadState();

  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY));
      if (raw && Array.isArray(raw.tasks)) return raw;
    } catch (_) {}
    return {
      tasks: [],
      xp: 0,
      level: 1,
      streak: 0,
      lastDoneDay: null,
      sound: true,
    };
  }
  function save() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }

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
    addManualBtn: $("addManualBtn"),
    manualModal: $("manualModal"),
    manualInput: $("manualInput"),
    manualSave: $("manualSave"),
    manualCancel: $("manualCancel"),
    levelup: $("levelup"),
    levelupText: $("levelupText"),
    buddyCanvas: $("buddy"),
    stars: $("stars"),
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
    if (!state.sound) return;
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
    add:    () => { beep(523,0.07); beep(784,0.09,"square",0.05,0.07); },
    done:   () => { beep(523,0.07); beep(659,0.07,"square",0.05,0.07); beep(988,0.14,"square",0.05,0.14); },
    remind: () => { beep(880,0.1); beep(880,0.1,"square",0.05,0.16); },
    levelup:() => { [523,659,784,1047].forEach((f,i)=>beep(f,0.12,"square",0.06,i*0.1)); },
    listen: () => { beep(440,0.06,"sine",0.04); },
    click:  () => { beep(330,0.04,"square",0.03); },
    error:  () => { beep(180,0.18,"sawtooth",0.05); },
  };

  /* ============================================================
     SPEECH SYNTHESIS — buddy speaks reminders aloud
     ============================================================ */
  function speak(text) {
    if (!state.sound || !("speechSynthesis" in window)) return;
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
    const GRID = 16;            // 16x16 sprite
    const CELL = cv.width / GRID;
    let mood = "idle";          // idle | listen | happy | think
    let frame = 0;

    // palette
    const C = {
      _: null,
      B: "#1a1640", // body shadow / outline
      P: "#7b5cff", // body purple
      L: "#a98bff", // light purple
      W: "#ffffff", // eye white
      K: "#101024", // pupil
      C: "#00e5c0", // cheek/teal accent
      M: "#ff4f9a", // mouth pink
      Y: "#ffd23f", // antenna bulb
    };

    // base sprite (blink/mouth swapped per frame). 16 rows x 16 cols.
    function sprite(eyesOpen, mouth) {
      const e = eyesOpen ? "W" : "B";
      const p = eyesOpen ? "K" : "B";
      // mouth: 'smile' | 'o' | 'flat'  (each is exactly 4 cells)
      const rows = [
        "______YY________",
        "______BB________",
        "______BB________",
        "____BBBBBB______",
        "___BPPPPPPB_____",
        "__BPLLLLLLPB____",
        "__BP"+e+e+"PP"+e+e+"PB____",
        "__BP"+e+p+"PP"+e+p+"PB____",
        "__BPPPPPPPPB____",
        "_BPCPPPPPPCPB___",
        "_BPP"+mline(mouth)+"PPPPB___",
        "_BPPPPPPPPPPB___",
        "__BPPPPPPPPB____",
        "___BPP__PPB_____",
        "___BB____BB_____",
        "________________",
      ];
      return rows;
    }
    function mline(mouth) {
      if (mouth === "smile") return "MMMM";
      if (mouth === "o")     return "MKKM"; // open mouth (chatter)
      return "BMMB";                        // small flat mouth
    }

    function draw() {
      frame++;
      ctx.clearRect(0, 0, cv.width, cv.height);

      let eyesOpen = true;
      let mouth = "smile";

      if (mood === "idle") {
        eyesOpen = (frame % 140) > 6;          // occasional blink
        mouth = "smile";
      } else if (mood === "listen") {
        eyesOpen = true;
        mouth = (frame % 20 < 10) ? "o" : "smile"; // chatter
      } else if (mood === "happy") {
        eyesOpen = (frame % 16 < 8);            // wink-y
        mouth = "smile";
      } else if (mood === "think") {
        eyesOpen = (frame % 60) > 6;
        mouth = "flat";
      }

      const rows = sprite(eyesOpen, mouth);
      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          const ch = rows[y][x];
          const col = C[ch];
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
        x: Math.random() * cv.width,
        y: Math.random() * cv.height,
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
     "...in 10 minutes", "in 2 hours", "tomorrow", "at 5"
     Returns { cleanText, delayMs|null }
     ============================================================ */
  function parseWhen(text) {
    let t = " " + text.toLowerCase() + " ";
    let delayMs = null;

    const numWords = { a:1, an:1, one:1, two:2, three:3, four:4, five:5,
      six:6, seven:7, eight:8, nine:9, ten:10, fifteen:15, twenty:20,
      thirty:30, forty:40, fifty:50, sixty:60, half:0.5 };

    const unitMs = { sec:1000, second:1000, min:60000, minute:60000,
      hour:3600000, hr:3600000, day:86400000 };

    // "in 10 minutes" / "in two hours" / "in half an hour"
    const m = t.match(/\bin\s+([a-z0-9.]+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?)\b/);
    if (m) {
      let n = parseFloat(m[1]);
      if (isNaN(n)) n = numWords[m[1]] ?? null;
      if (n != null) {
        const u = m[2];
        let per = u.startsWith("sec") ? unitMs.sec
                : u.startsWith("min") ? unitMs.min
                : u.startsWith("hour")||u.startsWith("hr") ? unitMs.hour
                : unitMs.day;
        delayMs = n * per;
        t = t.replace(m[0], " ");
      }
    } else if (/\btomorrow\b/.test(t)) {
      delayMs = 86400000; t = t.replace(/\btomorrow\b/, " ");
    } else if (/\btonight\b/.test(t)) {
      delayMs = 6 * 3600000; t = t.replace(/\btonight\b/, " ");
    }

    // strip leading filler
    let clean = t.replace(/\b(remind me to|remind me|remember to|remember|note to self|note that|to)\b/g, " ")
                 .replace(/\s+/g, " ").trim();
    if (clean) clean = clean[0].toUpperCase() + clean.slice(1);
    return { cleanText: clean || text.trim(), delayMs };
  }

  /* ============================================================
     TASKS
     ============================================================ */
  function addTask(text, delayMsOverride) {
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
      repeat: els.repeatToggle.checked,
      done: false,
      notified: false,
    };
    state.tasks.unshift(task);
    save();
    render();
    sfx.add();
    buddy.setMood("happy", 1500);
    const whenTxt = delay ? "I'll remind you " + humanDelay(delay) : "got it, on your list!";
    say('"' + truncate(task.text, 40) + '" — ' + whenTxt);
    return task;
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
    const task = state.tasks.find((t) => t.id === id);
    if (!task || task.done) return;
    task.done = true; task.repeat = false;
    sfx.done();
    buddy.setMood("happy", 2000);
    grantXp(15, ev);
    bumpStreak();
    say(pick(["Nice one! 🎉", "Quest complete!", "You did it! ⭐", "Boom. Done."]));
    save(); render();
  }

  function deleteTask(id) {
    state.tasks = state.tasks.filter((t) => t.id !== id);
    sfx.click(); save(); render();
  }

  function clearCompleted() {
    state.tasks = state.tasks.filter((t) => !t.done);
    sfx.click(); save(); render();
  }

  /* ============================================================
     GAMIFICATION
     ============================================================ */
  function xpForLevel(lvl) { return 50 + (lvl - 1) * 40; }

  function grantXp(amount, ev) {
    state.xp += amount;
    floatXp("+" + amount + " XP", ev);
    let leveled = false;
    while (state.xp >= xpForLevel(state.level)) {
      state.xp -= xpForLevel(state.level);
      state.level++;
      leveled = true;
    }
    if (leveled) showLevelUp();
    save(); renderStats();
  }

  function bumpStreak() {
    const today = new Date().toDateString();
    if (state.lastDoneDay === today) return;
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    state.streak = state.lastDoneDay === yesterday ? state.streak + 1 : 1;
    state.lastDoneDay = today;
    save();
  }

  function showLevelUp() {
    sfx.levelup();
    els.levelupText.textContent = "You reached Level " + state.level;
    els.levelup.hidden = false;
    setTimeout(() => { els.levelup.hidden = true; }, 1800);
  }

  function floatXp(txt, ev) {
    const pop = document.createElement("div");
    pop.className = "xp-pop";
    pop.textContent = txt;
    const x = ev ? ev.clientX : window.innerWidth / 2;
    const y = ev ? ev.clientY : window.innerHeight / 2;
    pop.style.left = x + "px"; pop.style.top = y + "px";
    document.body.appendChild(pop);
    setTimeout(() => pop.remove(), 1000);
  }

  /* ============================================================
     REMINDER SCHEDULER + NOTIFICATIONS
     ============================================================ */
  function fireReminder(task) {
    sfx.remind();
    buddy.setMood("happy", 4000);
    say("⏰ Reminder: " + truncate(task.text, 44));
    speak("Reminder. " + task.text);
    pushToast(task);

    // native OS notification when permitted
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        const n = new Notification("⏰ Pixel Pal reminder", {
          body: task.text,
          tag: task.id,
          icon: faviconDataUrl(),
        });
        n.onclick = () => { window.focus(); n.close(); };
      } catch (_) {}
    }

    if (task.repeat) {
      // nag again in 5 minutes until done
      task.remindAt = Date.now() + 5 * 60000;
      task.notified = false;
    } else {
      task.notified = true;
    }
    save();
    render();
  }

  function tickReminders() {
    const now = Date.now();
    for (const t of state.tasks) {
      if (t.done) continue;
      if (!t.notified && t.remindAt <= now) {
        fireReminder(t);
      }
    }
    markDueVisuals();
  }
  setInterval(tickReminders, 1000);

  function markDueVisuals() {
    document.querySelectorAll(".task-item").forEach((el) => {
      const t = state.tasks.find((x) => x.id === el.dataset.id);
      if (!t) return;
      el.classList.toggle("due", !t.done && t.notified && t.repeat);
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
    el.querySelector(".toast-done").onclick = (e) => {
      completeTask(task.id, e); removeToast(el);
    };
    el.querySelector(".toast-snooze").onclick = () => {
      task.remindAt = Date.now() + 10 * 60000;
      task.notified = false;
      save(); render(); removeToast(el); sfx.click();
      say("Snoozed 10 min ⏳");
    };
    els.toastStack.appendChild(el);
    setTimeout(() => { if (el.isConnected) removeToast(el); }, 12000);
  }
  function removeToast(el) {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 300);
  }

  function faviconDataUrl() {
    return "data:image/svg+xml," + encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><rect width='16' height='16' fill='#7b5cff'/><rect x='4' y='5' width='2' height='2' fill='white'/><rect x='10' y='5' width='2' height='2' fill='white'/><rect x='5' y='10' width='6' height='2' fill='white'/></svg>");
  }

  /* ============================================================
     SPEECH RECOGNITION
     ============================================================ */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recog = null, listening = false;

  function initRecognition() {
    if (!SR) return null;
    const r = new SR();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;

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
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        say("I need mic permission to hear you 🎙️");
      } else if (e.error === "no-speech") {
        say("Didn't catch that — try again?");
      }
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
      if (final.trim()) {
        els.liveTranscript.textContent = "";
        addTask(final.trim());
      }
    };
    return r;
  }

  function startListening() {
    ac(); // unlock audio on user gesture
    if (!SR) {
      say("Voice isn't supported here — type instead ⌨️");
      openModal();
      return;
    }
    if (listening) { try { recog.stop(); } catch (_) {} return; }
    recog = recog || initRecognition();
    ensureNotifyPermission();
    try { recog.start(); } catch (_) {}
  }

  function ensureNotifyPermission() {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function render() {
    const active = state.tasks.filter((t) => !t.done);
    els.emptyState.hidden = state.tasks.length > 0;
    els.taskList.innerHTML = "";

    for (const t of state.tasks) {
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
    const diff = t.remindAt - Date.now();
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
    els.statLevel.textContent = state.level;
    els.statXp.textContent = state.xp;
    els.statStreak.textContent = state.streak;
    const need = xpForLevel(state.level);
    els.xpFill.style.width = Math.min(100, (state.xp / need) * 100) + "%";
  }

  // keep relative time labels fresh
  setInterval(() => { if (state.tasks.length) render(); }, 30000);

  /* ============================================================
     MODAL (type a task)
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
    state.sound = !state.sound;
    els.soundBtn.textContent = state.sound ? "🔊" : "🔇";
    save();
    if (state.sound) sfx.click();
  });

  els.addManualBtn.addEventListener("click", openModal);
  els.manualCancel.addEventListener("click", closeModal);
  els.manualSave.addEventListener("click", () => {
    const v = els.manualInput.value.trim();
    if (v) addTask(v);
    closeModal();
  });
  els.manualInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { els.manualSave.click(); }
    if (e.key === "Escape") closeModal();
  });
  els.manualModal.addEventListener("click", (e) => {
    if (e.target === els.manualModal) closeModal();
  });

  // keyboard: press space (when not typing) to talk
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)
        && els.manualModal.hidden) {
      e.preventDefault();
      startListening();
    }
  });

  /* ---------------- helpers ---------------- */
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* ---------------- boot ---------------- */
  els.soundBtn.textContent = state.sound ? "🔊" : "🔇";
  render();
  if (!SR) {
    say("Tap 🎙️ to talk (or ⌨ type). Tip: voice works best in Chrome.");
  }
})();
