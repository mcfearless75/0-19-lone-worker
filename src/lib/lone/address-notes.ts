export type NoteLevel = "info" | "caution" | "danger";

export type AddressNote = {
  id: number;
  author: string;
  address: string;
  lat: number;
  lng: number;
  level: NoteLevel;
  note: string;
  source: "manual" | "alert";
  createdAt: string;
  distanceM: number;
};

/** Notes within this distance of the pin are "about this address". */
export const NOTE_RADIUS_M = 150;
/** Notes older than this are not shown (they are kept for the record). */
export const NOTE_MAX_AGE_DAYS = 365;

const UUID = /^[0-9a-f-]{36}$/i;

function clip(value: unknown, max: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function coord(value: unknown, min: number, max: number): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export function parseLevel(value: unknown): NoteLevel {
  return value === "info" || value === "danger" ? value : "caution";
}

export function parseNewNote(input: unknown) {
  const raw = (input ?? {}) as Record<string, unknown>;
  const team = clip(raw.team, 8).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z0-9]{4,8}$/.test(team)) throw new Error("Join a board code first: address notes are shared with your team.");
  const device = String(raw.device ?? "");
  if (!UUID.test(device)) throw new Error("This phone could not be identified.");
  const lat = coord(raw.lat, -90, 90);
  const lng = coord(raw.lng, -180, 180);
  if (lat == null || lng == null) throw new Error("This address has no map position yet.");
  const note = clip(raw.note, 500);
  if (!note) throw new Error("Write what the team should know.");
  return {
    team,
    device,
    author: clip(raw.author, 80) || "Unnamed",
    address: clip(raw.address, 200),
    lat,
    lng,
    level: parseLevel(raw.level),
    note,
  };
}

export function parseLookup(input: unknown) {
  const raw = (input ?? {}) as Record<string, unknown>;
  const team = clip(raw.team, 8).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z0-9]{4,8}$/.test(team)) throw new Error("No board code.");
  const lat = coord(raw.lat, -90, 90);
  const lng = coord(raw.lng, -180, 180);
  if (lat == null || lng == null) throw new Error("No position.");
  return { team, lat, lng };
}

export function levelLabel(level: NoteLevel): string {
  return level === "danger" ? "Danger" : level === "info" ? "Info" : "Caution";
}

/** Highest level across a set of notes, for the badge on the job card. */
export function worstLevel(notes: Array<{ level: NoteLevel }>): NoteLevel | null {
  if (notes.some((n) => n.level === "danger")) return "danger";
  if (notes.some((n) => n.level === "caution")) return "caution";
  return notes.length ? "info" : null;
}
