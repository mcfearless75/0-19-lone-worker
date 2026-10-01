import assert from "node:assert/strict";
import { test } from "node:test";
import { formatHit, samePostcode, ukPostcode, withPostcode } from "./address.ts";

test("OpenStreetMap's own postcode is never used", () => {
  const hit = formatHit({
    lat: "53.3985473",
    lon: "-3.1682884",
    display_name: "80, Birkenhead Road, Meols, United Kingdom",
    address: {
      house_number: "80",
      road: "Birkenhead Road",
      suburb: "Meols",
      postcode: "CH47 5AG",
    },
  });
  assert.equal(hit?.label, "80 Birkenhead Road, Meols");
  assert.equal(hit?.postcode, null);
  assert.equal(hit?.lat, 53.3985473);
});

test("the official postcode is attached to the label", () => {
  const hit = formatHit({ lat: "53.39", lon: "-3.16", address: { house_number: "80", road: "Birkenhead Road", suburb: "Meols" } });
  assert.ok(hit);
  const fixed = withPostcode(hit, "CH47 0LB");
  assert.equal(fixed.label, "80 Birkenhead Road, Meols, CH47 0LB");
  assert.equal(fixed.postcode, "CH47 0LB");
  assert.equal(withPostcode(hit, null).label, "80 Birkenhead Road, Meols");
});

test("a typed postcode is kept as written", () => {
  assert.equal(ukPostcode("80 Birkenhead Road, Meols, ch470lb"), "CH47 0LB");
  assert.equal(samePostcode("CH47 0LB", "CH470LB"), true);
  assert.equal(samePostcode("ch47 0lb", "CH47 0LB"), true);
  assert.equal(samePostcode("CH47 0LB", "CH47 5AG"), false);
});
