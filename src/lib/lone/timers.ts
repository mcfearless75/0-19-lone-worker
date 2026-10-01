import { normalizePhone, validEmailList } from "./model.ts";

/** Longest a welfare timer may run; a longer one is almost certainly a mistake. */
export const MAX_TIMER_HOURS = 12;
export const MAX_RECIPIENTS = 8;

export type TimerStart = {
  id: string;
  device: string;
  team: string;
  name: string;
  job: string;
  note: string;
  org: string;
  where: string;
  phones: string;
  emails: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  expiresAt: string;
};

export type TimerUpdate = {
  id: string;
  device: string;
  status: "running" | "checked_in";
  expiresAt: string | null;
};

const UUID = /^[0-9a-f-]{36}$/i;

function clip(value: unknown, max: number): string {
  return String(value ?? "").replace(/[\n\r\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function coord(value: unknown, min: number, max: number): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function futureIso(value: unknown, now: number): string | null {
  const t = new Date(String(value ?? "")).getTime();
  if (!Number.isFinite(t) || t <= now || t > now + MAX_TIMER_HOURS * 3_600_000) return null;
  return new Date(t).toISOString();
}

export function parseTimerStart(input: unknown, now = Date.now()): TimerStart {
  const raw = (input ?? {}) as Partial<TimerStart>;
  const id = String(raw.id ?? "");
  const device = String(raw.device ?? "");
  if (!UUID.test(id) || !UUID.test(device)) throw new Error("This timer could not be identified.");
  const expiresAt = futureIso(raw.expiresAt, now);
  if (!expiresAt) throw new Error(`The timer must end in the future and within ${MAX_TIMER_HOURS} hours.`);
  const phones = [...new Set(String(raw.phones ?? "").split(/[,;\n]+/).map(normalizePhone).filter(Boolean))]
    .slice(0, MAX_RECIPIENTS)
    .join(",");
  const emails = [...new Set(validEmailList(String(raw.emails ?? "")).toLowerCase().split(",").filter(Boolean))]
    .slice(0, MAX_RECIPIENTS)
    .join(",");
  return {
    id,
    device,
    team: clip(raw.team, 8).toUpperCase().replace(/[^A-Z0-9]/g, ""),
    name: clip(raw.name, 80) || "Unnamed",
    job: clip(raw.job, 120),
    note: clip(raw.note, 280),
    org: clip(raw.org, 60),
    where: clip(raw.where, 200),
    phones,
    emails,
    lat: coord(raw.lat, -90, 90),
    lng: coord(raw.lng, -180, 180),
    accuracy: coord(raw.accuracy, 0, 50000),
    expiresAt,
  };
}

export function parseTimerUpdate(input: unknown, now = Date.now()): TimerUpdate {
  const raw = (input ?? {}) as Partial<TimerUpdate>;
  const id = String(raw.id ?? "");
  const device = String(raw.device ?? "");
  if (!UUID.test(id) || !UUID.test(device)) throw new Error("This timer could not be identified.");
  const status = raw.status === "checked_in" ? "checked_in" : "running";
  const expiresAt = raw.expiresAt == null ? null : futureIso(raw.expiresAt, now);
  if (raw.expiresAt != null && !expiresAt) {
    throw new Error(`The timer must end in the future and within ${MAX_TIMER_HOURS} hours.`);
  }
  return { id, device, status, expiresAt };
}
