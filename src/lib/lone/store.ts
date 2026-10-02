import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  type Alert,
  type AmberNote,
  type AuditEvent,
  type Fix,
  type Job,
  type Profile,
  type Welfare,
  defaultProfile,
  exampleShift,
  expireDue,
  uid,
} from "./model";

type LoneState = {
  hydrated: boolean;
  profile: Profile;
  jobs: Job[];
  alerts: Alert[];
  welfare: Welfare[];
  notes: AmberNote[];
  events: AuditEvent[];
  lastFix: Fix | null;
  setProfile: (patch: Partial<Profile>) => void;
  setFix: (fix: Fix | null) => void;
  startJob: (input: {
    site: string;
    address: string;
    client: string;
    note: string;
    minutes: number | null;
    /** Start the welfare timer when the worker presses Arrived, not now. */
    onArrival?: boolean;
    lat?: number | null;
    lng?: number | null;
  }) => Job;
  endJob: (jobId: string, outcome: string) => void;
  /** Worker has arrived: start the welfare timer now (jobs started "timer on arrival"). */
  arrive: (jobId: string) => void;
  extendWelfare: (jobId: string, minutes: number) => void;
  checkIn: (jobId: string, duress?: boolean) => void;
  markWelfareOnServer: (welfareId: string) => void;
  addNote: (input: { text: string; audioId: string | null }) => AmberNote;
  triggerRed: () => Alert;
  updateAlertNote: (alertId: string, note: string) => void;
  acknowledge: (alertId: string) => void;
  resolveAlert: (alertId: string, resolverNote: string) => void;
  falseAlarm: (alertId: string, reason: string) => void;
  markSafe: (alertId: string) => void;
  recordSend: (alertId: string, label: string) => void;
  loadExample: () => void;
  clearExample: () => void;
  sweep: () => Alert | null;
};

function event(
  summary: string,
  kind: string,
  entityId: string | null,
  sample = false,
): AuditEvent {
  return { id: uid(), sample, at: new Date().toISOString(), kind, summary, entityId };
}

function activeJob(jobs: Job[]): Job | null {
  return jobs.find((job) => job.status === "active") ?? null;
}

function runningWelfare(welfare: Welfare[], jobId: string | null): Welfare | null {
  return (
    welfare.find((item) => item.status === "running" && (jobId == null || item.jobId === jobId)) ??
    null
  );
}

export const loneStorageKey = "lone-worker";
const legacyStorageKey = "copeland-lone-worker";

export function migrateLoneStorage(): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (localStorage.getItem(loneStorageKey) == null) {
      const old = localStorage.getItem(legacyStorageKey);
      if (old != null) localStorage.setItem(loneStorageKey, old);
    }
    localStorage.removeItem(legacyStorageKey);
  } catch {
    /* storage blocked */
  }
}

