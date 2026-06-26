// ============================================================
// Edge Function: fire-reminders
// ------------------------------------------------------------
// Runs on Supabase (Deno). Scheduled to run every minute by pg_cron
// (see supabase/cron.sql). It finds tasks whose reminder time has
// arrived and sends a Web Push to EVERY registered device — so phones
// ring even when nobody has the site open.
//
// It is the single source of truth for "firing" a reminder:
//   - normal task -> push once, then mark notified = true
//   - "nag" task  -> push, then re-arm remind_at for +5 minutes
//
// Deploy:  supabase functions deploy fire-reminders
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
//          (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected
//           automatically by the platform.)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const NAG_INTERVAL_MS = 5 * 60 * 1000;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:pixelpal@example.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const now = Date.now();

  const { data: due, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("done", false)
    .eq("notified", false)
    .lte("remind_at", now);

  if (error) {
    console.error("query error", error);
    return json({ error: error.message }, 500);
  }
  if (!due || due.length === 0) return json({ fired: 0 });

  const { data: subs } = await supabase.from("push_subscriptions").select("*");
  const subscriptions = subs ?? [];

  let sent = 0;
  for (const task of due) {
    const payload = JSON.stringify({
      title: "⏰ Pixel Pal reminder",
      body: task.text || "You have a task to do!",
      data: { id: task.id },
    });

    for (const s of subscriptions) {
      try {
        await webpush.sendNotification(s.subscription, payload);
        sent++;
      } catch (e) {
        const code = (e && (e.statusCode || e.status)) as number | undefined;
        // 404 = gone, 410 = unsubscribed -> prune the dead subscription
        if (code === 404 || code === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        } else {
          console.error("push failed", code, e?.body || e);
        }
      }
    }

    // advance the task's state
    if (task.repeat) {
      await supabase.from("tasks").update({ remind_at: now + NAG_INTERVAL_MS }).eq("id", task.id);
    } else {
      await supabase.from("tasks").update({ notified: true }).eq("id", task.id);
    }
  }

  return json({ fired: due.length, pushes: sent, devices: subscriptions.length });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
