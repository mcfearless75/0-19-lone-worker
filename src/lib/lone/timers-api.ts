import { createServerFn } from "@tanstack/react-start";
import { parseTimerStart, parseTimerUpdate } from "./timers";

/**
 * Welfare timers held on the server. If a timer runs out before the worker
 * checks in or ends the job, the server raises the alert itself (see
 * timers.server.ts), even if the phone is locked, flat or out of signal.
 */
export const startTimer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => parseTimerStart(input))
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    // One running timer per phone: starting a new job replaces the old timer.
    await sql`
      update welfare_timers set status = 'replaced', updated_at = now()
      where device = ${data.device} and status = 'running' and id <> ${data.id}
    `;
    await sql`
      insert into welfare_timers
        (id, device, team, name, job, note, org, where_text, phones, emails, lat, lng, accuracy, expires_at)
      values
        (${data.id}, ${data.device}, ${data.team}, ${data.name}, ${data.job}, ${data.note}, ${data.org},
         ${data.where}, ${data.phones}, ${data.emails}, ${data.lat}, ${data.lng}, ${data.accuracy}, ${data.expiresAt})
      on conflict (id) do update set
        expires_at = excluded.expires_at, status = 'running', updated_at = now()
    `;
    return { ok: true as const };
  });

export const updateTimer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => parseTimerUpdate(input))
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const [row] = await sql<{ status: string }>`
      update welfare_timers
      set status = case when status = 'running' then ${data.status} else status end,
          expires_at = coalesce(${data.expiresAt}::timestamptz, expires_at),
          updated_at = now()
      where id = ${data.id} and device = ${data.device}
      returning status
    `;
    return { ok: true as const, status: row?.status ?? "unknown" };
  });
