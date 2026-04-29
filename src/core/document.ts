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
