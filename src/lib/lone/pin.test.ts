import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyPin, pinProblem } from "./pin.ts";

test("no PIN set means nothing is asked", () => {
  assert.equal(classifyPin("1234", { safePin: "", duressPin: "" }), "none");
});

test("safe, duress and wrong are told apart", () => {
  const p = { safePin: "1234", duressPin: "4321" };
  assert.equal(classifyPin("1234", p), "safe");
  assert.equal(classifyPin("4321", p), "duress");
  assert.equal(classifyPin("0000", p), "wrong");
  assert.equal(classifyPin("4321", { safePin: "1234", duressPin: "" }), "wrong");
});

test("PIN pairs are validated", () => {
  assert.equal(pinProblem("", ""), null);
  assert.equal(pinProblem("1234", "4321"), null);
  assert.match(pinProblem("12", "") ?? "", /4 digits/);
  assert.match(pinProblem("1234", "1234") ?? "", /different/);
});
