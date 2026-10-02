import { createServerFn } from "@tanstack/react-start";
import { parseVisitRecord, type VisitRecord } from "./visits";
import { normalizePhone } from "./model";
import {
  type BoardPerson,
  type RaiseResult,
  normalizeTeamCode,
  parsePublish,
  parseRaise,
  validTeamCode,
} from "./board";

type PresenceRow = {
  device: string;
  name: string;
  job: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  seen_at: string | Date;
  alert_kind: string | null;
  alert_note: string | null;
  alert_at: string | Date | null;
  visit_state: string | null;
  visit_started_at: string | Date | null;
  due_at: string | Date | null;
  checked_in_at: string | Date | null;
};

function isoOrNull(value: string | Date | null | undefined): string | null {
  return value ? iso(value) : null;
}

function iso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function person(row: PresenceRow): BoardPerson {
  const kind = row.alert_kind === "red" || row.alert_kind === "timer" ? row.alert_kind : "";
  return {
    device: row.device,
    name: row.name,
    job: row.job,
    lat: row.lat,
    lng: row.lng,
    accuracy: row.accuracy,
    seenAt: iso(row.seen_at),
    alertKind: kind,
    alertNote: row.alert_note ?? "",
    alertAt: row.alert_at ? iso(row.alert_at) : null,
    visitState: (["travelling", "on_visit", "checked_in", "overdue"].includes(row.visit_state ?? "")
      ? row.visit_state
      : "") as BoardPerson["visitState"],
    visitStartedAt: isoOrNull(row.visit_started_at),
    dueAt: isoOrNull(row.due_at),
    checkedInAt: isoOrNull(row.checked_in_at),
  };
}

export const publishPresence = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => parsePublish(input))
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`delete from presence where seen_at < now() - interval '24 hours' and (alert_at is null or alert_at < now() - interval '24 hours')`;
    await sql`
      insert into presence (team, device, name, job, lat, lng, accuracy, seen_at, visit_state, visit_started_at, due_at, checked_in_at)
      values (${data.team}, ${data.device}, ${data.name}, ${data.job}, ${data.lat}, ${data.lng}, ${data.accuracy}, now(),
              ${data.visitState ?? ""}, ${data.visitStartedAt ?? null}, ${data.dueAt ?? null}, ${data.checkedInAt ?? null})
      on conflict (team, device) do update set
        name = excluded.name,
        job = excluded.job,
        lat = excluded.lat,
        lng = excluded.lng,
        accuracy = excluded.accuracy,
        seen_at = now(),
        visit_state = excluded.visit_state,
        visit_started_at = excluded.visit_started_at,
        due_at = excluded.due_at,
        checked_in_at = excluded.checked_in_at
    `;
    return { ok: true as const };
  });

export const raiseBoardAlert = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => parseRaise(input))
  .handler(async ({ data }): Promise<RaiseResult> => {
    const { getSql } = await import("@/lib/db");
    let board = false;
    if (validTeamCode(data.team)) {
      const sql = await getSql();
      await sql`
        insert into presence (team, device, name, job, lat, lng, accuracy, seen_at, alert_kind, alert_note, alert_at)
        values (${data.team}, ${data.device}, ${data.name}, ${data.job}, ${data.lat}, ${data.lng}, ${data.accuracy}, now(), ${data.kind}, ${data.note}, now())
        on conflict (team, device) do update set
          name = excluded.name,
          job = excluded.job,
          lat = excluded.lat,
          lng = excluded.lng,
          accuracy = excluded.accuracy,
          seen_at = now(),
          alert_kind = excluded.alert_kind,
          alert_note = excluded.alert_note,
          alert_at = now()
      `;
      board = true;
    }
    const { notifyEveryone } = await import("./notify.server");
    const sent = await notifyEveryone(await getSql(), data);
    return { board, ...sent };
  });

