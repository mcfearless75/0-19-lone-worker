import { definePlugin } from "nitro";

/**
 * Runs inside the web server from the moment it starts, every 30 seconds:
 *  - fire any welfare timer that has run out (a missed check-in raises the
 *    alarm even when the worker's phone is locked or dead)
 *  - check WhatsApps Twilio accepted but has not confirmed, and SMS anyone
 *    whose WhatsApp failed
 */
const EVERY_MS = 30_000;

export default definePlugin(() => {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const [{ getSql }, { sweepWelfareTimers }, { checkWhatsappDeliveries }] = await Promise.all([
        import("@/lib/db"),
        import("@/lib/lone/timers.server"),
        import("@/lib/lone/delivery.server"),
      ]);
      const sql = await getSql();
      const fired = await sweepWelfareTimers(sql);
      if (fired) console.log(`[welfare] sweep fired ${fired} timer(s)`);
      const fallbacks = await checkWhatsappDeliveries(sql);
      if (fallbacks) console.log(`[delivery] sent ${fallbacks} SMS fallback(s)`);
    } catch (err) {
      console.error("[welfare] sweep failed:", String(err));
    } finally {
      busy = false;
    }
  };
  setTimeout(() => void tick(), 5_000);
  setInterval(() => void tick(), EVERY_MS);
  console.log("[welfare] sweep scheduled every 30 s");
});
