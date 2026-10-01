import {
  type Alert,
  type ChannelId,
  type Profile,
  buildMessage,
  dutyReady,
  mailHref,
  messageSubject,
  safeGroupUrl,
  smsHref,
  telHref,
  whatsappHref,
} from "./model";

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function alertText(profile: Profile, alert: Alert): string {
  return buildMessage({
    kind: alert.kind,
    organisation: profile.organisation,
    workerName: alert.workerName || profile.workerName,
    site: alert.site,
    address: alert.address,
    note: alert.note,
    at: alert.triggeredAt,
    lat: alert.lat,
    lng: alert.lng,
    accuracy: alert.accuracy,
  });
}

export function channelHref(
  profile: Profile,
  channel: ChannelId,
  text: string,
  kind: Alert["kind"] | "test" | "log",
): string | null {
  switch (channel) {
    case "whatsapp":
      return whatsappHref(profile.whatsappNumber, text);
    case "group":
      return safeGroupUrl(profile.whatsappGroupUrl);
    case "email":
      return mailHref(profile.email, messageSubject(kind, profile.organisation), text);
    case "sms":
      return smsHref(profile.smsNumber, text, isIos());
    case "call":
      return telHref(profile.callNumber);
  }
}

/** Open a route without awaiting clipboard first — that would drop the tap. */
export function launchChannel(href: string, channel: ChannelId, text: string): void {
  if (channel !== "call") {
    void navigator.clipboard?.writeText(text).catch(() => undefined);
  }
  if (channel === "call" || channel === "sms" || channel === "email") {
    window.location.href = href;
    return;
  }
  window.open(href, "_blank", "noopener,noreferrer");
}

function openInPlace(href: string): void {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/** Group and every alert email, from the same button press. Does not wait on the clipboard. */
export function launchDuty(
  profile: Profile,
  text: string,
  kind: Alert["kind"] | "test" | "log",
): Array<"group" | "email"> {
  const ready = dutyReady(profile);
  if (!ready.length) return [];
  void navigator.clipboard?.writeText(text).catch(() => undefined);
  if (ready.includes("group")) {
    const group = safeGroupUrl(profile.whatsappGroupUrl);
    if (group) openInPlace(group);
  }
  if (ready.includes("email")) {
    const mail = mailHref(profile.email, messageSubject(kind, profile.organisation), text);
    if (mail) openInPlace(mail);
  }
  return ready;
}
