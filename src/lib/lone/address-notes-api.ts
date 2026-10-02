import { createServerFn } from "@tanstack/react-start";
import { type AddressNote, NOTE_MAX_AGE_DAYS, NOTE_RADIUS_M, parseLevel, parseLookup, parseNewNote } from "./address-notes";
import { distanceM } from "./geo";

type Row = {
  id: number;
  author: string;
  address: string;
  lat: number;
  lng: number;
  level: string;
  note: string;
  source: string;
  created_at: string | Date;
};

/** Add what the team should know about an address. */
export const addAddressNote = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => parseNewNote(input))
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const [recent] = await sql<{ n: number }>`
      select count(*) as n from address_notes where device = ${data.device} and created_at > now() - interval '1 hour'
    `;
    if ((recent?.n ?? 0) >= 30) throw new Error("Too many notes in the last hour.");
    await sql`
      insert into address_notes (team, device, author, address, lat, lng, level, note, source)
      values (${data.team}, ${data.device}, ${data.author}, ${data.address}, ${data.lat}, ${data.lng}, ${data.level}, ${data.note}, 'manual')
    `;
    return { ok: true as const };
  });

/** Everything the team has recorded within 150 m of a point in the last year, worst first. */
export const readAddressNotes = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => parseLookup(input))
  .handler(async ({ data }): Promise<AddressNote[]> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    // Bounding box first (cheap, indexed), exact distance in JS.
    const dLat = NOTE_RADIUS_M / 111_000;
    const dLng = NOTE_RADIUS_M / (111_000 * Math.max(0.2, Math.cos((data.lat * Math.PI) / 180)));
    const rows = await sql<Row>`
      select id, author, address, lat, lng, level, note, source, created_at
      from address_notes
      where team = ${data.team}
        and lat between ${data.lat - dLat} and ${data.lat + dLat}
        and lng between ${data.lng - dLng} and ${data.lng + dLng}
        and created_at > now() - make_interval(days => ${NOTE_MAX_AGE_DAYS})
      order by created_at desc
      limit 100
    `;
    const rank = { danger: 0, caution: 1, info: 2 };
    return rows
      .map((r) => ({
        id: Number(r.id),
        author: r.author,
        address: r.address,
        lat: r.lat,
        lng: r.lng,
        level: parseLevel(r.level),
        note: r.note,
        source: r.source === "alert" ? ("alert" as const) : ("manual" as const),
        createdAt: new Date(r.created_at).toISOString(),
        distanceM: Math.round(distanceM(data.lat, data.lng, r.lat, r.lng)),
      }))
      .filter((n) => n.distanceM <= NOTE_RADIUS_M)
      .sort((a, b) => rank[a.level] - rank[b.level] || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20);
  });
