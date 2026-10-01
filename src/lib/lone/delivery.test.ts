import assert from "node:assert/strict";
import { test } from "node:test";
import { decide, GIVE_UP_AFTER_MS, UNDELIVERED_AFTER_MS } from "./delivery.ts";

test("a failed or undelivered WhatsApp gets an SMS straight away", () => {
  assert.equal(decide("failed", 5_000), "sms");
  assert.equal(decide("undelivered", 5_000), "sms");
});

test("a delivered or read WhatsApp needs nothing more", () => {
  assert.equal(decide("delivered", 5_000), "done");
  assert.equal(decide("read", 5_000), "done");
});

test("a WhatsApp still only 'sent' waits, then gets an SMS after 10 minutes", () => {
  assert.equal(decide("sent", 30_000), "wait");
  assert.equal(decide("queued", 30_000), "wait");
  assert.equal(decide("sent", UNDELIVERED_AFTER_MS), "sms");
  assert.equal(decide("sent", GIVE_UP_AFTER_MS), "done");
});
