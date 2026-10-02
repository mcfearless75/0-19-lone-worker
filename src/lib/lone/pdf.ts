/**
 * Tiny dependency-free PDF writer: A4 pages of Helvetica text. Enough for an
 * evidence pack (headings, lines, a few tables of words). Returns the file as
 * a Buffer-compatible byte string.
 */
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;
const LINE_H = 14;
const FONT_SIZE = 10.5;
const CHARS_PER_LINE = 92;
const LINES_PER_PAGE = Math.floor((PAGE_H - 2 * MARGIN) / LINE_H);

export type PdfLine = { text: string; bold?: boolean; size?: number };

function escapePdf(text: string): string {
  // Latin-1 only in the standard fonts; swap anything else for '?'.
  return text
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

export function wrap(text: string, width = CHARS_PER_LINE): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const w of words) {
      if ((line + " " + w).trim().length > width && line) {
        out.push(line);
        line = w;
      } else {
        line = (line + " " + w).trim();
      }
    }
    out.push(line);
  }
  return out;
}

export function buildPdf(lines: PdfLine[], title = "Document"): Uint8Array {
  const pages: PdfLine[][] = [];
  let page: PdfLine[] = [];
  for (const l of lines) {
    const pieces = wrap(l.text, l.size && l.size > 12 ? Math.floor(CHARS_PER_LINE * 10.5 / l.size) : CHARS_PER_LINE);
    for (const p of pieces) {
      if (page.length >= LINES_PER_PAGE) {
        pages.push(page);
        page = [];
      }
      page.push({ text: p, bold: l.bold, size: l.size });
    }
  }
  pages.push(page);

  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  const fontN = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const fontB = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const pagesId = objects.length + 1 + pages.length * 2; // reserved after page+content pairs
  const pageIds: number[] = [];
  for (const p of pages) {
    let y = PAGE_H - MARGIN;
    const ops: string[] = ["BT"];
    for (const l of p) {
      const size = l.size ?? FONT_SIZE;
      ops.push(`/${l.bold ? "F2" : "F1"} ${size} Tf`);
      ops.push(`1 0 0 1 ${MARGIN} ${y.toFixed(2)} Tm`);
      ops.push(`(${escapePdf(l.text)}) Tj`);
      y -= Math.max(LINE_H, size * 1.3);
    }
    ops.push("ET");
    const stream = ops.join("\n");
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontN} 0 R /F2 ${fontB} 0 R >> >> >>`,
    );
    pageIds.push(pageId);
  }
  const realPagesId = add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  // Fix up the parent reference now the Pages object id is known.
  for (const id of pageIds) objects[id - 1] = objects[id - 1].replace(`/Parent ${pagesId} 0 R`, `/Parent ${realPagesId} 0 R`);
  const catalogId = add(`<< /Type /Catalog /Pages ${realPagesId} 0 R >>`);
  const infoId = add(`<< /Title (${escapePdf(title)}) /Producer (0-19 Lone Worker) >>`);

  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}
