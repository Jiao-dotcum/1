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

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

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
