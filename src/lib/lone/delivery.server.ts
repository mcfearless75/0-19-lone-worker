import type { Sql } from "@/lib/db";
import { decide, FIRST_CHECK_AFTER_MS, GIVE_UP_AFTER_MS } from "./delivery";
import { twilioSmsFallback, twilioStatus } from "./notify.server";

type PendingRow = { sid: string; to_number: string; body: string; created_at: string | Date; checks: number };

/**
 * Check every WhatsApp Twilio accepted but has not yet confirmed. A failed or
 * undelivered one gets an SMS to the same number, once. Runs from the server
 * sweep every 30 s; each row is claimed before the SMS goes so a second sweep
 * can never send it twice.
 */
export async function checkWhatsappDeliveries(sql: Sql): Promise<number> {
  const rows = await sql<PendingRow>`
    select sid, to_number, body, created_at, checks from wa_sends
    where status = 'pending'
      and created_at < now() - make_interval(secs => ${FIRST_CHECK_AFTER_MS / 1000})
      and created_at > now() - make_interval(secs => ${GIVE_UP_AFTER_MS / 1000 + 600})
    order by created_at asc
    limit 50
  `;
  let fallbacks = 0;
  for (const row of rows) {
    let status: { status: string; errorCode: string | null };
    try {
      status = await twilioStatus(row.sid);
    } catch (err) {
      console.error(`[delivery] could not read status of ${row.sid}:`, String(err));
      await sql`update wa_sends set checks = checks + 1 where sid = ${row.sid}`;
      continue;
    }
    const age = Date.now() - new Date(row.created_at).getTime();
    const decision = decide(status.status, age);
    if (decision === "wait") {
      await sql`update wa_sends set checks = checks + 1 where sid = ${row.sid}`;
      continue;
    }
    if (decision === "done") {
      await sql`
        update wa_sends set status = 'done', done_at = now(), outcome = ${status.status}
        where sid = ${row.sid}
      `;
      continue;
    }
    // Claim the row first: only one sweep may send the SMS.
    const [claimed] = await sql<{ sid: string }>`
      update wa_sends set status = 'sms', done_at = now(),
        outcome = ${`${status.status}${status.errorCode ? ` ${status.errorCode}` : ""}`}
      where sid = ${row.sid} and status = 'pending'
      returning sid
    `;
    if (!claimed) continue;
    const sent = await twilioSmsFallback(row.to_number, row.body);
    fallbacks += sent ? 1 : 0;
    console.log(
      `[delivery] WhatsApp ${row.sid} ${status.status}${status.errorCode ? ` (${status.errorCode})` : ""}: ` +
        (sent ? "SMS sent instead" : "no SMS number configured, nothing more sent"),
    );
    if (!sent) await sql`update wa_sends set outcome = outcome || ' / no sms number' where sid = ${row.sid}`;
  }
  return fallbacks;
}
