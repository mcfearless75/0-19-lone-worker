import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTimerStart, parseTimerUpdate } from "./timers.ts";

const NOW = Date.parse("2026-10-01T12:00:00Z");
const ID = "11111111-1111-1111-1111-111111111111";
const DEV = "22222222-2222-2222-2222-222222222222";

test("a timer start keeps up to 8 phones and emails and a future end", () => {
  const t = parseTimerStart(
    {
      id: ID,
      device: DEV,
      team: "blue-24",
      name: "Sam",
      job: "Hunter",
      phones: "07700900001, 07700900001, 07700900002",
      emails: "A@x.co, a@x.co, nope",
      expiresAt: new Date(NOW + 30 * 60_000).toISOString(),
      lat: 53.4,
      lng: -3.1,
    },
    NOW,
  );
  assert.equal(t.team, "BLUE24");
  assert.equal(t.phones, "447700900001,447700900002");
  assert.equal(t.emails, "a@x.co");
  assert.equal(t.expiresAt, "2026-10-01T12:30:00.000Z");
});

test("a timer in the past or too far ahead is rejected", () => {
  const base = { id: ID, device: DEV };
  assert.throws(() => parseTimerStart({ ...base, expiresAt: new Date(NOW - 1000).toISOString() }, NOW));
  assert.throws(() => parseTimerStart({ ...base, expiresAt: new Date(NOW + 13 * 3_600_000).toISOString() }, NOW));
});

test("a check-in update needs no end time", () => {
  const u = parseTimerUpdate({ id: ID, device: DEV, status: "checked_in" }, NOW);
  assert.equal(u.status, "checked_in");
  assert.equal(u.expiresAt, null);
  assert.throws(() => parseTimerUpdate({ id: "x", device: DEV, status: "checked_in" }, NOW));
});
