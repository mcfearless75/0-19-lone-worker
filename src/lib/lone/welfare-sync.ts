import { deviceId, normalizeTeamCode } from "./board";
import { mapsHref, type Welfare } from "./model";
import { useLone } from "./store";
import { startTimer, updateTimer } from "./timers-api";

/**
 * Keeps the server's copy of each welfare timer in step with the phone, so the
 * server can raise the alarm if the phone can't. Every change to a running
 * timer (start, +15 min, I'm safe, end job) is sent; a start that fails (no
 * signal) is retried every 45 s until it lands.
 */
function register(item: Welfare): void {
  const state = useLone.getState();
  const job = state.jobs.find((entry) => entry.id === item.jobId);
  const fix = state.lastFix;
  const lat = fix?.lat ?? item.lat ?? job?.lat ?? null;
  const lng = fix?.lng ?? item.lng ?? job?.lng ?? null;
  void startTimer({
    data: {
      id: item.id,
      device: deviceId(),
      team: normalizeTeamCode(state.profile.teamCode ?? ""),
      name: state.profile.workerName,
      job: job?.site ?? "",
      note: [job?.address, item.note].filter(Boolean).join(". "),
      org: state.profile.organisation ?? "",
      where: mapsHref(lat, lng) ?? job?.address ?? "",
      phones: [state.profile.whatsappNumber, state.profile.alertPhones ?? ""].filter(Boolean).join(","),
      emails: state.profile.email,
      lat,
      lng,
      accuracy: fix?.accuracy ?? null,
      expiresAt: item.expiresAt,
    },
  })
    .then(() => useLone.getState().markWelfareOnServer(item.id))
    .catch(() => undefined);
}

function update(item: Welfare, expiresAt: string | null): void {
  void updateTimer({
    data: {
      id: item.id,
      device: deviceId(),
      status: item.status === "running" ? "running" : "checked_in",
      expiresAt,
    },
  }).catch(() => undefined);
}

export function startWelfareSync(): () => void {
  const unsubscribe = useLone.subscribe((state, prev) => {
    if (state.welfare === prev.welfare) return;
    const before = new Map(prev.welfare.map((item) => [item.id, item]));
    for (const item of state.welfare) {
      if (item.sample) continue;
      const old = before.get(item.id);
      if (!old) {
        if (item.status === "running") register(item);
        continue;
      }
      if (!item.onServer || item.duress) continue;
      if (old.status === "running" && item.status === "checked_in") update(item, null);
      else if (item.status === "running" && old.expiresAt !== item.expiresAt) update(item, item.expiresAt);
    }
  });
  const retry = window.setInterval(() => {
    for (const item of useLone.getState().welfare) {
      if (!item.sample && item.status === "running" && !item.onServer) register(item);
    }
  }, 45_000);
  return () => {
    unsubscribe();
    window.clearInterval(retry);
  };
}
