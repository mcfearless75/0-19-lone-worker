import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPdf, wrap } from "./pdf.ts";

test("long lines wrap on word boundaries", () => {
  const lines = wrap("one two three four five six", 10);
  assert.deepEqual(lines, ["one two", "three four", "five six"]);
});

test("a PDF has a header, pages and a trailer", () => {
  const bytes = buildPdf(
    [{ text: "Evidence pack", bold: true, size: 16 }, ...Array.from({ length: 150 }, (_, i) => ({ text: `Line ${i}` }))],
    "Test",
  );
  const text = Buffer.from(bytes).toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.match(text, /\/Type \/Pages \/Kids \[[^\]]+\] \/Count 3/);
  assert.match(text, /%%EOF\n$/);
  assert.ok(!text.includes("/Parent 0 0 R"));
});
