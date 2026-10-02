import { createServerFn } from "@tanstack/react-start";
import { normalizePhone, validEmailList } from "./model";

/**
 * "Send a test to everyone": a clearly-labelled test WhatsApp and email to
 * the duty mobiles and alert emails, so a worker can see it all works
 * before they need it. Nothing goes on the Board. 5 per phone per hour.
 */
export const sendTestAlert = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const raw = (input ?? {}) as { device?: string; name?: string; org?: string; phones?: string; emails?: string };
    const device = String(raw.device ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(device)) throw new Error("This phone could not be identified.");
    const phones = [...new Set(String(raw.phones ?? "").split(/[,;\n]+/).map(normalizePhone).filter(Boolean))].slice(0, 8);
    const emails = [...new Set(validEmailList(String(raw.emails ?? "")).toLowerCase().split(",").filter(Boolean))].slice(0, 8);
    if (phones.length === 0 && emails.length === 0) throw new Error("Add at least one duty mobile or alert email first.");
    return {
      device,
      name: String(raw.name ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || "Unnamed",
      org: String(raw.org ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
      phones,
      emails,
    };
  })
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const { sendTeamNote, sendPlainEmail, whatsappConnected, emailConnected } = await import("./notify.server");
    const sql = await getSql();
    const [recent] = await sql<{ n: number }>`
      select count(*) as n from alert_sends where device = ${data.device} and ip = 'test' and at > now() - interval '1 hour'
    `;
    if ((recent?.n ?? 0) >= 5) throw new Error("You have sent 5 tests this hour. Try again later.");
    await sql`insert into alert_sends (device, ip) values (${data.device}, 'test')`;
    const brand = data.org || "0-19 Lone Worker";
    const text = `TEST from ${brand}: this is a test of the lone worker alerts for ${data.name}. If you can read this, you will get their real alerts. No action needed.`;
    const [whatsapp, email] = await Promise.all([
      whatsappConnected() ? sendTeamNote(sql, data.phones, text) : Promise.resolve(-1),
      emailConnected() ? sendPlainEmail(data.emails, `TEST: ${brand} lone worker alerts`, text) : Promise.resolve(-1),
    ]);
    return { whatsapp, phones: data.phones.length, email, emails: data.emails.length };
  });
