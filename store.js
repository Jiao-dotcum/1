// ============================================================
// store.js — the data layer.
//
// If firebase-config.js has ENABLED = true and Firebase loads, this turns
// the task list into a SHARED, realtime list: every open device sees the
// same tasks instantly, and we register the device for push so the Cloud
// Function can ring phones even when the site is closed.
//
// It publishes a `window.PixelStore` object and fires a `pixelstore-ready`
// event. If Firebase is off or fails, it sets `window.__pixelStoreLocal`
// so app.js falls back to its built-in on-device store. The app never
// breaks — it just loses the "shared" superpower.
//
// Loaded as a <script type="module"> so it can use ES module imports.
// ============================================================

import { ENABLED, firebaseConfig, vapidKey } from "./firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";

if (ENABLED && !looksLikePlaceholder(firebaseConfig)) {
  // Tell app.js to wait a bit longer for the network before giving up.
  window.__pixelStorePending = true;
  init().catch((err) => {
    console.warn("[PixelPal] Firebase unavailable, using on-device mode:", err);
    goLocal();
  });
} else {
  goLocal();
}

function goLocal() {
  window.__pixelStoreLocal = true;
  window.dispatchEvent(new Event("pixelstore-local"));
}

function looksLikePlaceholder(cfg) {
  return !cfg || !cfg.projectId || String(cfg.projectId).startsWith("PASTE");
}

async function init() {
  const [{ initializeApp }, fs] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);

  // Messaging is optional (some browsers / contexts don't support it).
  let msg = null;
  try { msg = await import(`${SDK}/firebase-messaging.js`); } catch (_) {}

  const app = initializeApp(firebaseConfig);
  const db = fs.getFirestore(app);
  const tasksCol = fs.collection(db, "tasks");
  const tasksQuery = fs.query(tasksCol, fs.orderBy("created", "desc"));

  let tasks = [];
  const taskListeners = [];
  const pushListeners = [];

  // ---- realtime sync: every change anywhere lands here ----
  fs.onSnapshot(
    tasksQuery,
    (snap) => {
      tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      taskListeners.forEach((cb) => cb(tasks.slice()));
    },
    (err) => console.warn("[PixelPal] snapshot error:", err)
  );

  let messaging = null;
  function getMsg() {
    if (!messaging && msg) {
      try { messaging = msg.getMessaging(app); } catch (_) { messaging = null; }
    }
    return messaging;
  }

  const store = {
    mode: "firebase",

    subscribe(cb) {
      taskListeners.push(cb);
      cb(tasks.slice()); // fire immediately with whatever we have
    },

    onPush(cb) { pushListeners.push(cb); },

    async add(task) {
      const { id, ...data } = task;
      await fs.setDoc(fs.doc(db, "tasks", id), data);
    },

    async update(id, patch) {
      try { await fs.updateDoc(fs.doc(db, "tasks", id), patch); }
      catch (e) { console.warn("[PixelPal] update failed:", e); }
    },

    async remove(id) {
      await fs.deleteDoc(fs.doc(db, "tasks", id));
    },

    async clearDone() {
      const done = tasks.filter((t) => t.done);
      await Promise.all(done.map((t) => fs.deleteDoc(fs.doc(db, "tasks", t.id))));
    },

    // Request notification permission and register this device for push.
    // Returns "push" (full phone push), "local" (in-app notifications
    // only), or "denied".
    async enablePush() {
      if (!("Notification" in window)) return "denied";
      let perm = Notification.permission;
      if (perm === "default") perm = await Notification.requestPermission();
      if (perm !== "granted") return "denied";

      const m = getMsg();
      const haveVapid = vapidKey && !vapidKey.startsWith("PASTE");
      if (!m || !haveVapid || !("serviceWorker" in navigator)) return "local";

      try {
        const reg = await navigator.serviceWorker.register("./firebase-messaging-sw.js");
        const token = await msg.getToken(m, {
          vapidKey,
          serviceWorkerRegistration: reg,
        });
        if (token) {
          await fs.setDoc(fs.doc(db, "pushTokens", token), {
            created: Date.now(),
            ua: navigator.userAgent,
          });
        }
        // Foreground messages don't auto-show; hand them to the app.
        msg.onMessage(m, (payload) => {
          const n = (payload && payload.notification) || {};
          pushListeners.forEach((cb) =>
            cb({ title: n.title, body: n.body, data: payload && payload.data })
          );
        });
        return "push";
      } catch (e) {
        console.warn("[PixelPal] push registration failed:", e);
        return "local";
      }
    },
  };

  window.PixelStore = store;
  window.dispatchEvent(new Event("pixelstore-ready"));
}
