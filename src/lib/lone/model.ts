export type ChannelId = "whatsapp" | "group" | "email" | "sms" | "call";

export type Profile = {
  organisation: string;
  workerName: string;
  whatsappNumber: string;
  whatsappGroupUrl: string;
  email: string;
  smsNumber: string;
  callNumber: string;
  primary: ChannelId | "desk";
  openPrimaryImmediately: boolean;
  sendOnRelease: boolean;
  discreet: boolean;
  warnMinutes: number;
  nextRef: number;
  teamCode: string;
  alertPhones: string;
  /** Also WhatsApp the duty mobiles when the worker checks in safe. Off by default. */
  notifyOnCheckIn: boolean;
};

export type Fix = {
  lat: number;
  lng: number;
  accuracy: number | null;
  at: string;
};

export type Job = {
  id: string;
  ref: string;
  sample: boolean;
  workerName: string;
  site: string;
  address: string;
  client: string;
  note: string;
  startedAt: string;
  /** When the worker pressed Arrived; null while still travelling. */
  arrivedAt: string | null;
  /** Timer length chosen at start; used when the timer begins on arrival. */
  timerMinutes: number | null;
  dueAt: string | null;
  endedAt: string | null;
  status: "active" | "complete";
  outcome: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
};

export type AlertStatus = "open" | "acknowledged" | "resolved" | "false_alarm";

export type Alert = {
  id: string;
  sample: boolean;
  jobId: string | null;
  welfareId: string | null;
  kind: "red" | "timer";
  status: AlertStatus;
  workerName: string;
  site: string;
  address: string;
  note: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  triggeredAt: string;
  ackedAt: string | null;
  resolvedAt: string | null;
  resolverNote: string;
};

export type Welfare = {
  id: string;
  sample: boolean;
  jobId: string | null;
  note: string;
  startedAt: string;
  expiresAt: string;
  status: "running" | "checked_in" | "expired";
  lat: number | null;
  lng: number | null;
  /** True once the server holds this timer and will fire it itself. */
  onServer?: boolean;
};

export type AmberNote = {
  id: string;
  sample: boolean;
  jobId: string | null;
  text: string;
  createdAt: string;
  lat: number | null;
  lng: number | null;
  audioId: string | null;
};

export type AuditEvent = {
  id: string;
  sample: boolean;
  at: string;
  kind: string;
  summary: string;
  entityId: string | null;
};

export const defaultProfile: Profile = {
  organisation: "",
  workerName: "",
  whatsappNumber: "",
  whatsappGroupUrl: "",
  email: "",
  smsNumber: "",
  callNumber: "",
  primary: "whatsapp",
  openPrimaryImmediately: false,
  sendOnRelease: true,
  discreet: false,
  warnMinutes: 5,
  nextRef: 1,
  teamCode: "",
  alertPhones: "",
  notifyOnCheckIn: false,
};

export function uid(): string {
  return crypto.randomUUID();
}

export function normalizePhone(raw: string): string {
  let digits = raw.trim().replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^0\d{9,10}$/.test(digits)) digits = `44${digits.slice(1)}`;
  if (digits.length < 8 || digits.length > 15) return "";
  return digits;
}

export function safeGroupUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return null;
    if (url.hostname !== "chat.whatsapp.com" && url.hostname !== "wa.me") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function validEmailList(raw: string): string {
  const parts = raw
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter((part) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part));
  return parts.join(",");
}

export function dutyReady(profile: Profile): Array<"group" | "email"> {
  const ready: Array<"group" | "email"> = [];
  if (safeGroupUrl(profile.whatsappGroupUrl)) ready.push("group");
  if (validEmailList(profile.email)) ready.push("email");
  return ready;
}

export function readyChannels(profile: Profile): ChannelId[] {
  const channels: ChannelId[] = [];
  if (normalizePhone(profile.whatsappNumber)) channels.push("whatsapp");
  if (safeGroupUrl(profile.whatsappGroupUrl)) channels.push("group");
  if (validEmailList(profile.email)) channels.push("email");
  if (normalizePhone(profile.smsNumber)) channels.push("sms");
  if (normalizePhone(profile.callNumber)) channels.push("call");
  return channels;
}

