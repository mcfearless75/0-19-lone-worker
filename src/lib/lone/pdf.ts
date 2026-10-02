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

export type PdfHeader = {
  /** Left of the header, e.g. the organisation or team. */
  title: string;
  /** Under the title, smaller. */
  subtitle?: string;
  /** Footer left; page numbers go on the right. */
  footer?: string;
  /** NHS mark top right. */
  nhs?: boolean;
};

const HEADER_H = 64;
const FOOTER_H = 30;

/**
 * Translate an SVG path "d" string (M/L/H/V/C/S/A/Z, absolute or relative)
 * into PDF path operators. (tx, ty) is where SVG (0,0) lands on the page and
 * `s` the scale; SVG's y grows downwards, PDF's upwards, so y is flipped.
 */
export function svgPathToPdf(d: string, tx: number, ty: number, s: number): string {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const out: string[] = [];
  const f = (n: number) => n.toFixed(3);
  const P = (x: number, y: number) => `${f(tx + s * x)} ${f(ty - s * y)}`;
  let i = 0;
  let cmd = "";
  let x = 0, y = 0, sx = 0, sy = 0, cx = 0, cy = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const t = tokens[i];
    if (/[a-zA-Z]/.test(t)) {
      cmd = t;
      i++;
      if (cmd === "z" || cmd === "Z") {
        out.push("h");
        x = sx; y = sy;
        continue;
      }
    }
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case "M": {
        const nx = num(), ny = num();
        x = rel ? x + nx : nx; y = rel ? y + ny : ny;
        sx = x; sy = y;
        out.push(`${P(x, y)} m`);
        cmd = rel ? "l" : "L";
        break;
      }
      case "L": {
        const nx = num(), ny = num();
        x = rel ? x + nx : nx; y = rel ? y + ny : ny;
        out.push(`${P(x, y)} l`);
        break;
      }
      case "H": {
        const nx = num();
        x = rel ? x + nx : nx;
        out.push(`${P(x, y)} l`);
        break;
      }
      case "V": {
        const ny = num();
        y = rel ? y + ny : ny;
        out.push(`${P(x, y)} l`);
        break;
      }
      case "C": {
        const x1 = num(), y1 = num(), x2 = num(), y2 = num(), nx = num(), ny = num();
        const ax = rel ? x : 0, ay = rel ? y : 0;
        cx = ax + x2; cy = ay + y2;
        out.push(`${P(ax + x1, ay + y1)} ${P(ax + x2, ay + y2)} ${P(ax + nx, ay + ny)} c`);
        x = ax + nx; y = ay + ny;
        break;
      }
      case "S": {
        const x2 = num(), y2 = num(), nx = num(), ny = num();
        const ax = rel ? x : 0, ay = rel ? y : 0;
        const x1 = 2 * x - cx, y1 = 2 * y - cy;
        cx = ax + x2; cy = ay + y2;
        out.push(`${P(x1, y1)} ${P(ax + x2, ay + y2)} ${P(ax + nx, ay + ny)} c`);
        x = ax + nx; y = ay + ny;
        break;
      }
      case "A": {
        const rx = num(), ry = num(), rot = num(), large = num(), sweep = num(), nx = num(), ny = num();
        const ex = rel ? x + nx : nx, ey = rel ? y + ny : ny;
        for (const [c1x, c1y, c2x, c2y, px, py] of arcToBeziers(x, y, rx, ry, rot, large, sweep, ex, ey)) {
          out.push(`${P(c1x, c1y)} ${P(c2x, c2y)} ${P(px, py)} c`);
        }
        x = ex; y = ey;
        break;
      }
      default:
        i++;
    }
    if (cmd.toUpperCase() !== "C" && cmd.toUpperCase() !== "S") { cx = x; cy = y; }
  }
  return out.join("\n");
}

/** SVG elliptical arc → cubic Béziers (endpoint to centre parameterisation, SVG spec F.6.5). */
function arcToBeziers(x1: number, y1: number, rx: number, ry: number, rotDeg: number, large: number, sweep: number, x2: number, y2: number): number[][] {
  if (rx === 0 || ry === 0) return [[x1, y1, x2, y2, x2, y2]];
  const phi = (rotDeg * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;
  let rX = Math.abs(rx), rY = Math.abs(ry);
  const lambda = (x1p * x1p) / (rX * rX) + (y1p * y1p) / (rY * rY);
  if (lambda > 1) { rX *= Math.sqrt(lambda); rY *= Math.sqrt(lambda); }
  const sign = large === sweep ? -1 : 1;
  const num = Math.max(0, rX * rX * rY * rY - rX * rX * y1p * y1p - rY * rY * x1p * x1p);
  const den = rX * rX * y1p * y1p + rY * rY * x1p * x1p;
  const coef = sign * Math.sqrt(den === 0 ? 0 : num / den);
  const cxp = (coef * rX * y1p) / rY, cyp = (-coef * rY * x1p) / rX;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = ang(1, 0, (x1p - cxp) / rX, (y1p - cyp) / rY);
  let dt = ang((x1p - cxp) / rX, (y1p - cyp) / rY, (-x1p - cxp) / rX, (-y1p - cyp) / rY);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const segs = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2)));
  const out: number[][] = [];
  const step = dt / segs;
  const k = (4 / 3) * Math.tan(step / 4);
  let t = t1;
  for (let i = 0; i < segs; i++) {
    const t2 = t + step;
    const p = (a: number) => {
      const ex = rX * Math.cos(a), ey = rY * Math.sin(a);
      return [cos * ex - sin * ey + cx, sin * ex + cos * ey + cy];
    };
    const d1 = (a: number) => {
      const ex = -rX * Math.sin(a), ey = rY * Math.cos(a);
      return [cos * ex - sin * ey, sin * ex + cos * ey];
    };
    const [p1x, p1y] = p(t), [p2x, p2y] = p(t2);
    const [d1x, d1y] = d1(t), [d2x, d2y] = d1(t2);
    out.push([p1x + k * d1x, p1y + k * d1y, p2x - k * d2x, p2y - k * d2y, p2x, p2y]);
    t = t2;
  }
  return out;
}

