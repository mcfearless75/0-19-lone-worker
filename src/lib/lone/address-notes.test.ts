import assert from "node:assert/strict";
import { test } from "node:test";
import { parseNewNote, worstLevel } from "./address-notes.ts";
import { distanceM, hasArrived } from "./geo.ts";

const DEV = "22222222-2222-2222-2222-222222222222";

test("a note needs a team, a position and some text", () => {
  assert.throws(() => parseNewNote({ team: "", device: DEV, lat: 53, lng: -3, note: "Dog" }), /board code/);
  assert.throws(() => parseNewNote({ team: "BLUE24", device: DEV, note: "Dog" }), /map position/);
  assert.throws(() => parseNewNote({ team: "BLUE24", device: DEV, lat: 53, lng: -3, note: " " }), /Write/);
  const n = parseNewNote({ team: "blue-24", device: DEV, lat: 53, lng: -3, note: "Large dog", level: "silly" });
  assert.equal(n.team, "BLUE24");
  assert.equal(n.level, "caution");
});

test("the worst level wins", () => {
  assert.equal(worstLevel([]), null);
  assert.equal(worstLevel([{ level: "info" }, { level: "danger" }]), "danger");
  assert.equal(worstLevel([{ level: "info" }]), "info");
});

test("arrival is within 100 m with a decent fix", () => {
  const pin = { lat: 53.3987, lng: -3.1678 };
  assert.ok(distanceM(pin.lat, pin.lng, 53.3987, -3.1678) < 1);
  assert.equal(hasArrived({ lat: 53.3990, lng: -3.1678, accuracy: 20 }, pin), true); // ~33 m
  assert.equal(hasArrived({ lat: 53.4010, lng: -3.1678, accuracy: 20 }, pin), false); // ~255 m
  assert.equal(hasArrived({ lat: 53.3987, lng: -3.1678, accuracy: 400 }, pin), false); // fix too loose
});
