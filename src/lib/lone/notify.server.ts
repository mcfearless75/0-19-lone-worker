import { getRequest } from "@tanstack/react-start/server";
import type { Sql } from "@/lib/db";
import type { RaiseBody, RaiseResult } from "./board";
import { brandLabel } from "./model";
import { nearestPostcodes } from "./postcodes.server";

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
 *   TWILIO_SMS_FROM                           optional: SMS fallback when a WhatsApp fails,
 *                                             at send time or later (see delivery.server.ts)
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

function twilioAuth(): { sid: string; header: string } {
  const sid = env("TWILIO_ACCOUNT_SID");
  return { sid, header: `Basic ${Buffer.from(`${sid}:${env("TWILIO_AUTH_TOKEN")}`).toString("base64")}` };
}

/** Send one message through Twilio; returns Twilio's message SID. */
async function twilioSend(to: string, from: string, body: string): Promise<string> {
  const { sid, header } = twilioAuth();
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { authorization: header, "content-type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text().catch(() => "")}`);
  const data = (await res.json().catch(() => ({}))) as { sid?: string };
  return data.sid ?? "";
}

/** Twilio's current view of a message: delivered, read, sent, failed, undelivered… */
export async function twilioStatus(messageSid: string): Promise<{ status: string; errorCode: string | null }> {
  const { sid, header } = twilioAuth();
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages/${messageSid}.json`, {
    headers: { authorization: header },
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}`);
  const data = (await res.json()) as { status?: string; error_code?: number | string | null };
  return { status: String(data.status ?? "unknown"), errorCode: data.error_code == null ? null : String(data.error_code) };
}

/** SMS the same text to a number whose WhatsApp did not arrive. False when no SMS number is set. */
export async function twilioSmsFallback(to: string, text: string): Promise<boolean> {
  const smsFrom = env("TWILIO_SMS_FROM");
  if (!smsFrom) return false;
  await twilioSend(e164(to), e164(smsFrom), text);
  return true;
}

/**
 * WhatsApp via Twilio. Rejected outright → SMS now. Accepted → remembered in
 * wa_sends so the sweep can SMS later if Twilio reports it never arrived.
 */
async function twilioWhatsapp(sql: Sql, to: string, text: string): Promise<void> {
  let messageSid: string;
  try {
    messageSid = await twilioSend(`whatsapp:${e164(to)}`, `whatsapp:${e164(env("TWILIO_WHATSAPP_FROM"))}`, text);
  } catch (err) {
    console.error("[alert] Twilio WhatsApp rejected, sending SMS instead:", String(err));
    if (!(await twilioSmsFallback(to, text))) throw err;
    return;
  }
  if (!messageSid) return;
  try {
    await sql`insert into wa_sends (sid, to_number, body) values (${messageSid}, ${e164(to)}, ${text})`;
  } catch (err) {
    console.error("[alert] could not record WhatsApp for delivery check:", String(err));
  }
}

export function emailConnected(): boolean {
  return Boolean(env("RESEND_API_KEY") && env("ALERT_EMAIL_FROM"));
}

