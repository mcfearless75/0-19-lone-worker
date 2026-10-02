import type { Sql } from "@/lib/db";

/**
 * Every alert leaves a mark on the address, so the next worker sent there
 * sees "Red alert raised here on 1 Oct". Never throws: an alert must never
 * fail because the note did.
 */
export async function recordAlertAtAddress(
  sql: Sql,
  a: { team: string; name: string; job: string; kind: "red" | "timer"; lat: number | null; lng: number | null },
): Promise<void> {
  if (!/^[A-Z0-9]{4,8}$/.test(a.team) || a.lat == null || a.lng == null) return;
  const note =
    a.kind === "timer"
      ? `Welfare timer expired here (${a.name} did not check in)`
      : `Red alert raised here by ${a.name}`;
  try {
    await sql`
      insert into address_notes (team, device, author, address, lat, lng, level, note, source)
      values (${a.team}, '', 'System', ${a.job}, ${a.lat}, ${a.lng}, 'danger', ${note}, 'alert')
    `;
  } catch (err) {
    console.error("[address] could not record alert at address:", String(err));
  }
}
