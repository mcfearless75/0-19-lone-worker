import type { Sql } from "@/lib/db";
import type { RaiseBody } from "./board";
import { distanceM } from "./geo";
import { type EvidencePack, evidenceLines, ukTime } from "./evidence";
import { sendEmailWithFiles } from "./notify.server";
import { buildPdf } from "./pdf";
import { NHS_LOGO } from "./nhs-logo";

/**
 * The server's record of each alert, kept so an evidence pack can be built
 * afterwards: what happened, who was told, where the worker was while it
 * was open, and what the team already knew about the address.
 */

type AlertRow = {
  id: string;
  device: string;
  team: string;
  name: string;
  job: string;
  kind: string;
  note: string;
  org: string;
  where_text: string;
  gps_postcode: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  phones: string;
  emails: string;
  duress: boolean;
  whatsapp_status: string;
  whatsapp_count: number;
  email_status: string;
  email_count: number;
  raised_at: string | Date;
  resolved_at: string | Date | null;
  outcome: string;
  pack_sent_at: string | Date | null;
};

const iso = (v: string | Date | null | undefined): string | null => (v ? new Date(v).toISOString() : null);

export async function openAlertRecord(sql: Sql, data: RaiseBody): Promise<string> {
  const id = data.alertId ?? crypto.randomUUID();
  const duress = /^DURESS CODE ENTERED/.test(data.note);
  try {
    await sql`
      insert into alerts (id, device, team, name, job, kind, note, org, where_text, lat, lng, accuracy, phones, emails, duress)
      values (${id}, ${data.device}, ${data.team}, ${data.name}, ${data.job}, ${data.kind}, ${data.note}, ${data.org},
              ${data.where}, ${data.lat}, ${data.lng}, ${data.accuracy}, ${data.phones.join(",")}, ${data.emails.join(",")}, ${duress})
      on conflict (id) do nothing
    `;
  } catch (err) {
    console.error("[evidence] could not record alert:", String(err));
  }
  return id;
}

export async function closeAlertRecord(
  sql: Sql,
  id: string,
  sent: { whatsapp: string; sentTo: number; email?: string; emailedTo?: number; gpsPostcode?: string },
): Promise<void> {
  try {
    await sql`
      update alerts set whatsapp_status = ${sent.whatsapp}, whatsapp_count = ${sent.sentTo},
        email_status = ${sent.email ?? ""}, email_count = ${sent.emailedTo ?? 0}, gps_postcode = ${sent.gpsPostcode ?? ""}
      where id = ${id}
    `;
  } catch (err) {
    console.error("[evidence] could not update alert sends:", String(err));
  }
}

export async function recordAlertPosition(sql: Sql, device: string, lat: number, lng: number, accuracy: number | null): Promise<void> {
  try {
    const [open] = await sql<{ id: string }>`
      select id from alerts where device = ${device} and resolved_at is null order by raised_at desc limit 1
    `;
    if (!open) return;
    await sql`insert into alert_positions (alert_id, lat, lng, accuracy) values (${open.id}, ${lat}, ${lng}, ${accuracy})`;
  } catch (err) {
    console.error("[evidence] could not record position:", String(err));
  }
}

/** Close every open alert for a device and email each one's evidence pack. */
export async function standDownAlerts(sql: Sql, device: string, outcome: string): Promise<void> {
  let closed: Array<{ id: string }> = [];
  try {
    closed = await sql<{ id: string }>`
      update alerts set resolved_at = now(), outcome = ${outcome}
      where device = ${device} and resolved_at is null and duress = false
      returning id
    `;
  } catch (err) {
    console.error("[evidence] could not stand down alerts:", String(err));
    return;
  }
  for (const row of closed) await emailEvidencePack(sql, row.id).catch((err) => console.error("[evidence] pack email failed:", String(err)));
}

