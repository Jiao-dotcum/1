// ============================================================
// store.js — the data layer (Supabase edition, room-scoped).
//
// If supabase-config.js has ENABLED = true and Supabase loads, the task
// list becomes a SHARED, realtime list scoped to a ROOM CODE: everyone who
// uses the same code sees the same tasks instantly, and their phones get the
// push for that room's reminders. Different codes = separate private lists.
//
// It publishes `window.PixelStore` and fires a `pixelstore-ready` event.
// If Supabase is off or fails, it sets `window.__pixelStoreLocal` so app.js
// falls back to its built-in on-device store. The app never breaks.
//
// Loaded as <script type="module"> so it can use ES module imports.
// ============================================================

import { ENABLED, SUPABASE_URL, SUPABASE_ANON_KEY, VAPID_PUBLIC_KEY } from "./supabase-config.js";

const SDK = "https://esm.sh/@supabase/supabase-js@2";
const ROOM_KEY = "pixelpal.room.v1";

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

/* ---------- room codes: memorable + voice-friendly ---------- */
const ADJ = ["tiger", "comet", "pixel", "neon", "turbo", "lunar", "cosmic", "retro",
  "mega", "hyper", "ghost", "laser", "atom", "solar", "frost", "ember"];
const NOUN = ["comet", "robot", "dragon", "rocket", "ninja", "wizard", "falcon", "yeti",
  "panda", "phoenix", "otter", "koala", "raven", "gizmo", "bolt", "moon"];
function genRoom() {
  const a = ADJ[(Math.random() * ADJ.length) | 0];
  const n = NOUN[(Math.random() * NOUN.length) | 0];
  const num = String((Math.random() * 900 + 100) | 0); // 3 digits
  return `${a}-${n}-${num}`;
}
function normalizeRoom(c) {
  const cleaned = String(c || "").toLowerCase().trim().replace(/[^a-z0-9-]/g, "").slice(0, 40);
  return cleaned || genRoom();
}
function resolveRoom() {
  // A shared link can carry the code: ?room=code  or  #room=code
  const url = new URL(location.href);
  const fromUrl =
    url.searchParams.get("room") ||
    (location.hash.match(/room=([a-z0-9-]+)/i) || [])[1];
  if (fromUrl) {
    const r = normalizeRoom(fromUrl);
    localStorage.setItem(ROOM_KEY, r);
    return r;
  }
  let r = localStorage.getItem(ROOM_KEY);
  if (!r) { r = genRoom(); localStorage.setItem(ROOM_KEY, r); }
  return r;
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
function toRow(t, room) {
  const row = {};
  if ("id" in t) row.id = t.id;
  if ("text" in t) row.text = t.text;
  if ("created" in t) row.created = t.created;
  if ("remindAt" in t) row.remind_at = t.remindAt;
  if ("repeat" in t) row.repeat = t.repeat;
  if ("done" in t) row.done = t.done;
  if ("notified" in t) row.notified = t.notified;
  if (room !== undefined) row.room = room;
  return row;
}

async function init() {
  const { createClient } = await import(SDK);
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    realtime: { params: { eventsPerSecond: 5 } },
  });

  let room = resolveRoom();
  let tasks = [];
  let channel = null;
  let pushEndpoint = null; // set once push is enabled, so room changes can follow
  const taskListeners = [];
  const pushListeners = [];

  async function refetch() {
    const { data, error } = await sb
      .from("tasks")
      .select("*")
      .eq("room", room)
      .order("created", { ascending: false });
    if (error) { console.warn("[PixelPal] fetch error:", error); return; }
    tasks = (data || []).map(fromRow);
    taskListeners.forEach((cb) => cb(tasks.slice()));
  }

  function listen() {
    if (channel) { try { sb.removeChannel(channel); } catch (_) {} }
    channel = sb
      .channel("tasks-" + room)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: "room=eq." + room },
        refetch
      )
      .subscribe();
  }

  await refetch();
  listen();

  // Foreground push relay from the service worker -> open tabs.
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

    getRoom() { return room; },
    async setRoom(code) {
      room = normalizeRoom(code); // falsy -> brand new room
      localStorage.setItem(ROOM_KEY, room);
      // keep this device's push registration pointed at the new room
      if (pushEndpoint) {
        await sb.from("push_subscriptions").update({ room }).eq("endpoint", pushEndpoint);
      }
      await refetch();
      listen();
      return room;
    },

    async add(task) {
      const { error } = await sb.from("tasks").insert(toRow(task, room));
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
      await sb.from("tasks").delete().eq("room", room).eq("done", true);
    },

    // Ask permission, subscribe to Web Push, and save the subscription
    // (tagged with this room). Returns "push" | "local" | "denied".
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
        pushEndpoint = json.endpoint;
        await sb.from("push_subscriptions").upsert(
          { endpoint: json.endpoint, subscription: json, room, created: Date.now() },
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