export const clearBoardAlert = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => parsePublish(input))
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      update presence
      set alert_kind = '', alert_note = '', alert_at = null
      where team = ${data.team} and device = ${data.device}
    `;
    return { ok: true as const };
  });

export const whatsappReady = createServerFn({ method: "POST" }).handler(async () => {
  const { whatsappConnected, emailConnected } = await import("./notify.server");
  return { ready: whatsappConnected(), email: emailConnected() };
});

export const readBoard = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const team = normalizeTeamCode(String((input as { team?: string } | null)?.team ?? ""));
    if (!validTeamCode(team)) throw new Error("Enter a board code of 4 to 8 letters or numbers.");
    return { team };
  })
  .handler(async ({ data }): Promise<BoardPerson[]> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<PresenceRow>`
      select device, name, job, lat, lng, accuracy, seen_at, alert_kind, alert_note, alert_at,
             visit_state, visit_started_at, due_at, checked_in_at
      from presence
      where team = ${data.team}
        and (
          seen_at > now() - interval '12 hours'
          or (alert_kind <> '' and alert_at > now() - interval '12 hours')
        )
      order by name asc
      limit 40
    `;
    return rows.map(person);
  });

export const leaveBoard = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => parsePublish({ ...(input as object), name: "Left", lat: null, lng: null, accuracy: null }))
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`delete from presence where team = ${data.team} and device = ${data.device}`;
    return { ok: true as const };
  });

/**
 * Take a quiet pin off the board. Anyone with the code may do it, but only to
 * a phone that has not reported for 3+ minutes and has no open alert: a live
 * worker or an alert can never be removed by someone else.
 */
export const removeStalePin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const raw = (input ?? {}) as { team?: string; device?: string };
    const team = normalizeTeamCode(String(raw.team ?? ""));
    if (!validTeamCode(team)) throw new Error("Enter a board code of 4 to 8 letters or numbers.");
    const device = String(raw.device ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(device)) throw new Error("That pin could not be identified.");
    return { team, device };
  })
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ device: string }>`
      delete from presence
      where team = ${data.team} and device = ${data.device}
        and seen_at < now() - interval '3 minutes'
        and alert_kind = ''
      returning device
    `;
    return { removed: rows.length > 0 };
  });

type VisitRow = {
  id: string;
  device: string;
  name: string;
  site: string;
  address: string;
  started_at: string | Date;
  arrived_at: string | Date | null;
  due_at: string | Date | null;
  checked_in_at: string | Date | null;
  ended_at: string | Date | null;
  outcome: string;
};

/** Keep the team's visit history in step with this phone (upsert by visit id). */
export const syncVisit = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => parseVisitRecord(input))
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      insert into visits (id, device, team, name, site, address, started_at, arrived_at, due_at, checked_in_at, ended_at, outcome, updated_at)
      values (${data.id}, ${data.device}, ${data.team}, ${data.name}, ${data.site}, ${data.address}, ${data.startedAt},
              ${data.arrivedAt}, ${data.dueAt}, ${data.checkedInAt}, ${data.endedAt}, ${data.outcome}, now())
      on conflict (id) do update set
        team = excluded.team, name = excluded.name, site = excluded.site, address = excluded.address,
        arrived_at = excluded.arrived_at, due_at = excluded.due_at, checked_in_at = excluded.checked_in_at,
        ended_at = excluded.ended_at, outcome = excluded.outcome, updated_at = now()
    `;
    await sql`delete from visits where started_at < now() - interval '90 days'`;
    return { ok: true as const };
  });

/** The team's visits from the last 24 hours, newest first. */
export const readVisits = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const team = normalizeTeamCode(String((input as { team?: string } | null)?.team ?? ""));
    if (!validTeamCode(team)) throw new Error("Enter a board code of 4 to 8 letters or numbers.");
    return { team };
  })
  .handler(async ({ data }): Promise<VisitRecord[]> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<VisitRow>`
      select id, device, name, site, address, started_at, arrived_at, due_at, checked_in_at, ended_at, outcome
      from visits
      where team = ${data.team} and started_at > now() - interval '24 hours'
      order by started_at desc
      limit 100
    `;
    return rows.map((r) => ({
      id: r.id,
      device: r.device,
      team: data.team,
      name: r.name,
      site: r.site,
      address: r.address,
      startedAt: iso(r.started_at),
      arrivedAt: isoOrNull(r.arrived_at),
      dueAt: isoOrNull(r.due_at),
      checkedInAt: isoOrNull(r.checked_in_at),
      endedAt: isoOrNull(r.ended_at),
      outcome: r.outcome,
    }));
  });

/**
 * Optional: tell the duty mobiles the worker has checked in safe. Only runs
 * when the worker has turned it on in Routes. Short text, no delivery chase.
 */
export const announceCheckIn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const raw = (input ?? {}) as { device?: string; name?: string; site?: string; phones?: string; org?: string };
    const device = String(raw.device ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(device)) throw new Error("This phone could not be identified.");
    const phones = [...new Set(String(raw.phones ?? "").split(/[,;\n]+/).map(normalizePhone).filter(Boolean))].slice(0, 8);
    return {
      device,
      name: String(raw.name ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || "Unnamed",
      site: String(raw.site ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
      org: String(raw.org ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
      phones,
    };
  })
  .handler(async ({ data }) => {
    if (data.phones.length === 0) return { sent: 0 };
    const { getSql } = await import("@/lib/db");
    const { sendTeamNote } = await import("./notify.server");
    const sql = await getSql();
    const [recent] = await sql<{ n: number }>`
      select count(*) as n from alert_sends where device = ${data.device} and at > now() - interval '1 hour'
    `;
    if ((recent?.n ?? 0) >= 20) return { sent: 0 };
    await sql`insert into alert_sends (device, ip) values (${data.device}, 'checkin')`;
    const when = new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
    const brand = data.org || "Lone Worker";
    const text = `${brand}: ${data.name} checked in safe at ${when}${data.site ? ` from ${data.site}` : ""}. No action needed.`;
    return { sent: await sendTeamNote(sql, data.phones, text) };
  });
