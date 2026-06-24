// ============================================================
// firebase-config.js  —  paste your project's keys here
// ============================================================
//
// Pixel Pal works with ZERO setup (local-only, no sharing). To turn on
// the SHARED live list + phone push that rings even when the site is
// closed, do this once:
//
//  1. Create a free Firebase project:  https://console.firebase.google.com
//  2. In the project, click the </> "Web app" button to register an app,
//     then copy the values it shows into `firebaseConfig` below.
//  3. Build > Firestore Database  ->  Create database  (start in test mode
//     is fine to try it; see firestore.rules for the real rules).
//  4. Run > Messaging is enabled automatically. Then open
//     Project settings (gear) > Cloud Messaging > "Web Push certificates"
//     > Generate key pair, and paste that string into `vapidKey` below.
//  5. Set ENABLED = true.
//  6. ALSO paste the same firebaseConfig into firebase-messaging-sw.js
//     (the background push service worker needs its own copy).
//
// For push that fires when EVERYONE has the tab closed, deploy the Cloud
// Function in /functions (see README "Ring even when closed").
//
// Until ENABLED is true (or if Firebase can't load), the app falls back to
// a private, on-device list — nothing breaks.
// ------------------------------------------------------------

export const ENABLED = false;

export const firebaseConfig = {
  apiKey:            "PASTE_API_KEY",
  authDomain:        "PASTE_PROJECT_ID.firebaseapp.com",
  projectId:         "PASTE_PROJECT_ID",
  storageBucket:     "PASTE_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId:             "PASTE_APP_ID",
};

// Project settings > Cloud Messaging > Web Push certificates > key pair
export const vapidKey = "PASTE_WEB_PUSH_CERTIFICATE_KEY_PAIR";
