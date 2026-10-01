import assert from "node:assert/strict";
import test from "node:test";
import {
  brandLabel,
  buildMessage,
  expireDue,
  mailHref,
  messageSubject,
  normalizePhone,
  readyChannels,
  safeGroupUrl,
  smsHref,
  whatsappHref,
  defaultProfile,
  dutyReady,
  type Alert,
  type Job,
  type Welfare,
} from "./model.ts";

test("UK mobiles gain a country code and junk is stripped", () => {
  assert.equal(normalizePhone("07911 123456"), "447911123456");
  assert.equal(normalizePhone("+44 7911 123456"), "447911123456");
  assert.equal(normalizePhone("00447911123456"), "447911123456");
  assert.equal(normalizePhone("123"), "");
});

test("only real WhatsApp links are accepted", () => {
  assert.equal(
    safeGroupUrl("https://chat.whatsapp.com/AbCdEf123"),
    "https://chat.whatsapp.com/AbCdEf123",
  );
  assert.equal(safeGroupUrl("http://chat.whatsapp.com/AbCdEf123"), null);
  assert.equal(safeGroupUrl("https://example.com"), null);
});

test("WhatsApp and SMS links carry the alert text", () => {
  const text = "RED ALERT";
  assert.equal(
    whatsappHref("07911123456", text),
    "https://wa.me/447911123456?text=RED%20ALERT",
  );
  assert.match(smsHref("07911123456", text, true) ?? "", /^sms:\+447911123456&body=/);
  assert.match(smsHref("07911123456", text, false) ?? "", /^sms:\+447911123456\?body=/);
  assert.match(mailHref("a@b.co, bad", "Sub", "Body") ?? "", /^mailto:a@b.co\?/);
});

test("ready channels follow what was filled in", () => {
  assert.deepEqual(
    readyChannels({
      ...defaultProfile,
      whatsappNumber: "07911123456",
      email: "desk@example.test",
      whatsappGroupUrl: "https://chat.whatsapp.com/AbCdEf123",
    }),
    ["whatsapp", "group", "email"],
  );
});

test("the duty pair is the group link plus every valid email", () => {
  assert.deepEqual(dutyReady(defaultProfile), []);
  assert.deepEqual(
    dutyReady({
      ...defaultProfile,
      whatsappGroupUrl: "https://chat.whatsapp.com/AbCdEf123",
      email: "one@nhs.net, not-an-email, two@nhs.net",
    }),
    ["group", "email"],
  );
  assert.deepEqual(
    dutyReady({ ...defaultProfile, email: "one@nhs.net" }),
    ["email"],
  );
});

test("a missed timer opens one welfare alert and does not duplicate it", () => {
  const job: Job = {
    id: "job-1",
    ref: "LW-0001",
    sample: false,
    workerName: "Sam",
    site: "Depot",
    address: "1 Quay",
    client: "",
    note: "Gate code 4411",
    startedAt: new Date(0).toISOString(),
    dueAt: new Date(1_000).toISOString(),
    endedAt: null,
    status: "active",
    outcome: "",
    lat: 54.1,
    lng: -2.9,
    accuracy: 12,
  };
  const welfare: Welfare = {
    id: "w-1",
    sample: false,
    jobId: job.id,
    note: job.note,
    startedAt: job.startedAt,
    expiresAt: new Date(1_000).toISOString(),
    status: "running",
    lat: 54.1,
    lng: -2.9,
  };
  const first = expireDue({ jobs: [job], alerts: [], welfare: [welfare], events: [] }, 5_000);
  assert.equal(first.changed, true);
  assert.equal(first.welfare[0]?.status, "expired");
  assert.equal(first.alerts.length, 1);
  assert.equal(first.alerts[0]?.kind, "timer");
  assert.equal(first.alerts[0]?.site, "Depot");
  assert.match(first.alerts[0]?.note ?? "", /4411/);
  const second = expireDue(
    { jobs: [job], alerts: first.alerts, welfare: first.welfare, events: first.events },
    9_000,
  );
  assert.equal(second.changed, false);
  assert.equal(second.alerts.length, 1);
});

test("a blank organisation stays unbranded and a set name is the only stamp", () => {
  assert.equal(brandLabel(""), "0-19 Lone Worker");
  assert.equal(brandLabel("  Northgate  "), "Northgate");
  assert.equal(messageSubject("red"), "RED ALERT — 0-19 Lone Worker");
  assert.equal(messageSubject("red", "Northgate"), "RED ALERT — Northgate");
  assert.doesNotMatch(messageSubject("timer"), /copeland|traknet/i);
});

test("red alert text includes a map link", () => {
  const text = buildMessage({
    kind: "red",
    workerName: "Sam",
    site: "Depot",
    address: "1 Quay",
    note: "No answer",
    at: "2026-10-01T13:00:00.000Z",
    lat: 54.12345,
    lng: -2.98765,
    accuracy: 20,
  });
  assert.match(text, /RED ALERT — 0-19 Lone Worker/);
  assert.doesNotMatch(text, /copeland|traknet/i);
  assert.match(text, /maps\.google\.com/);
  assert.match(text, /No answer/);
  const alert: Alert | null = null;
  assert.equal(alert, null);
});
