import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initRhwp } from "../../src/core/wasm-init.js";
import { HwpDocument } from "@rhwp/core";

const FIX_DIR = dirname(fileURLToPath(import.meta.url));

async function buildSimpleHwpx() {
  await initRhwp();
  const doc = HwpDocument.createEmpty();
  // createEmpty produces a stub with 0 sections; load the embedded blank
  // template (saved/blank2010.hwp) so we have a usable section/paragraph.
  doc.createBlankDocument();
  doc.insertText(0, 0, 0, "안녕하세요 hwp-mcp.");
  const bytes = doc.exportHwpx();
  doc.free();
  const out = resolve(FIX_DIR, "simple.hwpx");
  mkdirSync(FIX_DIR, { recursive: true });
  writeFileSync(out, bytes);
  console.log("wrote", out, bytes.byteLength, "bytes");
}

await buildSimpleHwpx();
