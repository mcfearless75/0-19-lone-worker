/**
 * What to do about a WhatsApp after Twilio reports its status. Twilio accepts
 * a message first and only later reports whether it was delivered, so this
 * runs from the server sweep a little after each send.
 */
export type Decision = "wait" | "done" | "sms";

/** A WhatsApp still not delivered after this long gets an SMS as well. */
export const UNDELIVERED_AFTER_MS = 10 * 60_000;
/** Stop checking after this long; Twilio will not change its mind. */
export const GIVE_UP_AFTER_MS = 60 * 60_000;
/** First check this long after sending; a failure usually lands within seconds. */
export const FIRST_CHECK_AFTER_MS = 10_000;

export function decide(status: string, ageMs: number): Decision {
  switch (status) {
    case "delivered":
    case "read":
      return "done";
    case "failed":
    case "undelivered":
      return "sms";
    default:
      // queued, accepted, sending, sent (left Twilio, not confirmed on the phone)
      if (ageMs >= GIVE_UP_AFTER_MS) return "done";
      return ageMs >= UNDELIVERED_AFTER_MS ? "sms" : "wait";
  }
}
