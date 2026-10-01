import { deviceId, normalizeTeamCode, type RaiseResult } from "./board";
import { clearBoardAlert, raiseBoardAlert } from "./board-api";
import { mapsHref, type Alert } from "./model";
import { useLone } from "./store";

export async function pushAlert(
  alert: Pick<Alert, "kind" | "note" | "site" | "address" | "lat" | "lng">,
): Promise<RaiseResult> {
  const state = useLone.getState();
  const fix = state.lastFix;
  const job = state.jobs.find((entry) => entry.status === "active");
  const lat = fix?.lat ?? alert.lat ?? job?.lat ?? null;
  const lng = fix?.lng ?? alert.lng ?? job?.lng ?? null;
  const address = alert.address || job?.address || "";
  const phones = [state.profile.whatsappNumber, state.profile.alertPhones ?? ""].filter(Boolean).join(",");
  try {
    return await raiseBoardAlert({
      data: {
        team: normalizeTeamCode(state.profile.teamCode ?? ""),
        device: deviceId(),
        name: state.profile.workerName,
        job: alert.site || job?.site || "",
        lat,
        lng,
        accuracy: fix?.accuracy ?? job?.accuracy ?? null,
        kind: alert.kind === "timer" ? "timer" : "red",
        note: [address, alert.note || job?.note || ""].filter(Boolean).join(". "),
        phones,
        emails: state.profile.email,
        org: state.profile.organisation ?? "",
        where: mapsHref(lat, lng) ?? (address || "No location"),
      },
    });
  } catch {
    return { board: false, whatsapp: "failed", sentTo: 0, email: "failed", emailedTo: 0 };
  }
}

export async function standDownBoard(): Promise<void> {
  const state = useLone.getState();
  const team = normalizeTeamCode(state.profile.teamCode ?? "");
  if (!/^[A-Z0-9]{4,8}$/.test(team)) return;
  const stillOpen = state.alerts.some(
    (alert) =>
      (alert.kind === "red" || alert.kind === "timer") &&
      (alert.status === "open" || alert.status === "acknowledged"),
  );
  if (stillOpen) return;
  await clearBoardAlert({
    data: {
      team,
      device: deviceId(),
      name: state.profile.workerName,
      job: "",
      lat: null,
      lng: null,
      accuracy: null,
    },
  }).catch(() => undefined);
}
