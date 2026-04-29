import { readFileSync, existsSync } from "node:fs";
import { extname } from "node:path";
import { HwpDocument } from "@rhwp/core";
import { initRhwp } from "./wasm-init.js";

export type HwpFormat = "hwp" | "hwpx";

export function getFormatFromPath(path: string): HwpFormat {
  const ext = extname(path).toLowerCase();
  if (ext === ".hwp") return "hwp";
  if (ext === ".hwpx") return "hwpx";
  throw new Error(
    `Unsupported file extension: ${ext} (지원하지 않는 형식, expected .hwp or .hwpx)`
  );
}

export async function openDocument(path: string): Promise<HwpDocument> {
  if (!existsSync(path)) {
    throw new Error(`File not found (파일을 찾을 수 없습니다): ${path}`);
  }
  getFormatFromPath(path);
  await initRhwp();
  const bytes = readFileSync(path);
  return new HwpDocument(new Uint8Array(bytes));
}

export function closeDocument(doc: HwpDocument): void {
  try {
    doc.free();
  } catch {
    /* already freed */
  }
}

export function walkText(doc: HwpDocument): string {
  const lines: string[] = [];
  const sectionCount = doc.getSectionCount();

  // Headers (per section, deduped)
  const hfs = walkHeadersFooters(doc);
  const headers = hfs.filter((h) => h.kind === "header");
  if (headers.length > 0) {
    lines.push("--- headers ---");
    for (const h of headers) {
      lines.push(`[section ${h.section} ${h.label}] ${h.text}`);
    }
    lines.push("");
  }

  // Body
  for (let s = 0; s < sectionCount; s++) {
    const paraCount = doc.getParagraphCount(s);
    for (let p = 0; p < paraCount; p++) {
      const len = doc.getParagraphLength(s, p);
      if (len === 0) {
        lines.push("");
        continue;
      }
      lines.push(doc.getTextRange(s, p, 0, len));
    }
  }

  // Footers
  const footers = hfs.filter((h) => h.kind === "footer");
  if (footers.length > 0) {
    lines.push("");
    lines.push("--- footers ---");
    for (const f of footers) {
      lines.push(`[section ${f.section} ${f.label}] ${f.text}`);
    }
  }

  // Footnotes
  const fns = walkFootnotes(doc);
  if (fns.length > 0) {
    lines.push("");
    lines.push("--- footnotes ---");
    for (const fn of fns) {
      lines.push(`[${fn.number}] ${fn.text}`);
    }
  }

  // Equations
  const eqs = walkEquations(doc);
  if (eqs.length > 0) {
    lines.push("");
    lines.push("--- equations ---");
    for (const eq of eqs) {
      lines.push(`[eq ${eq.section}/${eq.paragraph}/${eq.controlIdx}] ${eq.script}`);
    }
  }

  return lines.join("\n");
}

export interface EquationRef {
  section: number;
  paragraph: number;
  controlIdx: number;
  script: string;
  fontSize?: number;
  fontName?: string;
}

export function walkEquations(doc: HwpDocument): EquationRef[] {
  const out: EquationRef[] = [];
  const sectionCount = doc.getSectionCount();
  for (let s = 0; s < sectionCount; s++) {
    const paraCount = doc.getParagraphCount(s);
    for (let p = 0; p < paraCount; p++) {
      const n = controlCount(doc, s, p);
      for (let ci = 0; ci < n; ci++) {
        let raw: string;
        try {
          raw = doc.getEquationProperties(s, p, ci, 0, 0);
        } catch {
          continue;
        }
        if (!raw || !raw.includes("script")) continue;
        let parsed: { script?: string; fontSize?: number; fontName?: string };
        try {
          parsed = JSON.parse(raw);
        } catch {
          continue;
        }
        if (!parsed.script) continue;
        out.push({
          section: s,
          paragraph: p,
          controlIdx: ci,
          script: parsed.script,
          fontSize: parsed.fontSize,
          fontName: parsed.fontName,
        });
      }
    }
  }
  return out;
}

export interface HeaderFooterRef {
  section: number;
  kind: "header" | "footer";
  applyTo: number;
  label: string;
  text: string;
}

