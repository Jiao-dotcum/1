/* ============================================================
   sw.js — Pixel Pal service worker (standard Web Push)
   ------------------------------------------------------------
   Runs in the background, even when the tab/app is closed. When the
   Supabase Edge Function sends a push, this shows the OS notification
   (with vibration) and tells any open tab so it can react in-app too.

   No Firebase. Pure Web Push / Notifications API.
   ============================================================ */

const ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'>" +
      "<rect width='16' height='16' fill='#7b5cff'/>" +
      "<rect x='4' y='5' width='2' height='2' fill='white'/>" +
      "<rect x='10' y='5' width='2' height='2' fill='white'/>" +
      "<rect x='5' y='10' width='6' height='2' fill='white'/></svg>"
  );

// ---- app-shell caching: makes Pixel Pal installable + work offline ----
const CACHE = "pixelpal-v1";
const SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./store.js",
  "./styles.css",
  "./supabase-config.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // tolerate any single 404 so install never fails the whole precache
      await Promise.allSettled(SHELL.map((u) => cache.add(u)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// Network-first for our own files (fresh when online, cached when offline).
// Cross-origin requests (esm.sh, Supabase) are left untouched.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        return cached || caches.match("./index.html");
      })
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) {
    payload = { title: "⏰ Pixel Pal reminder", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "⏰ Pixel Pal reminder";
  const body = payload.body || "You have a task to do!";
  const data = payload.data || {};

  event.waitUntil(
    (async () => {
      // Let any open tab show an in-app toast too.
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) w.postMessage({ type: "pixelpal-push", title, body, data });

      await self.registration.showNotification(title, {
        body,
        icon: ICON,
        badge: ICON,
        tag: data.id || "pixelpal",
        renotify: true,
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200],
        data,
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) if ("focus" in w) return w.focus();
      if (self.clients.openWindow) return self.clients.openWindow("./");
    })
  );
});
