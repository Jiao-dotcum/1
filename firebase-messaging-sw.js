/* ============================================================
   firebase-messaging-sw.js — background push service worker
   ------------------------------------------------------------
   This runs in the background (even when the Pixel Pal tab is closed) and
   shows the OS notification when a push arrives from the Cloud Function.

   IMPORTANT: paste the SAME values from firebase-config.js into the
   `firebaseConfig` object below. A service worker can't import the module,
   so it needs its own copy.
   ============================================================ */

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey:            "PASTE_API_KEY",
  authDomain:        "PASTE_PROJECT_ID.firebaseapp.com",
  projectId:         "PASTE_PROJECT_ID",
  storageBucket:     "PASTE_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId:             "PASTE_APP_ID",
});

const messaging = firebase.messaging();

const ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'>" +
      "<rect width='16' height='16' fill='#7b5cff'/>" +
      "<rect x='4' y='5' width='2' height='2' fill='white'/>" +
      "<rect x='10' y='5' width='2' height='2' fill='white'/>" +
      "<rect x='5' y='10' width='6' height='2' fill='white'/></svg>"
  );

messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  const data = payload.data || {};
  self.registration.showNotification(n.title || "⏰ Pixel Pal reminder", {
    body: n.body || "You have a task to do!",
    icon: ICON,
    badge: ICON,
    tag: data.id || "pixelpal",
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200],
    data,
  });
});

// Tapping the notification focuses an open tab or opens the app.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) return w.focus();
      }
      if (clients.openWindow) return clients.openWindow("./");
    })
  );
});
