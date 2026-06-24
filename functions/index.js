/* ============================================================
   Pixel Pal — Cloud Function
   ------------------------------------------------------------
   Runs every minute on Google's servers. It finds tasks whose reminder
   time has arrived and pushes a notification to EVERY registered device,
   so phones ring even when nobody has the site open.

   It is the single source of truth for "firing" a reminder:
     - normal task  -> push once, then mark notified = true
     - "nag" task   -> push, then re-arm remindAt for +5 minutes

   Deploy with:  firebase deploy --only functions
   (Requires the Blaze pay-as-you-go plan; at personal scale this is $0.)
   ============================================================ */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();

const NAG_INTERVAL_MS = 5 * 60 * 1000;

exports.fireReminders = onSchedule(
  { schedule: "every 1 minutes", timeZone: "Etc/UTC" },
  async () => {
    const now = Date.now();

    // Tasks that are active and not yet fired.
    const snap = await db
      .collection("tasks")
      .where("done", "==", false)
      .where("notified", "==", false)
      .get();

    const due = snap.docs.filter((d) => (d.data().remindAt || 0) <= now);
    if (due.length === 0) {
      logger.debug("No reminders due.");
      return;
    }

    // All registered devices.
    const tokensSnap = await db.collection("pushTokens").get();
    const tokens = tokensSnap.docs.map((d) => d.id);
    logger.info(`Firing ${due.length} reminder(s) to ${tokens.length} device(s).`);

    for (const docSnap of due) {
      const task = docSnap.data();

      if (tokens.length > 0) {
        try {
          const resp = await getMessaging().sendEachForMulticast({
            tokens,
            notification: {
              title: "⏰ Pixel Pal reminder",
              body: task.text || "You have a task to do!",
            },
            data: { id: docSnap.id },
            webpush: {
              notification: {
                requireInteraction: true,
                vibrate: [200, 100, 200, 100, 200],
              },
              fcmOptions: {},
            },
            android: { priority: "high" },
            apns: { headers: { "apns-priority": "10" } },
          });

          // Prune dead tokens so the list stays clean.
          resp.responses.forEach((r, i) => {
            if (!r.success) {
              const code = (r.error && r.error.code) || "";
              if (
                code.includes("registration-token-not-registered") ||
                code.includes("invalid-argument")
              ) {
                db.collection("pushTokens").doc(tokens[i]).delete().catch(() => {});
              }
            }
          });
        } catch (e) {
          logger.error("Push send failed:", e);
        }
      }

      // Advance the task's state.
      if (task.repeat) {
        await docSnap.ref.update({ remindAt: now + NAG_INTERVAL_MS });
      } else {
        await docSnap.ref.update({ notified: true });
      }
    }
  }
);
