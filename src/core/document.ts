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
