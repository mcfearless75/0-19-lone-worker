import { createServerFn } from "@tanstack/react-start";
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
};

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
  };
}

export const publishPresence = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => parsePublish(input))
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`delete from presence where seen_at < now() - interval '24 hours' and (alert_at is null or alert_at < now() - interval '24 hours')`;
    await sql`
      insert into presence (team, device, name, job, lat, lng, accuracy, seen_at)
      values (${data.team}, ${data.device}, ${data.name}, ${data.job}, ${data.lat}, ${data.lng}, ${data.accuracy}, now())
      on conflict (team, device) do update set
        name = excluded.name,
        job = excluded.job,
        lat = excluded.lat,
        lng = excluded.lng,
        accuracy = excluded.accuracy,
        seen_at = now()
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
      select device, name, job, lat, lng, accuracy, seen_at, alert_kind, alert_note, alert_at
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