async function sendWhatsapp(
  sql: Sql,
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
      if (viaTwilio) return twilioWhatsapp(sql, to, text);
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

export type RecentNote = { note: string; at: string; hasAudio: boolean };

function londonTime(iso: string, withDay = true): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    ...(withDay ? { day: "2-digit", month: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Email text is built here from the validated fields, never taken from the client. */
export function alertEmail(
  data: RaiseBody,
  at: string,
  gpsPostcode: string | null = null,
  notes: RecentNote[] = [],
): { subject: string; text: string } {
  const brand = brandLabel(data.org);
  const title = data.kind === "timer" ? "WELFARE TIMER EXPIRED" : "RED ALERT";
  const text = [
    `${title} — ${brand}`,
    `Worker: ${data.name}`,
    data.job ? `Job: ${data.job}` : null,
    `Time: ${londonTime(at)}`,
    `Where: ${data.where}`,
    gpsPostcode ? `Nearest postcode (from GPS): ${gpsPostcode}` : null,
    data.note ? `Note: ${data.note}` : null,
    ...(notes.length
      ? [
          "",
          "Amber notes before this alert:",
          ...notes.map(
            (n) =>
              `- ${londonTime(n.at, false)}: ${n.note || "(voice only)"}${n.hasAudio ? " [voice note attached to the alert email]" : ""}`,
          ),
        ]
      : []),
    "",
    "Call the worker now and follow your emergency procedure.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
  return { subject: `${title}: ${data.name} — ${brand}`, text };
}

type Attachment = { filename: string; content: string };

async function sendEmails(
  emails: string[],
  message: { subject: string; text: string },
  attachments: Attachment[] = [],
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
        body: JSON.stringify({
          from,
          to: [to],
          subject: message.subject,
          text: message.text,
          ...(attachments.length ? { attachments } : {}),
        }),
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

/**
 * A short plain message to the duty mobiles (e.g. "checked in safe"). Via
 * Twilio when configured, else Meta's template is not suitable, so it is
 * skipped. Returns how many numbers accepted it.
 */
export async function sendTeamNote(sql: Sql, phones: string[], text: string): Promise<number> {
  if (!twilioConnected()) return 0;
  const results = await Promise.allSettled(phones.map((to) => twilioWhatsapp(sql, to, text)));
  results.forEach((r) => {
    if (r.status === "rejected") console.error("[team-note] send failed:", String(r.reason));
  });
  return results.filter((r) => r.status === "fulfilled").length;
}

/** A plain email to several addresses (used for the test message). Returns how many were accepted. */
export async function sendPlainEmail(emails: string[], subject: string, text: string): Promise<number> {
  const r = await sendEmails(emails, { subject, text });
  return r.count;
}

type StoredNote = { note: string; at: string; audio: string | null; mime: string };

/** This worker's amber notes from the last 12 hours (newest 3). Never blocks an alert. */
async function recentNotes(sql: Sql, device: string): Promise<StoredNote[]> {
  try {
    const rows = await sql<{ note: string; created_at: string | Date; audio: Uint8Array | null; mime: string }>`
      select note, created_at, audio, mime from amber_notes
      where device = ${device} and created_at > now() - interval '12 hours'
      order by created_at desc
      limit 3
    `;
    return rows.map((r) => ({
      note: r.note,
      at: new Date(r.created_at).toISOString(),
      audio: r.audio ? Buffer.from(r.audio).toString("base64") : null,
      mime: r.mime,
    }));
  } catch (err) {
    console.error("[alert] could not load amber notes:", String(err));
    return [];
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
  // Official postcode for the live GPS fix. Capped at 1.5 s: an alert never waits longer.
  const [gpsPostcode] =
    data.lat != null && data.lng != null
      ? await nearestPostcodes([{ lat: data.lat, lng: data.lng }], 1_500)
      : [null];
  const notes = await recentNotes(sql, data.device);
  const message = alertEmail(
    data,
    new Date().toISOString(),
    gpsPostcode,
    notes.map((n) => ({ note: n.note, at: n.at, hasAudio: n.audio != null })),
  );
  const attachments = notes
    .filter((n) => n.audio)
    .map((n) => ({
      filename: `voice-note-${londonTime(n.at, false).replace(":", "")}.${n.mime.includes("mp4") ? "m4a" : "webm"}`,
      content: n.audio as string,
    }));
  const where = gpsPostcode ? `${data.where} (${gpsPostcode})` : data.where;
  const [wa, mail] = await Promise.all([
    sendWhatsapp(sql, data.phones, { name: data.name, detail, where }, message.text),
    sendEmails(data.emails, message, attachments),
  ]);
  console.log(
    `[alert] ${data.kind}: whatsapp ${wa.status} ${wa.count}/${data.phones.length}` +
      ` via ${twilioConnected() ? "twilio" : "meta"}, email ${mail.status} ${mail.count}/${data.emails.length}`,
  );
  return { whatsapp: wa.status, sentTo: wa.count, email: mail.status, emailedTo: mail.count };
}
