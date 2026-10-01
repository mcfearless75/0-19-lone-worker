import assert from "node:assert/strict";
import test from "node:test";
import { ageLabel, normalizeTeamCode, parsePublish, parseRaise, raisedLabel, validTeamCode } from "./board.ts";

test("a board code is short and readable", () => {
  assert.equal(normalizeTeamCode(" ab-12 "), "AB12");
  assert.equal(validTeamCode("AB12"), true);
  assert.equal(validTeamCode("AB"), false);
  assert.equal(normalizeTeamCode("too-long-code-please"), "TOOLONGC");
  assert.equal(validTeamCode("TOOLONGC"), true);
});

test("a publish keeps one pin and drops a bad location", () => {
  const body = parsePublish({
    team: "duty1",
    device: "11111111-1111-1111-1111-111111111111",
    name: "  Sam   ",
    job: "Clinic",
    lat: 54.1,
    lng: -1.2,
    accuracy: 12,
  });
  assert.equal(body.team, "DUTY1");
  assert.equal(body.name, "Sam");
  assert.equal(body.lat, 54.1);
  assert.equal(parsePublish({ ...body, lat: 400 }).lat, null);
  assert.throws(() => parsePublish({ ...body, team: "no" }));
});

test("a raised alert keeps eight mobiles and no paste step", () => {
  const body = parseRaise({
    team: "duty1",
    device: "11111111-1111-1111-1111-111111111111",
    name: "Sam",
    phones: "07700900111, 07700900111, +44 7700 900222, not-a-number",
    where: "https://maps.google.com/?q=54.10000,-1.20000",
    kind: "red",
    note: "At the door",
  });
  assert.deepEqual(body.phones, ["447700900111", "447700900222"]);
  assert.equal(body.kind, "red");
  assert.equal(
    raisedLabel({ board: true, whatsapp: "not-connected", sentTo: 0 }),
    "On the board. WhatsApp is not connected yet, so no WhatsApp was sent.",
  );
});
test("a pin's age is plain", () => {
  const now = Date.parse("2026-10-01T12:00:30Z");
  assert.equal(ageLabel("2026-10-01T12:00:20Z", now), "Just now");
  assert.equal(ageLabel("2026-10-01T12:00:00Z", now), "30s ago");
  assert.equal(ageLabel("2026-10-01T11:58:00Z", now), "3 min ago");
});

test("a raise keeps up to 8 unique emails and drops bad ones", () => {
  const many = Array.from({ length: 10 }, (_, i) => `p${i}@x.co`).join(", ");
  const body = parseRaise({
    device: "11111111-1111-1111-1111-111111111111",
    emails: `A@X.co, a@x.co, not-an-email, ${many}`,
  });
  assert.equal(body.emails.length, 8);
  assert.equal(body.emails[0], "a@x.co");
  assert.ok(!body.emails.includes("not-an-email"));
});

test("the raised label reports both WhatsApp and email", () => {
  assert.equal(
    raisedLabel({ board: true, whatsapp: "sent", sentTo: 3, email: "sent", emailedTo: 2 }),
    "On the board. WhatsApp sent to 3 numbers. Email sent to 2 addresses.",
  );
  assert.equal(
    raisedLabel({ board: false, whatsapp: "no-numbers", sentTo: 0, email: "sent", emailedTo: 1 }),
    "Email sent to 1 address. Set a board code so the others also see it on the board.",
  );
  assert.match(
    raisedLabel({ board: true, whatsapp: "no-numbers", sentTo: 0, email: "no-addresses", emailedTo: 0 }),
    /Add duty mobiles or alert emails/,
  );
});
