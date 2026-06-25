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

export const ENABLED = true;

export const firebaseConfig = {
  apiKey:            "AIzaSyAoxG8Y6QAzuS_U_ZHxjwyYi364-tteTSY",
  authDomain:        "rememmogh.firebaseapp.com",
  projectId:         "rememmogh",
  storageBucket:     "rememmogh.firebasestorage.app",
  messagingSenderId: "258706137750",
  appId:             "1:258706137750:web:104ef7708013ee693798b7",
  measurementId:     "G-YZKJ4G9EE1",
};

// Project settings > Cloud Messaging > Web Push certificates > key pair
export const vapidKey = "BCpCEG5AyrMoYPuJyXWRUCC1zkwR27getydDeGvhd7mVkoBoOn5JHVGg__3oxlbiOW9Kl_s-jvlsrMZ3E7amxv4";
