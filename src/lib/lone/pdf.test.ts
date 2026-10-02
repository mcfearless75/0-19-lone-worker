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

test("SVG paths become PDF path operators, arcs included", async () => {
  const { svgPathToPdf } = await import("./pdf.ts");
  const { NHS_LOGO } = await import("./nhs-logo.ts");
  const simple = svgPathToPdf("m10 10h5v5l-5 0z", 0, 100, 1);
  assert.deepEqual(simple.split("\n"), ["10.000 90.000 m", "15.000 90.000 l", "15.000 85.000 l", "10.000 85.000 l", "h"]);
  const s = svgPathToPdf(NHS_LOGO.paths[2], 0, 100, 1);
  assert.ok(s.split("\n").filter((op) => op.endsWith(" c")).length >= 6, "arcs and curves present");
  assert.ok(!s.includes("NaN"));
});

test("a header adds the NHS mark and page numbers to every page", async () => {
  const { buildPdf } = await import("./pdf.ts");
  const { NHS_LOGO } = await import("./nhs-logo.ts");
  const bytes = buildPdf(Array.from({ length: 120 }, (_, i) => ({ text: `Line ${i}` })), "T", { title: "Wirral 0-19", footer: "Confidential", nhs: true }, NHS_LOGO);
  const text = Buffer.from(bytes).toString("latin1");
  assert.equal((text.match(/0\.000 0\.369 0\.722 rg/g) ?? []).length, 3, "blue box on each of 3 pages");
  assert.match(text, /\(Page 1 of 3\) Tj/);
  assert.match(text, /\(Page 3 of 3\) Tj/);
});
