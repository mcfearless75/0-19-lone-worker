import { createServerFn } from "@tanstack/react-start";
import type { EvidencePack } from "./evidence";
import { normalizeTeamCode } from "./board";

function parse(input: unknown) {
  const raw = (input ?? {}) as { alertId?: string; team?: string; device?: string };
  const alertId = String(raw.alertId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(alertId)) throw new Error("That alert could not be identified.");
  return {
    alertId,
    team: normalizeTeamCode(String(raw.team ?? "")),
    device: /^[0-9a-f-]{36}$/i.test(String(raw.device ?? "")) ? String(raw.device) : "",
  };
}

/** Only the phone that raised it, or anyone on the same board code, may see a pack. */
async function allowed(sql: import("@/lib/db").Sql, p: ReturnType<typeof parse>): Promise<boolean> {
  const [row] = await sql<{ team: string; device: string }>`select team, device from alerts where id = ${p.alertId}`;
  if (!row) return false;
  return row.device === p.device || (row.team !== "" && row.team === p.team);
}

export const readEvidence = createServerFn({ method: "POST" })
  .inputValidator(parse)
  .handler(async ({ data }): Promise<EvidencePack | null> => {
    const { getSql } = await import("@/lib/db");
    const { gatherEvidence } = await import("./evidence.server");
    const sql = await getSql();
    if (!(await allowed(sql, data))) return null;
    const found = await gatherEvidence(sql, data.alertId);
    return found?.pack ?? null;
  });

export const emailEvidence = createServerFn({ method: "POST" })
  .inputValidator(parse)
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const { emailEvidencePack } = await import("./evidence.server");
    const sql = await getSql();
    if (!(await allowed(sql, data))) return { sent: 0 };
    return { sent: await emailEvidencePack(sql, data.alertId) };
  });