export function channelLabel(channel: ChannelId): string {
  switch (channel) {
    case "whatsapp":
      return "WhatsApp";
    case "group":
      return "WhatsApp group";
    case "email":
      return "Email";
    case "sms":
      return "Text";
    case "call":
      return "Call";
  }
}

export function listPhrase(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`;
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatClock(now: number): string {
  return new Date(now).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRemain(ms: number): string {
  const sign = ms < 0 ? "−" : "";
  const total = Math.abs(Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${sign}${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${sign}${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function mapsHref(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null;
  return `https://maps.google.com/?q=${lat.toFixed(5)},${lng.toFixed(5)}`;
}

export const productName = "0-19 Lone Worker";

export function brandLabel(organisation: string | null | undefined): string {
  const name = (organisation ?? "").replace(/\s+/g, " ").trim();
  return name || productName;
}

export function buildMessage(input: {
  kind: "red" | "timer" | "test" | "log";
  organisation?: string;
  workerName: string;
  site: string;
  address: string;
  note: string;
  at: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
}): string {
  const brand = brandLabel(input.organisation);
  const title =
    input.kind === "red"
      ? `RED ALERT — ${brand}`
      : input.kind === "timer"
        ? `WELFARE TIMER EXPIRED — ${brand}`
        : input.kind === "test"
          ? `TEST — ${brand} (please ignore)`
          : `JOB LOG — ${brand}`;
  const where = mapsHref(input.lat, input.lng);
  const pin = where
    ? `Where: ${where}${input.accuracy != null ? ` (±${Math.round(input.accuracy)} m)` : ""}`
    : "Where: location unavailable";
  const place = [input.site, input.address].filter(Boolean).join(", ");
  return [
    title,
    `Worker: ${input.workerName.trim() || "Unnamed"}`,
    place ? `Job: ${place}` : null,
    `Time: ${formatWhen(input.at)}`,
    input.kind === "test" ? null : pin,
    input.note.trim() ? `Note: ${input.note.trim()}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export function whatsappHref(number: string, text: string): string | null {
  const digits = normalizePhone(number);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function smsHref(number: string, text: string, ios: boolean): string | null {
  const digits = normalizePhone(number);
  if (!digits) return null;
  const body = encodeURIComponent(text);
  return ios ? `sms:+${digits}&body=${body}` : `sms:+${digits}?body=${body}`;
}

export function mailHref(email: string, subject: string, body: string): string | null {
  const list = validEmailList(email);
  if (!list) return null;
  return `mailto:${list}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function telHref(number: string): string | null {
  const digits = normalizePhone(number);
  if (!digits) return null;
  return `tel:+${digits}`;
}

export function messageSubject(
  kind: Alert["kind"] | "test" | "log",
  organisation?: string,
): string {
  const brand = brandLabel(organisation);
  if (kind === "timer") return `WELFARE TIMER EXPIRED — ${brand}`;
  if (kind === "test") return `TEST — ${brand}`;
  if (kind === "log") return `${brand} job log`;
  return `RED ALERT — ${brand}`;
}

export type Slice = {
  jobs: Job[];
  alerts: Alert[];
  welfare: Welfare[];
  events: AuditEvent[];
};

export function expireDue(slice: Slice, now: number): {
  welfare: Welfare[];
  alerts: Alert[];
  events: AuditEvent[];
  changed: boolean;
} {
  const created: Alert[] = [];
  const events: AuditEvent[] = [];
  let changed = false;
  const welfare = slice.welfare.map((item) => {
    if (item.status !== "running") return item;
    if (new Date(item.expiresAt).getTime() > now) return item;
    changed = true;
    const already = slice.alerts.some(
      (alert) => alert.welfareId === item.id && alert.kind === "timer",
    );
    if (!already) {
      const job = slice.jobs.find((entry) => entry.id === item.jobId) ?? null;
      const alert: Alert = {
        id: uid(),
        sample: item.sample,
        jobId: item.jobId,
        welfareId: item.id,
        kind: "timer",
        status: "open",
        workerName: job?.workerName ?? "",
        site: job?.site ?? "",
        address: job?.address ?? "",
        note: item.note,
        lat: item.lat ?? job?.lat ?? null,
        lng: item.lng ?? job?.lng ?? null,
        accuracy: job?.accuracy ?? null,
        triggeredAt: new Date(now).toISOString(),
        ackedAt: null,
        resolvedAt: null,
        resolverNote: "",
      };
      created.push(alert);
      events.push({
        id: uid(),
        sample: item.sample,
        at: alert.triggeredAt,
        kind: "timer_expired",
        summary: `Welfare timer expired${job ? ` on ${job.ref}` : ""}${job?.site ? ` · ${job.site}` : ""}`,
        entityId: alert.id,
      });
    }
    return { ...item, status: "expired" as const };
  });
  if (!changed) {
    return { welfare: slice.welfare, alerts: slice.alerts, events: slice.events, changed: false };
  }
  return {
    welfare,
    alerts: [...created, ...slice.alerts],
    events: [...events, ...slice.events],
    changed: true,
  };
}

export function exampleShift(now: number): {
  jobs: Job[];
  alerts: Alert[];
  welfare: Welfare[];
  notes: AmberNote[];
  events: AuditEvent[];
} {
  const started = new Date(now - 26 * 60 * 60 * 1000).toISOString();
  const due = new Date(now - 25 * 60 * 60 * 1000).toISOString();
  const ended = new Date(now - 25 * 60 * 60 * 1000 + 4 * 60 * 1000).toISOString();
  const jobId = "sample-job-1";
  const alertId = "sample-alert-1";
  const welfareId = "sample-welfare-1";
  const noteId = "sample-note-1";
  const job: Job = {
    id: jobId,
    ref: "LW-1008",
    sample: true,
    workerName: "A. Khan",
    site: "Riverside Surgery",
    address: "14 Oak Street",
    client: "Night lock-up",
    note: "Alarm panel in reception. Leave by the side gate.",
    startedAt: started,
    arrivedAt: started,
    timerMinutes: 60,
    dueAt: due,
    endedAt: ended,
    status: "complete",
    outcome: "Site secure, alarm set",
    lat: 54.892,
    lng: -2.93,
    accuracy: 18,
  };
  const alert: Alert = {
    id: alertId,
    sample: true,
    jobId,
    welfareId: null,
    kind: "red",
    status: "resolved",
    workerName: job.workerName,
    site: job.site,
    address: job.address,
    note: "Dog loose in the car park. Stood off, then continued.",
    lat: job.lat,
    lng: job.lng,
    accuracy: 18,
    triggeredAt: new Date(now - 25.5 * 60 * 60 * 1000).toISOString(),
    ackedAt: new Date(now - 25.48 * 60 * 60 * 1000).toISOString(),
    resolvedAt: new Date(now - 25.4 * 60 * 60 * 1000).toISOString(),
    resolverNote: "Worker confirmed safe by WhatsApp.",
  };
  return {
    jobs: [job],
    alerts: [alert],
    welfare: [
      {
        id: welfareId,
        sample: true,
        jobId,
        note: job.note,
        startedAt: started,
        expiresAt: due,
        status: "checked_in",
        lat: job.lat,
        lng: job.lng,
      },
    ],
    notes: [
      {
        id: noteId,
        sample: true,
        jobId,
        text: "Side gate was open on arrival. Closed and bolted it.",
        createdAt: new Date(now - 25.7 * 60 * 60 * 1000).toISOString(),
        lat: job.lat,
        lng: job.lng,
        audioId: null,
      },
    ],
    events: [
      {
        id: "sample-event-1",
        sample: true,
        at: started,
        kind: "job_started",
        summary: "Started LW-1008 · Riverside Surgery",
        entityId: jobId,
      },
      {
        id: "sample-event-2",
        sample: true,
        at: alert.triggeredAt,
        kind: "red_alert",
        summary: "Red alert on LW-1008 · Riverside Surgery",
        entityId: alertId,
      },
      {
        id: "sample-event-3",
        sample: true,
        at: alert.ackedAt ?? alert.triggeredAt,
        kind: "alert_acked",
        summary: "Alert acknowledged",
        entityId: alertId,
      },
      {
        id: "sample-event-4",
        sample: true,
        at: alert.resolvedAt ?? ended,
        kind: "alert_resolved",
        summary: "Alert resolved · Worker confirmed safe by WhatsApp.",
        entityId: alertId,
      },
      {
        id: "sample-event-5",
        sample: true,
        at: ended,
        kind: "job_ended",
        summary: "Ended LW-1008 · Site secure, alarm set",
        entityId: jobId,
      },
    ],
  };
}
