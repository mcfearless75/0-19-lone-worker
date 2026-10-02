import { deviceId, normalizeTeamCode } from "./board";
import { announceCheckIn, syncVisit } from "./board-api";
import type { Job, Welfare } from "./model";
import { useLone } from "./store";
import type { VisitFields } from "./visits";

/** What the Board should show for this phone right now. */
export function currentVisit(jobs: Job[], welfare: Welfare[]): VisitFields {
  const job = jobs.find((entry) => entry.status === "active");
  if (!job) return { visitState: "", visitStartedAt: null, dueAt: null, checkedInAt: null };
  const running = welfare.find((item) => item.jobId === job.id && item.status === "running");
  const checked = welfare.find((item) => item.jobId === job.id && item.status === "checked_in" && !item.duress);
  if (job.arrivedAt === null) return { visitState: "travelling", visitStartedAt: job.startedAt, dueAt: null, checkedInAt: null };
  if (running) {
    const overdue = new Date(running.expiresAt).getTime() < Date.now();
    return { visitState: overdue ? "overdue" : "on_visit", visitStartedAt: job.arrivedAt, dueAt: running.expiresAt, checkedInAt: null };
  }
  if (checked) return { visitState: "checked_in", visitStartedAt: job.arrivedAt, dueAt: null, checkedInAt: checkedInAt(checked) };
  return { visitState: "on_visit", visitStartedAt: job.arrivedAt, dueAt: job.dueAt, checkedInAt: null };
}

const checkInTimes = new Map<string, string>();
function checkedInAt(item: Welfare): string {
  const known = checkInTimes.get(item.id);
  if (known) return known;
  const now = new Date().toISOString();
  checkInTimes.set(item.id, now);
  return now;
}

function record(job: Job): void {
  const state = useLone.getState();
  const checked = state.welfare.find((item) => item.jobId === job.id && item.status === "checked_in");
  void syncVisit({
    data: {
      id: job.id,
      device: deviceId(),
      team: normalizeTeamCode(state.profile.teamCode ?? ""),
      name: job.workerName || state.profile.workerName,
      site: job.site,
      address: job.address,
      startedAt: job.startedAt,
      arrivedAt: job.arrivedAt,
      dueAt: job.dueAt,
      checkedInAt: checked ? checkedInAt(checked) : null,
      endedAt: job.endedAt,
      outcome: job.outcome,
    },
  }).catch(() => undefined);
}

/**
 * Every change to the active job or its timer is written to the team's visit
 * history on the server, and a check-in optionally tells the duty mobiles.
 */
export function startVisitSync(): () => void {
  return useLone.subscribe((state, prev) => {
    if (state.jobs === prev.jobs && state.welfare === prev.welfare) return;
    const before = new Map(prev.jobs.map((job) => [job.id, job]));
    for (const job of state.jobs) {
      if (job.sample) continue;
      const old = before.get(job.id);
      const welfareChanged =
        state.welfare !== prev.welfare &&
        state.welfare.some((item) => item.jobId === job.id && item !== prev.welfare.find((p) => p.id === item.id));
      if (old && old === job && !welfareChanged) continue;
      record(job);
    }
    if (state.welfare === prev.welfare) return;
    const prevById = new Map(prev.welfare.map((item) => [item.id, item]));
    for (const item of state.welfare) {
      const old = prevById.get(item.id);
      if (!old || old.status !== "running" || item.status !== "checked_in" || item.sample || item.duress) continue;
      if (!state.profile.notifyOnCheckIn) continue;
      const job = state.jobs.find((entry) => entry.id === item.jobId);
      void announceCheckIn({
        data: {
          device: deviceId(),
          name: state.profile.workerName,
          site: job?.site ?? "",
          org: state.profile.organisation ?? "",
          phones: [state.profile.whatsappNumber, state.profile.alertPhones ?? ""].filter(Boolean).join(","),
        },
      }).catch(() => undefined);
    }
  });
}
