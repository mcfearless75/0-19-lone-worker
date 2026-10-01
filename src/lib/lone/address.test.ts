import assert from "node:assert/strict";
import { test } from "node:test";
import { formatHit, samePostcode, ukPostcode } from "./address.ts";

test("a street match becomes a short address", () => {
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
  assert.equal(hit?.label, "80 Birkenhead Road, Meols, CH47 5AG");
  assert.equal(hit?.lat, 53.3985473);
});

test("a typed postcode is kept as written", () => {
  assert.equal(ukPostcode("80 Birkenhead Road, Meols, ch470lb"), "CH47 0LB");
  assert.equal(samePostcode("CH47 0LB", "CH470LB"), true);
  assert.equal(samePostcode("CH47 0LB", "CH47 5AG"), false);
});
