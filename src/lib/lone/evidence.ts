import type { PdfLine } from "./pdf";

export type EvidencePack = {
  alert: {
    id: string;
    kind: "red" | "timer";
    name: string;
    org: string;
    job: string;
    note: string;
    where: string;
    gpsPostcode: string;
    lat: number | null;
    lng: number | null;
    accuracy: number | null;
    raisedAt: string;
    resolvedAt: string | null;
    outcome: string;
    duress: boolean;
    whatsapp: { status: string; count: number; total: number };
    email: { status: string; count: number; total: number };
  };
  positions: Array<{ lat: number; lng: number; accuracy: number | null; at: string }>;
  notes: Array<{ at: string; note: string; hasAudio: boolean }>;
  related: Array<{ id: string; kind: string; raisedAt: string; note: string; duress: boolean }>;
  addressNotes: Array<{ level: string; note: string; author: string; createdAt: string }>;
  visit: { site: string; address: string; startedAt: string; arrivedAt: string | null; dueAt: string | null; checkedInAt: string | null; endedAt: string | null } | null;
  generatedAt: string;
};

export function ukTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function label(kind: string): string {
  return kind === "timer" ? "Welfare timer expired (missed check-in)" : "Red alert";
}

/** The pack as lines of text: used for the PDF and mirrored by the on-screen page. */
export function evidenceLines(p: EvidencePack): PdfLine[] {
  const a = p.alert;
  const L: PdfLine[] = [];
  const h = (t: string) => L.push({ text: "" }, { text: t, bold: true, size: 13 });
  L.push({ text: `Incident evidence pack: ${label(a.kind)} — ${a.name}`, bold: true, size: 16 });
  L.push({ text: `Generated ${ukTime(p.generatedAt)} · Alert ${a.id}` });
  L.push({ text: "Times are UK local time. Positions are from the worker's phone GPS." });

  h("Summary");
  L.push({ text: `Type: ${label(a.kind)}${a.duress ? "  — DURESS CODE ENTERED" : ""}`, bold: a.duress });
  L.push({ text: `Worker: ${a.name}` });
  L.push({ text: `Visit: ${a.job || "No job recorded"}` });
  L.push({ text: `Raised: ${ukTime(a.raisedAt)}` });
  L.push({ text: `Stood down: ${a.resolvedAt ? `${ukTime(a.resolvedAt)} — ${a.outcome || "no outcome recorded"}` : "still open at time of generation"}` });
  L.push({ text: `Location at alert: ${a.where}${a.gpsPostcode ? ` (nearest postcode ${a.gpsPostcode})` : ""}${a.accuracy != null ? ` ±${Math.round(a.accuracy)} m` : ""}` });
  if (a.note) L.push({ text: `Note with the alert: ${a.note}` });

  h("Who was told");
  L.push({ text: `WhatsApp: ${describeSend(a.whatsapp)}` });
  L.push({ text: `Email: ${describeSend(a.email)}` });

  if (p.visit) {
    h("Visit record");
    L.push({ text: `Site: ${p.visit.site || "—"}   Address: ${p.visit.address || "—"}` });
    L.push({ text: `Started ${ukTime(p.visit.startedAt)} · Arrived ${ukTime(p.visit.arrivedAt)} · Due ${ukTime(p.visit.dueAt)}` });
    L.push({ text: `Checked in safe ${ukTime(p.visit.checkedInAt)} · Ended ${ukTime(p.visit.endedAt)}` });
  }

  h("Timeline");
  const events: Array<[string, string]> = [];
  if (p.visit) events.push([p.visit.startedAt, "Visit started"]);
  if (p.visit?.arrivedAt) events.push([p.visit.arrivedAt, "Arrived"]);
  for (const n of p.notes) events.push([n.at, `Amber note: ${n.note || "(voice only)"}${n.hasAudio ? " [voice note attached to the alert email]" : ""}`]);
  events.push([a.raisedAt, `${label(a.kind)} raised`]);
  for (const r of p.related) events.push([r.raisedAt, `${r.duress ? "DURESS: " : ""}${label(r.kind)} (related alert ${r.id.slice(0, 8)})${r.note ? `: ${r.note}` : ""}`]);
  if (p.visit?.checkedInAt) events.push([p.visit.checkedInAt, "Worker checked in safe"]);
  if (a.resolvedAt) events.push([a.resolvedAt, `Stood down: ${a.outcome || "—"}`]);
  if (p.visit?.endedAt) events.push([p.visit.endedAt, "Visit ended"]);
  events.sort((x, y) => x[0].localeCompare(y[0]));
  for (const [at, what] of events) L.push({ text: `${ukTime(at)}  ${what}` });

  h(`Location trail during the alert (${p.positions.length} fixes)`);
  if (p.positions.length === 0) L.push({ text: "No positions were reported while the alert was open." });
  for (const pos of p.positions.slice(0, 60)) {
    L.push({ text: `${ukTime(pos.at)}  ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}${pos.accuracy != null ? `  ±${Math.round(pos.accuracy)} m` : ""}  https://maps.google.com/?q=${pos.lat.toFixed(5)},${pos.lng.toFixed(5)}` });
  }
  if (p.positions.length > 60) L.push({ text: `… and ${p.positions.length - 60} more.` });

  h("What the team had recorded about this address");
  if (p.addressNotes.length === 0) L.push({ text: "Nothing recorded within 150 m before this alert." });
  for (const n of p.addressNotes) L.push({ text: `${n.level.toUpperCase()}  ${n.note}  (${n.author}, ${ukTime(n.createdAt)})` });

  L.push({ text: "" });
  L.push({ text: "This pack was generated automatically from the lone worker system's records and has not been edited." });
  return L;
}

function describeSend(s: { status: string; count: number; total: number }): string {
  if (s.total === 0) return "no recipients configured";
  switch (s.status) {
    case "sent":
      return `sent to ${s.count} of ${s.total}`;
    case "not-connected":
      return "service not connected, nothing sent";
    case "failed":
      return `failed for all ${s.total}`;
    default:
      return s.status || "unknown";
  }
}
