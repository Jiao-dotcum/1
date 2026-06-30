// ============================================================
// supabase-config.js  —  paste your project's values here
// ============================================================
//
// Pixel Pal works with ZERO setup (private, on-device list). To turn on the
// SHARED live list + phone push that rings even when the site is closed, you
// need a free Supabase project (no credit card required):
//
//   1. Create a free project at https://supabase.com  (note its URL + keys).
//   2. SQL editor -> run the contents of supabase/schema.sql  (tables + realtime).
//   3. Project Settings -> API -> copy the "Project URL" and the
//      "anon public" key into SUPABASE_URL / SUPABASE_ANON_KEY below.
//   4. Set ENABLED = true.   (VAPID_PUBLIC_KEY below is already filled in.)
//
// For push that fires when EVERY device is closed, deploy the Edge Function
// in supabase/functions/fire-reminders and schedule it (see README).
//
// Until ENABLED is true (or if Supabase can't load), the app falls back to a
// private on-device list — nothing breaks.
//
// NOTE: the URL, anon key, and VAPID *public* key are all safe to ship in
// client code. The VAPID *private* key is a server secret and lives only in
// the Edge Function's environment — never put it here.
// ------------------------------------------------------------

export const ENABLED = true;

export const SUPABASE_URL = "https://wdzpnjawcxbiqiasiezp.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkenBuamF3Y3hiaXFpYXNpZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0ODY3NjksImV4cCI6MjA5ODA2Mjc2OX0.DHXOLautUYqJNz16GV81J4YoT2_PYFwzFbhmeYX7FLo";

// Public half of the Web Push (VAPID) key pair. Already generated for you.
// The matching private key is set as an Edge Function secret (see README).
export const VAPID_PUBLIC_KEY =
  "BNPnpzjii_bDl9_bicPrHbd8i4yO-b8P44CJOxCnqvduFNHrCXot4LT6IkUrbLeU8gVSaM2-s0tPneV3lPnq1d0";
