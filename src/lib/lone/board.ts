import { normalizePhone, validEmailList } from "./model.ts";
import { parseVisitFields, type VisitFields } from "./visits.ts";

export type BoardPerson = {
  device: string;
  name: string;
  job: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  seenAt: string;
  alertKind: "" | "red" | "timer";
  alertNote: string;
  alertAt: string | null;
} & VisitFields;

export type PublishBody = {
  team: string;
  device: string;
  name: string;
  job: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
} & Partial<VisitFields>;

const deviceKey = "lone-worker-device";

export function normalizeTeamCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export function validTeamCode(code: string): boolean {
  return /^[A-Z0-9]{4,8}$/.test(code);
}

export function freshCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

export function deviceId(): string {
  const existing = localStorage.getItem(deviceKey);
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(deviceKey, id);
  return id;
}

/** A pin older than this is shown greyed out as "last seen", not live. */
export const LIVE_WINDOW_MS = 3 * 60_000;

export function isLive(seenAt: string, now: number): boolean {
  const then = new Date(seenAt).getTime();
  return Number.isFinite(then) && now - then <= LIVE_WINDOW_MS;
}

export function ageLabel(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 15) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? "1 min ago" : `${minutes} min ago`;
}

function cleanCoord(value: unknown, min: number, max: number): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return number;
}

export function parsePublish(input: unknown): PublishBody {
  const raw = (input ?? {}) as Partial<PublishBody>;
  const team = normalizeTeamCode(String(raw.team ?? ""));
  if (!validTeamCode(team)) throw new Error("Enter a board code of 4 to 8 letters or numbers.");
  const device = String(raw.device ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(device)) throw new Error("This phone could not be identified.");
  const name = String(raw.name ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || "Unnamed";
  const job = String(raw.job ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  return {
    team,
    device,
    name,
    job,
    lat: cleanCoord(raw.lat, -90, 90),
    lng: cleanCoord(raw.lng, -180, 180),
    accuracy: cleanCoord(raw.accuracy, 0, 50000),
    ...parseVisitFields(raw as Record<string, unknown>),
  };
}

export type RaiseBody = PublishBody & {
  kind: "red" | "timer";
  note: string;
  phones: string[];
  emails: string[];
  org: string;
  where: string;
};

export type RaiseResult = {
  board: boolean;
  whatsapp: "sent" | "not-connected" | "failed" | "no-numbers";
  sentTo: number;
  email?: "sent" | "not-connected" | "failed" | "no-addresses";
  emailedTo?: number;
};

/** Most people one alert reaches on each channel. */
export const MAX_RECIPIENTS = 8;

function clip(value: unknown, max: number): string {
  return String(value ?? "").replace(/[\n\r\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function parseRaise(input: unknown): RaiseBody {
  const raw = (input ?? {}) as Partial<RaiseBody>;
  const team = normalizeTeamCode(String(raw.team ?? ""));
  if (team && !validTeamCode(team)) throw new Error("Enter a board code of 4 to 8 letters or numbers.");
  const device = String(raw.device ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(device)) throw new Error("This phone could not be identified.");
  const phones = [...new Set(
    String(raw.phones ?? "")
      .split(/[,;\n]+/)
      .map((part) => normalizePhone(part))
      .filter(Boolean),
  )].slice(0, MAX_RECIPIENTS);
  const emails = [...new Set(
    validEmailList(String(raw.emails ?? "")).toLowerCase().split(",").filter(Boolean),
  )].slice(0, MAX_RECIPIENTS);
  return {
    team,
    device,
    name: clip(raw.name, 80) || "Unnamed",
    job: clip(raw.job, 120),
    lat: cleanCoord(raw.lat, -90, 90),
    lng: cleanCoord(raw.lng, -180, 180),
    accuracy: cleanCoord(raw.accuracy, 0, 50000),
    kind: raw.kind === "timer" ? "timer" : "red",
    note: clip(raw.note, 280),
    phones,
    emails,
    org: clip(raw.org, 60),
    where: clip(raw.where, 200) || "No location",
  };
}

function whatsappLine(result: RaiseResult): string {
  switch (result.whatsapp) {
    case "sent":
      return `WhatsApp sent to ${result.sentTo === 1 ? "1 number" : `${result.sentTo} numbers`}.`;
    case "not-connected":
      return "WhatsApp is not connected yet, so no WhatsApp was sent.";
    case "failed":
      return "WhatsApp did not accept the message.";
    case "no-numbers":
      return "";
  }
}

function emailLine(result: RaiseResult): string {
  switch (result.email) {
    case "sent": {
      const n = result.emailedTo ?? 0;
      return `Email sent to ${n === 1 ? "1 address" : `${n} addresses`}.`;
    }
    case "not-connected":
      return "Email sending is not connected yet, so no email was sent.";
    case "failed":
      return "The email did not go out.";
    default:
      return "";
  }
}

export function raisedLabel(result: RaiseResult): string {
  const sent = [whatsappLine(result), emailLine(result)].filter(Boolean).join(" ");
  const nobody = result.whatsapp === "no-numbers" && (result.email ?? "no-addresses") === "no-addresses";
  if (result.board) {
    if (nobody) return "On the board. Add duty mobiles or alert emails in Routes so people are messaged too.";
    return `On the board. ${sent}`;
  }
  if (nobody) return "Saved on this phone only. Add duty mobiles or alert emails in Routes so people are messaged.";
  return `${sent} Set a board code so the others also see it on the board.`;
}
