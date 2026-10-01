import { createServerFn } from "@tanstack/react-start";

/** About 3 minutes of phone-quality audio. */
const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
const PER_DEVICE_PER_HOUR = 30;
const AUDIO_TYPES = new Set(["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/aac"]);

type NoteBody = {
  device: string;
  name: string;
  job: string;
  note: string;
  lat: number | null;
  lng: number | null;
  audioBase64: string;
  mime: string;
};

function clip(value: unknown, max: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function coord(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return value == null || value === "" || !Number.isFinite(n) || n < min || n > max ? null : n;
}

export function parseNote(input: unknown): NoteBody {
  const raw = (input ?? {}) as Partial<NoteBody>;
  const device = String(raw.device ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(device)) throw new Error("This phone could not be identified.");
  const audioBase64 = String(raw.audioBase64 ?? "");
  if (audioBase64.length > Math.ceil((MAX_AUDIO_BYTES * 4) / 3) + 4) throw new Error("Voice note is too long.");
  const mime = String(raw.mime ?? "").split(";")[0].trim();
  const note = String(raw.note ?? "").trim().slice(0, 1000);
  if (!note && !audioBase64) throw new Error("Nothing to save.");
  return {
    device,
    name: clip(raw.name, 80) || "Unnamed",
    job: clip(raw.job, 120),
    note,
    lat: coord(raw.lat, -90, 90),
    lng: coord(raw.lng, -180, 180),
    audioBase64,
    mime: AUDIO_TYPES.has(mime) ? mime : audioBase64 ? "audio/webm" : "",
  };
}

/**
 * Stores an amber note on the server so it can go out with any alert that
 * follows. Notes are kept for 7 days, then deleted.
 */
export const saveNoteOnline = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => parseNote(input))
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const [recent] = await sql<{ n: number }>`
      select count(*) as n from amber_notes
      where device = ${data.device} and created_at > now() - interval '1 hour'
    `;
    if ((recent?.n ?? 0) >= PER_DEVICE_PER_HOUR) throw new Error("Too many notes in the last hour.");
    const audio = data.audioBase64 ? Buffer.from(data.audioBase64, "base64") : null;
    await sql`
      insert into amber_notes (device, name, job, note, audio, mime, lat, lng)
      values (${data.device}, ${data.name}, ${data.job}, ${data.note}, ${audio}, ${data.mime}, ${data.lat}, ${data.lng})
    `;
    await sql`delete from amber_notes where created_at < now() - interval '7 days'`;
    return { ok: true as const };
  });
