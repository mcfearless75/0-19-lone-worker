import { deviceId, normalizeTeamCode, type RaiseResult } from "./board";
import { clearBoardAlert, raiseBoardAlert } from "./board-api";
import { mapsHref, type Alert } from "./model";
import { useLone } from "./store";

export async function pushAlert(
  alert: Pick<Alert, "id" | "welfareId" | "kind" | "note" | "site" | "address" | "lat" | "lng">,
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
        alertId: alert.kind === "timer" ? alert.welfareId : alert.id,
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

/**
 * Duress: the worker entered the duress PIN. Nothing changes on the phone;
 * the board goes red and every contact is told not to phone them.
 */
export async function pushDuress(site: string): Promise<void> {
  const state = useLone.getState();
  const fix = state.lastFix;
  const job = state.jobs.find((entry) => entry.status === "active");
  const lat = fix?.lat ?? job?.lat ?? null;
  const lng = fix?.lng ?? job?.lng ?? null;
  const phones = [state.profile.whatsappNumber, state.profile.alertPhones ?? ""].filter(Boolean).join(",");
  await raiseBoardAlert({
    data: {
      team: normalizeTeamCode(state.profile.teamCode ?? ""),
      device: deviceId(),
      name: state.profile.workerName,
      job: site || job?.site || "",
      lat,
      lng,
      accuracy: fix?.accuracy ?? null,
      kind: "red",
      note: "DURESS CODE ENTERED. The worker may be under threat and has been made to say they are safe. Do NOT phone them. Send help to the location.",
      phones,
      emails: state.profile.email,
      org: state.profile.organisation ?? "",
      where: mapsHref(lat, lng) ?? (job?.address || "No location"),
      alertId: null,
    },
  }).catch(() => undefined);
}
