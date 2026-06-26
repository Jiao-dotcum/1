// ============================================================
// store.js — the data layer (Supabase edition).
//
// If supabase-config.js has ENABLED = true and Supabase loads, the task
// list becomes a SHARED, realtime list: every open device sees the same
// tasks instantly, and the browser subscribes to Web Push so the scheduled
// Edge Function can ring phones even when the site is closed.
//
// It publishes `window.PixelStore` and fires a `pixelstore-ready` event.
// If Supabase is off or fails, it sets `window.__pixelStoreLocal` so app.js
// falls back to its built-in on-device store. The app never breaks.
//
// Loaded as <script type="module"> so it can use ES module imports.
// ============================================================

import { ENABLED, SUPABASE_URL, SUPABASE_ANON_KEY, VAPID_PUBLIC_KEY } from "./supabase-config.js";

const SDK = "https://esm.sh/@supabase/supabase-js@2";

if (ENABLED && !looksLikePlaceholder()) {
  window.__pixelStorePending = true; // tell app.js to wait for the network
  init().catch((err) => {
    console.warn("[PixelPal] Supabase unavailable, using on-device mode:", err);
    goLocal();
  });
} else {
  goLocal();
}

function goLocal() {
  window.__pixelStoreLocal = true;
  window.dispatchEvent(new Event("pixelstore-local"));
}

function looksLikePlaceholder() {
  return (
    !SUPABASE_URL ||
    SUPABASE_URL.includes("PASTE") ||
    !SUPABASE_ANON_KEY ||
    SUPABASE_ANON_KEY.includes("PASTE")
  );
}

// DB columns are snake_case; the app uses camelCase. Map both ways.
function fromRow(r) {
  return {
    id: r.id,
    text: r.text,
    created: Number(r.created),
    remindAt: Number(r.remind_at),
    repeat: !!r.repeat,
    done: !!r.done,
    notified: !!r.notified,
  };
}
function toRow(t) {
  const row = {};
  if ("id" in t) row.id = t.id;
  if ("text" in t) row.text = t.text;
  if ("created" in t) row.created = t.created;
  if ("remindAt" in t) row.remind_at = t.remindAt;
  if ("repeat" in t) row.repeat = t.repeat;
  if ("done" in t) row.done = t.done;
  if ("notified" in t) row.notified = t.notified;
  return row;
}

async function init() {
  const { createClient } = await import(SDK);
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    realtime: { params: { eventsPerSecond: 5 } },
  });

  let tasks = [];
  const taskListeners = [];
  const pushListeners = [];

  async function refetch() {
    const { data, error } = await sb
      .from("tasks")
      .select("*")
      .order("created", { ascending: false });
    if (error) { console.warn("[PixelPal] fetch error:", error); return; }
    tasks = (data || []).map(fromRow);
    taskListeners.forEach((cb) => cb(tasks.slice()));
  }

  // Initial load, then live updates on every insert/update/delete.
  await refetch();
  sb.channel("tasks-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, refetch)
    .subscribe();

  // Relay messages the service worker sends when a push arrives in the
  // foreground, so open tabs can react in-app too.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (ev) => {
      const d = ev.data || {};
      if (d.type === "pixelpal-push") {
        pushListeners.forEach((cb) => cb({ title: d.title, body: d.body, data: d.data }));
      }
    });
  }

  const store = {
    mode: "supabase",

    subscribe(cb) { taskListeners.push(cb); cb(tasks.slice()); },
    onPush(cb) { pushListeners.push(cb); },

    async add(task) {
      const { error } = await sb.from("tasks").insert(toRow(task));
      if (error) console.warn("[PixelPal] add failed:", error);
    },
    async update(id, patch) {
      const { error } = await sb.from("tasks").update(toRow(patch)).eq("id", id);
      if (error) console.warn("[PixelPal] update failed:", error);
    },
    async remove(id) {
      await sb.from("tasks").delete().eq("id", id);
    },
    async clearDone() {
      await sb.from("tasks").delete().eq("done", true);
    },

    // Ask for permission, subscribe to Web Push, and save the subscription
    // so the Edge Function can deliver reminders. Returns "push" | "local"
    // | "denied".
    async enablePush() {
      if (!("Notification" in window)) return "denied";
      let perm = Notification.permission;
      if (perm === "default") perm = await Notification.requestPermission();
      if (perm !== "granted") return "denied";

      const canPush =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        VAPID_PUBLIC_KEY &&
        !VAPID_PUBLIC_KEY.includes("PASTE");
      if (!canPush) return "local";

      try {
        const reg = await navigator.serviceWorker.register("./sw.js");
        await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          });
        }
        const json = sub.toJSON();
        await sb.from("push_subscriptions").upsert(
          { endpoint: json.endpoint, subscription: json, created: Date.now() },
          { onConflict: "endpoint" }
        );
        return "push";
      } catch (e) {
        console.warn("[PixelPal] push subscribe failed:", e);
        return "local";
      }
    },
  };

  window.PixelStore = store;
  window.dispatchEvent(new Event("pixelstore-ready"));
}

// VAPID public key (base64url) -> Uint8Array for applicationServerKey.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