export async function gatherEvidence(sql: Sql, alertId: string): Promise<{ pack: EvidencePack; row: AlertRow } | null> {
  const [row] = await sql<AlertRow>`select * from alerts where id = ${alertId}`;
  if (!row) return null;
  const raisedAt = iso(row.raised_at)!;
  const [positions, notes, related, visit] = await Promise.all([
    sql<{ lat: number; lng: number; accuracy: number | null; at: string | Date }>`
      select lat, lng, accuracy, at from alert_positions where alert_id = ${alertId} order by at asc limit 500
    `,
    sql<{ created_at: string | Date; note: string; has_audio: boolean }>`
      select created_at, note, (audio is not null) as has_audio from amber_notes
      where device = ${row.device} and created_at between ${raisedAt}::timestamptz - interval '12 hours' and ${raisedAt}::timestamptz
      order by created_at asc limit 10
    `,
    sql<{ id: string; kind: string; raised_at: string | Date; note: string; duress: boolean }>`
      select id, kind, raised_at, note, duress from alerts
      where device = ${row.device} and id <> ${alertId}
        and raised_at between ${raisedAt}::timestamptz - interval '12 hours' and ${raisedAt}::timestamptz + interval '12 hours'
      order by raised_at asc limit 10
    `,
    sql<{ site: string; address: string; started_at: string | Date; arrived_at: string | Date | null; due_at: string | Date | null; checked_in_at: string | Date | null; ended_at: string | Date | null }>`
      select site, address, started_at, arrived_at, due_at, checked_in_at, ended_at from visits
      where device = ${row.device} and started_at <= ${raisedAt}::timestamptz
      order by started_at desc limit 1
    `,
  ]);
  let addressNotes: EvidencePack["addressNotes"] = [];
  if (row.lat != null && row.lng != null && /^[A-Z0-9]{4,8}$/.test(row.team)) {
    const d = 150 / 111_000;
    const rows = await sql<{ level: string; note: string; author: string; created_at: string | Date; lat: number; lng: number }>`
      select level, note, author, created_at, lat, lng from address_notes
      where team = ${row.team} and lat between ${row.lat - d} and ${row.lat + d} and lng between ${row.lng - 2 * d} and ${row.lng + 2 * d}
        and created_at < ${raisedAt}::timestamptz and created_at > ${raisedAt}::timestamptz - interval '365 days'
      order by created_at desc limit 20
    `;
    addressNotes = rows
      .filter((n) => distanceM(row.lat!, row.lng!, n.lat, n.lng) <= 150)
      .map((n) => ({ level: n.level, note: n.note, author: n.author, createdAt: iso(n.created_at)! }));
  }
  const phones = row.phones ? row.phones.split(",").filter(Boolean) : [];
  const emails = row.emails ? row.emails.split(",").filter(Boolean) : [];
  const pack: EvidencePack = {
    alert: {
      id: row.id,
      kind: row.kind === "timer" ? "timer" : "red",
      name: row.name,
      org: row.org,
      job: row.job,
      note: row.note,
      where: row.where_text,
      gpsPostcode: row.gps_postcode,
      lat: row.lat,
      lng: row.lng,
      accuracy: row.accuracy,
      raisedAt,
      resolvedAt: iso(row.resolved_at),
      outcome: row.outcome,
      duress: row.duress,
      whatsapp: { status: row.whatsapp_status, count: row.whatsapp_count, total: phones.length, to: phones },
      email: { status: row.email_status, count: row.email_count, total: emails.length, to: emails },
    },
    positions: positions.map((p) => ({ lat: p.lat, lng: p.lng, accuracy: p.accuracy, at: iso(p.at)! })),
    notes: notes.map((n) => ({ at: iso(n.created_at)!, note: n.note, hasAudio: n.has_audio })),
    related: related.map((r) => ({ id: r.id, kind: r.kind, raisedAt: iso(r.raised_at)!, note: r.note, duress: r.duress })),
    addressNotes,
    visit: visit[0]
      ? {
          site: visit[0].site,
          address: visit[0].address,
          startedAt: iso(visit[0].started_at)!,
          arrivedAt: iso(visit[0].arrived_at),
          dueAt: iso(visit[0].due_at),
          checkedInAt: iso(visit[0].checked_in_at),
          endedAt: iso(visit[0].ended_at),
        }
      : null,
    generatedAt: new Date().toISOString(),
  };
  return { pack, row };
}

export function evidencePdf(pack: EvidencePack): Uint8Array {
  const a = pack.alert;
  return buildPdf(
    evidenceLines(pack),
    `Evidence pack ${a.id}`,
    {
      title: a.org || "0-19 Lone Worker",
      subtitle: `Lone worker incident evidence pack · ${a.name} · ${ukTime(a.raisedAt)}`,
      footer: `Confidential. Generated ${ukTime(pack.generatedAt)} from the 0-19 Lone Worker system. Alert ${a.id}.`,
      nhs: true,
    },
    NHS_LOGO,
  );
}

/** Email the pack as a PDF to the alert's email list. Returns how many addresses accepted it. */
export async function emailEvidencePack(sql: Sql, alertId: string): Promise<number> {
  const found = await gatherEvidence(sql, alertId);
  if (!found) return 0;
  const emails = found.row.emails ? found.row.emails.split(",") : [];
  if (emails.length === 0) return 0;
  const pdf = evidencePdf(found.pack);
  const a = found.pack.alert;
  const subject = `Evidence pack: ${a.kind === "timer" ? "welfare timer expired" : "red alert"} — ${a.name}, ${ukTime(a.raisedAt)}`;
  const text = [
    `Attached is the evidence pack for the alert raised by ${a.name} at ${ukTime(a.raisedAt)}.`,
    a.resolvedAt ? `Stood down ${ukTime(a.resolvedAt)}: ${a.outcome}.` : "The alert was still open when this pack was generated.",
    "It contains the timeline, who was notified, the location trail while the alert was open, and what the team had recorded about the address.",
  ].join("\n");
  const count = await sendEmailWithFiles(emails, subject, text, [
    { filename: `evidence-pack-${a.raisedAt.slice(0, 10)}-${a.id.slice(0, 8)}.pdf`, content: Buffer.from(pdf).toString("base64") },
  ]);
  if (count > 0) await sql`update alerts set pack_sent_at = now() where id = ${alertId}`.catch(() => undefined);
  return count;
}

