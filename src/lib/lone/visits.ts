/** Visit (job) state as shared with the team on the Board. */
export type VisitState = "" | "travelling" | "on_visit" | "checked_in" | "overdue";

export type VisitFields = {
  visitState: VisitState;
  visitStartedAt: string | null;
  dueAt: string | null;
  checkedInAt: string | null;
};

const UUID = /^[0-9a-f-]{36}$/i;

export function isoOrNull(value: unknown): string | null {
  if (value == null || value === "") return null;
  const t = new Date(String(value)).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export function parseVisitFields(raw: Record<string, unknown>): VisitFields {
  const state = String(raw.visitState ?? "");
  return {
    visitState:
      state === "travelling" || state === "on_visit" || state === "checked_in" || state === "overdue" ? state : "",
    visitStartedAt: isoOrNull(raw.visitStartedAt),
    dueAt: isoOrNull(raw.dueAt),
    checkedInAt: isoOrNull(raw.checkedInAt),
  };
}

export type VisitRecord = {
  id: string;
  device: string;
  team: string;
  name: string;
  site: string;
  address: string;
  startedAt: string;
  arrivedAt: string | null;
  dueAt: string | null;
  checkedInAt: string | null;
  endedAt: string | null;
  outcome: string;
};

function clip(value: unknown, max: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function parseVisitRecord(input: unknown): VisitRecord {
  const raw = (input ?? {}) as Partial<VisitRecord>;
  const id = String(raw.id ?? "");
  const device = String(raw.device ?? "");
  if (!UUID.test(id) || !UUID.test(device)) throw new Error("This visit could not be identified.");
  const startedAt = isoOrNull(raw.startedAt);
  if (!startedAt) throw new Error("A visit needs a start time.");
  return {
    id,
    device,
    team: clip(raw.team, 8).toUpperCase().replace(/[^A-Z0-9]/g, ""),
    name: clip(raw.name, 80) || "Unnamed",
    site: clip(raw.site, 120),
    address: clip(raw.address, 200),
    startedAt,
    arrivedAt: isoOrNull(raw.arrivedAt),
    dueAt: isoOrNull(raw.dueAt),
    checkedInAt: isoOrNull(raw.checkedInAt),
    endedAt: isoOrNull(raw.endedAt),
    outcome: clip(raw.outcome, 200),
  };
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** One line for the Board: what this person is doing right now. */
export function visitLine(v: VisitFields, job: string, now: number): { text: string; tone: "ok" | "amber" | "muted" } {
  const where = job ? ` · ${job}` : "";
  if (v.visitState === "checked_in" && v.checkedInAt) {
    return { text: `Checked in safe ${clock(v.checkedInAt)}${where}`, tone: "ok" };
  }
  if (v.visitState === "travelling") return { text: `Travelling${where}`, tone: "muted" };
  if (v.visitState === "on_visit" || v.visitState === "overdue") {
    if (v.dueAt) {
      const left = new Date(v.dueAt).getTime() - now;
      if (left < 0) {
        const mins = Math.round(-left / 60_000);
        return { text: `Overdue by ${mins} min${where}`, tone: "amber" };
      }
      return { text: `On a visit${where} · due ${clock(v.dueAt)}`, tone: "muted" };
    }
    return { text: `On a visit${where}`, tone: "muted" };
  }
  return { text: job ? `On a visit${where}` : "No visit open", tone: "muted" };
}
