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
  return lines.join("\n");
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
  const paraCount = doc.getCellParagraphCount(s, p, ci, cellIdx);
  const lines: string[] = [];
  for (let cp = 0; cp < paraCount; cp++) {
    const len = doc.getCellParagraphLength(s, p, ci, cellIdx, cp);
    lines.push(len === 0 ? "" : doc.getTextInCell(s, p, ci, cellIdx, cp, 0, len));
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
        if (rows === 0 || cols === 0) continue;
        const cells: string[][] = [];
        for (let r = 0; r < rows; r++) {
          const row: string[] = [];
          for (let c = 0; c < cols; c++) {
            row.push(readCellText(doc, s, p, ci, r * cols + c));
          }
          cells.push(row);
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