export const useLone = create<LoneState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      profile: defaultProfile,
      jobs: [],
      alerts: [],
      welfare: [],
      notes: [],
      events: [],
      lastFix: null,

      setProfile: (patch) => set((state) => ({ profile: { ...state.profile, ...patch } })),

      setFix: (fix) => set({ lastFix: fix }),

      startJob: (input) => {
        const current = activeJob(get().jobs);
        if (current) get().endJob(current.id, "Replaced by a new job");
        const profile = get().profile;
        const ref = `LW-${String(profile.nextRef).padStart(4, "0")}`;
        const now = new Date().toISOString();
        const fix = get().lastFix;
        const minutes = input.minutes != null && input.minutes > 0 ? input.minutes : null;
        const onArrival = Boolean(input.onArrival && minutes);
        const job: Job = {
          id: uid(),
          ref,
          sample: false,
          workerName: profile.workerName.trim(),
          site: input.site.trim(),
          address: input.address.trim(),
          client: input.client.trim(),
          note: input.note.trim(),
          startedAt: now,
          arrivedAt: onArrival ? null : now,
          timerMinutes: minutes,
          dueAt: minutes && !onArrival ? new Date(Date.now() + minutes * 60_000).toISOString() : null,
          endedAt: null,
          status: "active",
          outcome: "",
          lat: fix?.lat ?? input.lat ?? null,
          lng: fix?.lng ?? input.lng ?? null,
          accuracy: fix?.accuracy ?? null,
        };
        const welfare: Welfare | null =
          job.dueAt == null
            ? null
            : {
                id: uid(),
                sample: false,
                jobId: job.id,
                note: job.note,
                startedAt: now,
                expiresAt: job.dueAt,
                status: "running",
                lat: job.lat,
                lng: job.lng,
              };
        set((prev) => ({
          profile: { ...prev.profile, nextRef: prev.profile.nextRef + 1 },
          jobs: [job, ...prev.jobs],
          welfare: welfare ? [welfare, ...prev.welfare] : prev.welfare,
          events: [
            event(
              `Started ${job.ref} · ${job.site}${
                job.dueAt
                  ? ` · due ${new Date(job.dueAt).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : onArrival
                    ? ` · ${minutes} min timer starts on arrival`
                    : ""
              }`,
              "job_started",
              job.id,
            ),
            ...prev.events,
          ],
        }));
        return job;
      },

      arrive: (jobId) => {
        const now = new Date().toISOString();
        set((state) => {
          const job = state.jobs.find((entry) => entry.id === jobId);
          if (!job || job.status !== "active" || job.arrivedAt !== null) return state;
          const dueAt = job.timerMinutes ? new Date(Date.now() + job.timerMinutes * 60_000).toISOString() : null;
          const fix = state.lastFix;
          const welfare: Welfare | null = dueAt
            ? {
                id: uid(),
                sample: false,
                jobId: job.id,
                note: job.note,
                startedAt: now,
                expiresAt: dueAt,
                status: "running",
                lat: fix?.lat ?? job.lat,
                lng: fix?.lng ?? job.lng,
              }
            : null;
          return {
            jobs: state.jobs.map((entry) =>
              entry.id === jobId
                ? { ...entry, arrivedAt: now, dueAt, lat: fix?.lat ?? entry.lat, lng: fix?.lng ?? entry.lng }
                : entry,
            ),
            welfare: welfare ? [welfare, ...state.welfare] : state.welfare,
            events: [
              event(
                `Arrived at ${job.site}${dueAt ? ` · due ${new Date(dueAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}`,
                "arrived",
                job.id,
              ),
              ...state.events,
            ],
          };
        });
      },

      endJob: (jobId, outcome) => {
        const now = new Date().toISOString();
        set((state) => {
          const job = state.jobs.find((entry) => entry.id === jobId);
          if (!job || job.status !== "active") return state;
          return {
            jobs: state.jobs.map((entry) =>
              entry.id === jobId
                ? { ...entry, status: "complete" as const, endedAt: now, outcome: outcome.trim() }
                : entry,
            ),
            welfare: state.welfare.map((item) =>
              item.jobId === jobId && item.status === "running"
                ? { ...item, status: "checked_in" as const }
                : item,
            ),
            events: [
              event(`Ended ${job.ref} · ${outcome.trim() || "Completed"}`, "job_ended", jobId),
              ...state.events,
            ],
          };
        });
      },

      extendWelfare: (jobId, minutes) => {
        set((state) => {
          const item = runningWelfare(state.welfare, jobId);
          const job = state.jobs.find((entry) => entry.id === jobId);
          if (!item || !job) return state;
          const expiresAt = new Date(
            Math.max(Date.now(), new Date(item.expiresAt).getTime()) + minutes * 60_000,
          ).toISOString();
          return {
            welfare: state.welfare.map((entry) =>
              entry.id === item.id ? { ...entry, expiresAt } : entry,
            ),
            jobs: state.jobs.map((entry) =>
              entry.id === jobId ? { ...entry, dueAt: expiresAt } : entry,
            ),
            events: [
              event(`Extended ${job.ref} by ${minutes} min`, "timer_extended", item.id),
              ...state.events,
            ],
          };
        });
      },

      checkIn: (jobId, duress = false) => {
        set((state) => {
          const item = runningWelfare(state.welfare, jobId);
          const job = state.jobs.find((entry) => entry.id === jobId);
          if (!item || !job) return state;
          return {
            welfare: state.welfare.map((entry) =>
              entry.id === item.id ? { ...entry, status: "checked_in" as const, ...(duress ? { duress: true } : {}) } : entry,
            ),
            events: [event(`Checked in on ${job.ref}`, "checked_in", item.id), ...state.events],
          };
        });
      },

      markWelfareOnServer: (welfareId) => {
        set((state) => ({
          welfare: state.welfare.map((entry) =>
            entry.id === welfareId ? { ...entry, onServer: true } : entry,
          ),
        }));
      },

      addNote: (input) => {
        const state = get();
        const job = activeJob(state.jobs);
        const fix = state.lastFix;
        const note: AmberNote = {
          id: uid(),
          sample: false,
          jobId: job?.id ?? null,
          text: input.text.trim(),
          createdAt: new Date().toISOString(),
          lat: fix?.lat ?? null,
          lng: fix?.lng ?? null,
          audioId: input.audioId,
        };
        set((prev) => ({
          notes: [note, ...prev.notes],
          events: [
            event(
              `Amber note${job ? ` on ${job.ref}` : ""}${note.text ? ` · ${note.text.slice(0, 80)}` : ""}`,
              "note_saved",
              note.id,
            ),
            ...prev.events,
          ],
        }));
        return note;
      },

      triggerRed: () => {
        const state = get();
        const job = activeJob(state.jobs);
        const fix = state.lastFix;
        const alert: Alert = {
          id: uid(),
          sample: false,
          jobId: job?.id ?? null,
          welfareId: null,
          kind: "red",
          status: "open",
          workerName: state.profile.workerName.trim() || job?.workerName || "",
          site: job?.site ?? "",
          address: job?.address ?? "",
          note: job?.note ?? "",
          lat: fix?.lat ?? job?.lat ?? null,
          lng: fix?.lng ?? job?.lng ?? null,
          accuracy: fix?.accuracy ?? job?.accuracy ?? null,
          triggeredAt: new Date().toISOString(),
          ackedAt: null,
          resolvedAt: null,
          resolverNote: "",
        };
        set((prev) => ({
          alerts: [alert, ...prev.alerts],
          events: [
            event(
              `Red alert${job ? ` on ${job.ref}` : ""}${job?.site ? ` · ${job.site}` : ""}`,
              "red_alert",
              alert.id,
            ),
            ...prev.events,
          ],
        }));
        return alert;
      },

      updateAlertNote: (alertId, note) => {
        set((state) => ({
          alerts: state.alerts.map((alert) => (alert.id === alertId ? { ...alert, note } : alert)),
        }));
      },

      acknowledge: (alertId) => {
        const target = get().alerts.find((alert) => alert.id === alertId);
        if (!target || target.status !== "open") return;
        const now = new Date().toISOString();
        set((state) => ({
          alerts: state.alerts.map((alert) =>
            alert.id === alertId
              ? { ...alert, status: "acknowledged" as const, ackedAt: now }
              : alert,
          ),
          events: [event("Alert acknowledged", "alert_acked", alertId), ...state.events],
        }));
      },

      resolveAlert: (alertId, resolverNote) => {
        const target = get().alerts.find((alert) => alert.id === alertId);
        if (!target || target.status === "resolved" || target.status === "false_alarm") return;
        const now = new Date().toISOString();
        set((state) => ({
          alerts: state.alerts.map((alert) =>
            alert.id === alertId
              ? {
                  ...alert,
                  status: "resolved" as const,
                  resolvedAt: now,
                  ackedAt: alert.ackedAt ?? now,
                  resolverNote: resolverNote.trim(),
                }
              : alert,
          ),
          events: [
            event(
              `Alert resolved${resolverNote.trim() ? ` · ${resolverNote.trim()}` : ""}`,
              "alert_resolved",
              alertId,
            ),
            ...state.events,
          ],
        }));
      },

      falseAlarm: (alertId, reason) => {
        const target = get().alerts.find((alert) => alert.id === alertId);
        if (!target || target.status === "false_alarm") return;
        const now = new Date().toISOString();
        set((state) => ({
          alerts: state.alerts.map((alert) =>
            alert.id === alertId
              ? {
                  ...alert,
                  status: "false_alarm" as const,
                  resolvedAt: now,
                  resolverNote: reason.trim(),
                }
              : alert,
          ),
          events: [
            event(`False alarm · ${reason.trim() || "No reason given"}`, "false_alarm", alertId),
            ...state.events,
          ],
        }));
      },

      markSafe: (alertId) => {
        const alert = get().alerts.find((entry) => entry.id === alertId);
        get().resolveAlert(alertId, "Worker checked in safe");
        if (alert?.jobId) {
          const welfare = get().welfare.find(
            (item) => item.jobId === alert.jobId && item.status === "running",
          );
          if (welfare) get().checkIn(alert.jobId);
        }
      },

      recordSend: (alertId, label) => {
        set((state) => ({
          events: [event(`Sent onward · ${label}`, "channels_opened", alertId), ...state.events],
        }));
      },

      loadExample: () => {
        const sample = exampleShift(Date.now());
        set((state) => ({
          jobs: [...sample.jobs, ...state.jobs.filter((job) => !job.sample)],
          alerts: [...sample.alerts, ...state.alerts.filter((alert) => !alert.sample)],
          welfare: [...sample.welfare, ...state.welfare.filter((item) => !item.sample)],
          notes: [...sample.notes, ...state.notes.filter((note) => !note.sample)],
          events: [...sample.events, ...state.events.filter((entry) => !entry.sample)],
        }));
      },

      clearExample: () => {
        set((state) => ({
          jobs: state.jobs.filter((job) => !job.sample),
          alerts: state.alerts.filter((alert) => !alert.sample),
          welfare: state.welfare.filter((item) => !item.sample),
          notes: state.notes.filter((note) => !note.sample),
          events: state.events.filter((entry) => !entry.sample),
        }));
      },

      sweep: () => {
        const state = get();
        const next = expireDue(state, Date.now());
        if (!next.changed) return null;
        set({ welfare: next.welfare, alerts: next.alerts, events: next.events });
        return (
          next.alerts.find((alert) => alert.kind === "timer" && alert.status === "open") ?? null
        );
      },
    }),
    {
      name: loneStorageKey,
      skipHydration: true,
      partialize: (state) => ({
        profile: state.profile,
        jobs: state.jobs,
        alerts: state.alerts,
        welfare: state.welfare,
        notes: state.notes,
        events: state.events,
        lastFix: state.lastFix,
      }),
    },
  ),
);

export function openRedAlert(alerts: Alert[]): Alert | null {
  return alerts.find((alert) => alert.kind === "red" && (alert.status === "open" || alert.status === "acknowledged")) ?? null;
}
