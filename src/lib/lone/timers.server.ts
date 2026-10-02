import type { Sql } from "@/lib/db";
import { notifyEveryone } from "./notify.server";
import { recordAlertAtAddress } from "./address-notes.server";

type DueRow = {
  id: string;
  device: string;
  team: string;
  name: string;
  job: string;
  note: string;
  org: string;
  where_text: string;
  phones: string;
  emails: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  expires_at: string | Date;
};

/**
 * Fire every welfare timer that has run out. Each row is claimed atomically
 * (status running -> fired), so two sweeps can never alert twice. Returns how
 * many fired.
 */
export async function sweepWelfareTimers(sql: Sql): Promise<number> {
  const due = await sql<DueRow>`
    update welfare_timers
    set status = 'fired', fired_at = now(), updated_at = now()
    where status = 'running' and expires_at <= now()
    returning id, device, team, name, job, note, org, where_text, phones, emails, lat, lng, accuracy, expires_at
  `;
  for (const row of due) {
    const where = row.where_text || (row.lat != null && row.lng != null
      ? `https://maps.google.com/?q=${row.lat.toFixed(5)},${row.lng.toFixed(5)}`
      : "No location");
    const note = [row.note, "The worker has not checked in by the time they set."].filter(Boolean).join(". ");
    try {
      if (/^[A-Z0-9]{4,8}$/.test(row.team)) {
        await sql`
          insert into presence (team, device, name, job, lat, lng, accuracy, seen_at, alert_kind, alert_note, alert_at)
          values (${row.team}, ${row.device}, ${row.name}, ${row.job}, ${row.lat}, ${row.lng}, ${row.accuracy}, now(), 'timer', ${note}, now())
          on conflict (team, device) do update set
            alert_kind = 'timer', alert_note = excluded.alert_note, alert_at = now()
        `;
      }
      await recordAlertAtAddress(sql, { team: row.team, name: row.name, job: row.job, kind: "timer", lat: row.lat, lng: row.lng });
      const result = await notifyEveryone(sql, {
        team: row.team,
        device: row.device,
        name: row.name,
        job: row.job,
        lat: row.lat,
        lng: row.lng,
        accuracy: row.accuracy,
        kind: "timer",
        note,
        phones: row.phones ? row.phones.split(",") : [],
        emails: row.emails ? row.emails.split(",") : [],
        org: row.org,
        where,
      });
      console.log(`[welfare] timer ${row.id} fired for ${row.name}: whatsapp ${result.whatsapp}, email ${result.email}`);
    } catch (err) {
      console.error(`[welfare] timer ${row.id} fired but notifying failed:`, String(err));
    }
  }
  return due.length;
}