function escapePdf(text: string): string {
  // WinAnsi: map the punctuation we use, Latin-1 passes through, anything else becomes '?'.
  return text
    .replace(/\u2014/g, "\x97")
    .replace(/\u2013/g, "\x96")
    .replace(/\u2019/g, "\x92")
    .replace(/\u2018/g, "\x91")
    .replace(/\u201C/g, "\x93")
    .replace(/\u201D/g, "\x94")
    .replace(/\u2022/g, "\x95")
    .replace(/\u2026/g, "\x85")
    .replace(/[^\x20-\x7E\x85\x91-\x97\xA0-\xFF]/g, "?")
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

function nhsLogoOps(right: number, top: number, width: number, logo: { width: number; height: number; blue: readonly number[]; glyphScale: number; paths: string[] }): string {
  const s = width / logo.width;
  const x = right - width;
  const h = logo.height * s;
  const ops = [
    `${logo.blue.map((c) => c.toFixed(3)).join(" ")} rg`,
    `${x.toFixed(3)} ${(top - h).toFixed(3)} ${width.toFixed(3)} ${h.toFixed(3)} re f`,
    "1 1 1 rg",
    ...logo.paths.map((d) => svgPathToPdf(d, x, top, s * logo.glyphScale) + "\nf"),
  ];
  return ops.join("\n");
}

export function buildPdf(
  lines: PdfLine[],
  title = "Document",
  header?: PdfHeader,
  logo?: { width: number; height: number; blue: readonly number[]; glyphScale: number; paths: string[] },
): Uint8Array {
  const topInset = header ? HEADER_H : 0;
  const bottomInset = header ? FOOTER_H : 0;
  const linesPerPage = Math.floor((PAGE_H - 2 * MARGIN - topInset - bottomInset) / LINE_H);
  const pages: PdfLine[][] = [];
  let page: PdfLine[] = [];
  for (const l of lines) {
    const pieces = wrap(l.text, l.size && l.size > 12 ? Math.floor(CHARS_PER_LINE * 10.5 / l.size) : CHARS_PER_LINE);
    for (const p of pieces) {
      if (page.length >= linesPerPage) {
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
  pages.forEach((p, pageIndex) => {
    let y = PAGE_H - MARGIN - topInset;
    const ops: string[] = [];
    if (header) {
      const top = PAGE_H - MARGIN + 10;
      if (header.nhs && logo) ops.push(nhsLogoOps(PAGE_W - MARGIN, top, 74, logo));
      ops.push("0 0 0 rg", "BT", `/F2 13 Tf`, `1 0 0 1 ${MARGIN} ${(top - 16).toFixed(2)} Tm`, `(${escapePdf(header.title)}) Tj`, "ET");
      if (header.subtitle) ops.push("BT", `/F1 9.5 Tf`, `1 0 0 1 ${MARGIN} ${(top - 30).toFixed(2)} Tm`, `(${escapePdf(header.subtitle)}) Tj`, "ET");
      ops.push(`${(logo?.blue ?? [0, 0.369, 0.722]).map((c) => c.toFixed(3)).join(" ")} RG`, "1.5 w", `${MARGIN} ${(top - 44).toFixed(2)} m ${(PAGE_W - MARGIN).toFixed(2)} ${(top - 44).toFixed(2)} l S`);
      const footerY = MARGIN - 18;
      ops.push("0.4 0.4 0.4 rg", "BT", `/F1 8.5 Tf`, `1 0 0 1 ${MARGIN} ${footerY} Tm`, `(${escapePdf(header.footer ?? "")}) Tj`, "ET");
      const pn = `Page ${pageIndex + 1} of ${pages.length}`;
      ops.push("BT", `/F1 8.5 Tf`, `1 0 0 1 ${(PAGE_W - MARGIN - pn.length * 4.3).toFixed(2)} ${footerY} Tm`, `(${pn}) Tj`, "ET", "0 0 0 rg");
    }
    ops.push("BT");
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
  });
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