export function walkHeadersFooters(doc: HwpDocument): HeaderFooterRef[] {
  const out: HeaderFooterRef[] = [];
  const seen = new Set<string>();
  const sectionCount = doc.getSectionCount();
  for (let s = 0; s < sectionCount; s++) {
    for (const isHeader of [true, false]) {
      let listJson: string;
      try {
        listJson = doc.getHeaderFooterList(s, isHeader, 0);
      } catch {
        continue;
      }
      let list: { items?: Array<{ sectionIdx?: number; isHeader?: boolean; applyTo?: number; label?: string }> };
      try {
        list = JSON.parse(listJson);
      } catch {
        continue;
      }
      for (const it of list.items ?? []) {
        const itSection = Number(it.sectionIdx ?? s);
        const itIsHeader = Boolean(it.isHeader);
        const applyTo = Number(it.applyTo ?? 0);
        const key = `${itSection}|${itIsHeader}|${applyTo}`;
        if (seen.has(key)) continue;
        seen.add(key);
        let infoJson: string;
        try {
          infoJson = doc.getHeaderFooter(itSection, itIsHeader, applyTo);
        } catch {
          continue;
        }
        let info: { exists?: boolean; text?: string; label?: string };
        try {
          info = JSON.parse(infoJson);
        } catch {
          continue;
        }
        if (!info.exists) continue;
        out.push({
          section: itSection,
          kind: itIsHeader ? "header" : "footer",
          applyTo,
          label: info.label ?? it.label ?? "",
          text: (info.text ?? "").trim(),
        });
      }
    }
  }
  return out;
}

export interface FootnoteRef {
  section: number;
  paragraph: number;
  controlIdx: number;
  number: number;
  text: string;
}

export function walkFootnotes(doc: HwpDocument): FootnoteRef[] {
  const out: FootnoteRef[] = [];
  const sectionCount = doc.getSectionCount();
  for (let s = 0; s < sectionCount; s++) {
    const paraCount = doc.getParagraphCount(s);
    for (let p = 0; p < paraCount; p++) {
      const n = controlCount(doc, s, p);
      for (let ci = 0; ci < n; ci++) {
        let infoJson: string;
        try {
          infoJson = doc.getFootnoteInfo(s, p, ci);
        } catch {
          continue;
        }
        if (!infoJson || infoJson === "null") continue;
        let info: { ok?: boolean; number?: number; texts?: string[] };
        try {
          info = JSON.parse(infoJson);
        } catch {
          continue;
        }
        if (!info.ok) continue;
        out.push({
          section: s,
          paragraph: p,
          controlIdx: ci,
          number: Number(info.number ?? 0),
          text: (info.texts ?? []).join("\n").trim(),
        });
      }
    }
  }
  return out;
}

export function getPageCount(doc: HwpDocument): number {
  try {
    return doc.pageCount();
  } catch {
    return 0;
  }
}

export function renderPageSvg(doc: HwpDocument, pageNum: number): string {
  return doc.renderPageSvg(pageNum);
}

export interface TableData {
  rows: number;
  cols: number;
  cells: string[][];
}

interface TableDims {
  rows?: number;
  cols?: number;
  rowCount?: number;
  colCount?: number;
  row_count?: number;
  col_count?: number;
  cellCount?: number;
  cell_count?: number;
}

function controlCount(doc: HwpDocument, s: number, p: number): number {
  const raw = doc.getControlTextPositions(s, p);
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.length;
    return 0;
  } catch {
    return 0;
  }
}

function readCellText(
  doc: HwpDocument,
  s: number,
  p: number,
  ci: number,
  cellIdx: number
): string {
  let paraCount: number;
  try {
    paraCount = doc.getCellParagraphCount(s, p, ci, cellIdx);
  } catch {
    return "";
  }
  const lines: string[] = [];
  for (let cp = 0; cp < paraCount; cp++) {
    let len: number;
    try {
      len = doc.getCellParagraphLength(s, p, ci, cellIdx, cp);
    } catch {
      continue;
    }
    if (len === 0) {
      lines.push("");
      continue;
    }
    try {
      lines.push(doc.getTextInCell(s, p, ci, cellIdx, cp, 0, len));
    } catch {
      lines.push("");
    }
  }
  return lines.join("\n").trim();
}

