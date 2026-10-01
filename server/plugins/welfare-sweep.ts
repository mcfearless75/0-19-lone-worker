import { definePlugin } from "nitro";

/**
 * Runs inside the web server from the moment it starts: every 30 seconds,
 * fire any welfare timer that has run out. This is what makes a missed
 * check-in raise the alarm even when the worker's phone is locked or dead.
 */
const EVERY_MS = 30_000;

export default definePlugin(() => {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const [{ getSql }, { sweepWelfareTimers }] = await Promise.all([
        import("@/lib/db"),
        import("@/lib/lone/timers.server"),
      ]);
      const fired = await sweepWelfareTimers(await getSql());
      if (fired) console.log(`[welfare] sweep fired ${fired} timer(s)`);
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
