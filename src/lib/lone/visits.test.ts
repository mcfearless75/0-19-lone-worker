import assert from "node:assert/strict";
import { test } from "node:test";
import { parseVisitFields, parseVisitRecord, visitLine } from "./visits.ts";

const NOW = Date.parse("2026-10-01T14:00:00Z");

test("visit fields are validated and anything odd is dropped", () => {
  const v = parseVisitFields({ visitState: "checked_in", checkedInAt: "2026-10-01T13:50:00Z", dueAt: "not a date" });
  assert.equal(v.visitState, "checked_in");
  assert.equal(v.checkedInAt, "2026-10-01T13:50:00.000Z");
  assert.equal(v.dueAt, null);
  assert.equal(parseVisitFields({ visitState: "hacked" }).visitState, "");
});

test("the board line says checked in, overdue, or due time", () => {
  assert.equal(
    visitLine({ visitState: "checked_in", checkedInAt: "2026-10-01T13:50:00Z", dueAt: null, visitStartedAt: null }, "Hunter", NOW).tone,
    "ok",
  );
  const late = visitLine({ visitState: "on_visit", checkedInAt: null, dueAt: "2026-10-01T13:45:00Z", visitStartedAt: null }, "Hunter", NOW);
  assert.equal(late.tone, "amber");
  assert.match(late.text, /Overdue by 15 min/);
  const due = visitLine({ visitState: "on_visit", checkedInAt: null, dueAt: "2026-10-01T14:30:00Z", visitStartedAt: null }, "", NOW);
  assert.match(due.text, /On a visit · due/);
});

test("a visit record needs ids and a start time", () => {
  assert.throws(() => parseVisitRecord({ id: "x" }));
  const r = parseVisitRecord({
    id: "11111111-1111-1111-1111-111111111111",
    device: "22222222-2222-2222-2222-222222222222",
    team: "blue24",
    site: "Hunter",
    startedAt: "2026-10-01T13:00:00Z",
  });
  assert.equal(r.team, "BLUE24");
  assert.equal(r.endedAt, null);
});