export function walkTables(doc: HwpDocument): TableData[] {
  const out: TableData[] = [];
  const sectionCount = doc.getSectionCount();
  for (let s = 0; s < sectionCount; s++) {
    const paraCount = doc.getParagraphCount(s);
    for (let p = 0; p < paraCount; p++) {
      const n = controlCount(doc, s, p);
      for (let ci = 0; ci < n; ci++) {
        let dimsJson: string;
        try {
          dimsJson = doc.getTableDimensions(s, p, ci);
        } catch {
          continue;
        }
        if (!dimsJson || dimsJson === "null") continue;
        let dims: TableDims;
        try {
          dims = JSON.parse(dimsJson);
        } catch {
          continue;
        }
        const rows = Number(dims.rowCount ?? dims.rows ?? dims.row_count ?? 0);
        const cols = Number(dims.colCount ?? dims.cols ?? dims.col_count ?? 0);
        const cellCount = Number(dims.cellCount ?? dims.cell_count ?? rows * cols);
        if (rows === 0 || cols === 0) continue;
        // Tables with merged cells report cellCount < rows*cols. Walk by
        // cellCount instead of grid; place by getCellInfo (row, col, span).
        const cells: string[][] = Array.from({ length: rows }, () => Array(cols).fill(""));
        for (let cellIdx = 0; cellIdx < cellCount; cellIdx++) {
          let row = 0,
            col = 0;
          try {
            const info = JSON.parse(doc.getCellInfo(s, p, ci, cellIdx));
            row = Number(info.row ?? info.r ?? 0);
            col = Number(info.col ?? info.c ?? 0);
          } catch {
            row = Math.floor(cellIdx / cols);
            col = cellIdx % cols;
          }
          if (row >= rows || col >= cols) continue;
          cells[row][col] = readCellText(doc, s, p, ci, cellIdx);
        }
        out.push({ rows, cols, cells });
      }
    }
  }
  return out;
}

function escapeMd(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export interface ImageRef {
  section: number;
  paragraph: number;
  controlIdx: number;
  mime: string;
  byteLength: number;
  ext: string;
}

function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("gif")) return "gif";
  if (m.includes("bmp")) return "bmp";
  if (m.includes("svg")) return "svg";
  if (m.includes("webp")) return "webp";
  if (m.includes("emf")) return "emf";
  if (m.includes("wmf")) return "wmf";
  return "bin";
}

export function walkImages(doc: HwpDocument): ImageRef[] {
  const out: ImageRef[] = [];
  const sectionCount = doc.getSectionCount();
  for (let s = 0; s < sectionCount; s++) {
    const paraCount = doc.getParagraphCount(s);
    for (let p = 0; p < paraCount; p++) {
      const n = controlCount(doc, s, p);
      for (let ci = 0; ci < n; ci++) {
        let mime: string;
        try {
          mime = doc.getControlImageMime(s, p, ci);
        } catch {
          continue;
        }
        if (!mime) continue;
        let bytes: Uint8Array;
        try {
          bytes = doc.getControlImageData(s, p, ci);
        } catch {
          continue;
        }
        out.push({
          section: s,
          paragraph: p,
          controlIdx: ci,
          mime,
          byteLength: bytes.byteLength,
          ext: extFromMime(mime),
        });
      }
    }
  }
  return out;
}

export function getImageBytes(doc: HwpDocument, ref: ImageRef): Uint8Array {
  return doc.getControlImageData(ref.section, ref.paragraph, ref.controlIdx);
}

export function tableToMarkdown(t: TableData): string {
  if (t.rows === 0 || t.cols === 0) return "";
  const [header, ...rest] = t.cells;
  const lines: string[] = [];
  lines.push("| " + header.map(escapeMd).join(" | ") + " |");
  lines.push("| " + Array(t.cols).fill("---").join(" | ") + " |");
  for (const row of rest) {
    lines.push("| " + row.map(escapeMd).join(" | ") + " |");
  }
  return lines.join("\n");
}
