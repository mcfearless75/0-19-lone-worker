import { getRequest } from "@tanstack/react-start/server";
import type { Sql } from "@/lib/db";
import type { RaiseBody, RaiseResult } from "./board";
import { brandLabel } from "./model";

/**
 * Server-side alert fan-out. Every duty mobile gets a WhatsApp template and
 * every alert email gets a plain email, all in parallel, the moment the
 * button is released. Nobody has to press send on the worker's phone.
 *
 * WhatsApp goes through Twilio when its credentials are set, otherwise Meta.
 *
 * Env (set in the host's settings, never in the repo):
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN     Twilio
 *   TWILIO_WHATSAPP_FROM                      e.g. +14155238886 (the sandbox number)
 *   TWILIO_SMS_FROM                           optional: SMS fallback when a WhatsApp fails
 *   WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID  Meta WhatsApp Cloud API
 *   WHATSAPP_TEMPLATE                         approved template, default lone_worker_alert
 *   RESEND_API_KEY, ALERT_EMAIL_FROM          Resend, e.g. "Lone Worker <alerts@yourdomain.co.uk>"
 */

const SEND_TIMEOUT_MS = 8_000;
const PER_DEVICE_PER_HOUR = 10;
const PER_IP_PER_HOUR = 30;

type Channel<S> = { status: S; count: number };

function env(key: string): string {
  return process.env[key]?.trim() ?? "";
}

function twilioConnected(): boolean {
  return Boolean(env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN") && env("TWILIO_WHATSAPP_FROM"));
}

function metaConnected(): boolean {
  return Boolean(env("WHATSAPP_TOKEN") && env("WHATSAPP_PHONE_NUMBER_ID"));
}

export function whatsappConnected(): boolean {
  return twilioConnected() || metaConnected();
}

/** "+44 7700…", "447700…" or "whatsapp:+44…" → "+447700…". */
function e164(number: string): string {
  return `+${number.replace(/^whatsapp:/, "").replace(/[^\d]/g, "")}`;
}

async function twilioSend(to: string, from: string, body: string): Promise<void> {
  const sid = env("TWILIO_ACCOUNT_SID");
  const auth = Buffer.from(`${sid}:${env("TWILIO_AUTH_TOKEN")}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text().catch(() => "")}`);
}

/** WhatsApp via Twilio, falling back to SMS for that number when TWILIO_SMS_FROM is set. */
async function twilioWhatsapp(to: string, text: string): Promise<void> {
  try {
    await twilioSend(`whatsapp:${e164(to)}`, `whatsapp:${e164(env("TWILIO_WHATSAPP_FROM"))}`, text);
  } catch (err) {
    const smsFrom = env("TWILIO_SMS_FROM");
    if (!smsFrom) throw err;
    console.error("[alert] Twilio WhatsApp failed, sending SMS instead:", String(err));
    await twilioSend(e164(to), e164(smsFrom), text);
  }
}

export function emailConnected(): boolean {
  return Boolean(env("RESEND_API_KEY") && env("ALERT_EMAIL_FROM"));
}

async function sendWhatsapp(
  phones: string[],
  params: { name: string; detail: string; where: string },
  text: string,
): Promise<Channel<RaiseResult["whatsapp"]>> {
  if (phones.length === 0) return { status: "no-numbers", count: 0 };
  if (!whatsappConnected()) return { status: "not-connected", count: 0 };
  const token = env("WHATSAPP_TOKEN");
  const phoneId = env("WHATSAPP_PHONE_NUMBER_ID");
  const template = env("WHATSAPP_TEMPLATE") || "lone_worker_alert";
  const viaTwilio = twilioConnected();
  const results = await Promise.allSettled(
    phones.map(async (to) => {
      if (viaTwilio) return twilioWhatsapp(to, text);
      const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: template,
            language: { code: "en" },
            components: [
              {
                type: "body",
                parameters: [
                  { type: "text", text: params.name },
                  { type: "text", text: params.detail },
                  { type: "text", text: params.where },
                ],
              },
            ],
          },
        }),
      });
      if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${await res.text().catch(() => "")}`);
    }),
  );
  const count = results.filter((r) => r.status === "fulfilled").length;
  results.forEach((r) => {
    if (r.status === "rejected") console.error("[alert] WhatsApp send failed:", String(r.reason));
  });
  return { status: count > 0 ? "sent" : "failed", count };
}

/** Email text is built here from the validated fields, never taken from the client. */
export function alertEmail(data: RaiseBody, at: string): { subject: string; text: string } {
  const brand = brandLabel(data.org);
  const title = data.kind === "timer" ? "WELFARE TIMER EXPIRED" : "RED ALERT";
  const text = [
    `${title} — ${brand}`,
    `Worker: ${data.name}`,
    data.job ? `Job: ${data.job}` : null,
    `Time: ${new Date(at).toLocaleString("en-GB", {
      timeZone: "Europe/London",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })}`,
    `Where: ${data.where}`,
    data.note ? `Note: ${data.note}` : null,
    "",
    "Call the worker now and follow your emergency procedure.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
  return { subject: `${title}: ${data.name} — ${brand}`, text };
}

async function sendEmails(
  emails: string[],
  message: { subject: string; text: string },
): Promise<Channel<NonNullable<RaiseResult["email"]>>> {
  if (emails.length === 0) return { status: "no-addresses", count: 0 };
  if (!emailConnected()) return { status: "not-connected", count: 0 };
  const key = env("RESEND_API_KEY");
  const from = env("ALERT_EMAIL_FROM");
  // One email per address so recipients never see each other's addresses.
  const results = await Promise.allSettled(
    emails.map(async (to) => {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        body: JSON.stringify({ from, to: [to], subject: message.subject, text: message.text }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text().catch(() => "")}`);
    }),
  );
  const count = results.filter((r) => r.status === "fulfilled").length;
  results.forEach((r) => {
    if (r.status === "rejected") console.error("[alert] email send failed:", String(r.reason));
  });
  return { status: count > 0 ? "sent" : "failed", count };
}

function clientIp(): string {
  try {
    const headers = getRequest().headers;
    const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    return (forwarded || headers.get("x-real-ip") || "").slice(0, 64);
  } catch {
    return "";
  }
}

/**
 * Anyone can call this endpoint, so cap sends per phone and per network to
 * stop it being used to spam numbers or run up the WhatsApp bill. A real
 * worker never gets near these limits. A database hiccup never blocks an alert.
 */
async function overLimit(sql: Sql, device: string, ip: string): Promise<boolean> {
  try {
    const [counts] = await sql<{ by_device: number; by_ip: number }>`
      select
        count(*) filter (where device = ${device}) as by_device,
        count(*) filter (where ${ip} <> '' and ip = ${ip}) as by_ip
      from alert_sends
      where at > now() - interval '1 hour'
    `;
    if ((counts?.by_device ?? 0) >= PER_DEVICE_PER_HOUR) return true;
    if ((counts?.by_ip ?? 0) >= PER_IP_PER_HOUR) return true;
    await sql`insert into alert_sends (device, ip) values (${device}, ${ip})`;
    await sql`delete from alert_sends where at < now() - interval '1 day'`;
    return false;
  } catch (err) {
    console.error("[alert] rate-limit check failed, sending anyway:", String(err));
    return false;
  }
}

export async function notifyEveryone(
  sql: Sql,
  data: RaiseBody,
): Promise<Pick<RaiseResult, "whatsapp" | "sentTo" | "email" | "emailedTo">> {
  if (await overLimit(sql, data.device, clientIp())) {
    console.error(`[alert] rate limit hit for device ${data.device}`);
    return { whatsapp: "failed", sentTo: 0, email: "failed", emailedTo: 0 };
  }
  const detail = [data.job, data.note].filter(Boolean).join(". ") || "No further detail";
  const message = alertEmail(data, new Date().toISOString());
  const [wa, mail] = await Promise.all([
    sendWhatsapp(data.phones, { name: data.name, detail, where: data.where }, message.text),
    sendEmails(data.emails, message),
  ]);
  console.log(
    `[alert] ${data.kind}: whatsapp ${wa.status} ${wa.count}/${data.phones.length}` +
      ` via ${twilioConnected() ? "twilio" : "meta"}, email ${mail.status} ${mail.count}/${data.emails.length}`,
  );
  return { whatsapp: wa.status, sentTo: wa.count, email: mail.status, emailedTo: mail.count };
}
