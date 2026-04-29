import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initRhwp } from "../../src/core/wasm-init.js";
import { HwpDocument } from "@rhwp/core";

const FIX_DIR = dirname(fileURLToPath(import.meta.url));
mkdirSync(FIX_DIR, { recursive: true });

// 1x1 red PNG (67 bytes), used for image fixture.
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
  "base64"
);

await initRhwp();

function build(label: string, configure: (doc: HwpDocument) => void, exportFn: "hwp" | "hwpx") {
  const doc = HwpDocument.createEmpty();
  doc.createBlankDocument();
  configure(doc);
  const bytes = exportFn === "hwp" ? doc.exportHwp() : doc.exportHwpx();
  doc.free();
  const out = resolve(FIX_DIR, label);
  writeFileSync(out, bytes);
  console.log(`wrote ${out} ${bytes.byteLength}B`);
}

// simple.hwp — text + 2x2 table + 1 image
build("simple.hwp", (doc) => {
  doc.insertText(0, 0, 0, "안녕하세요 hwp-mcp.");
  const ct = JSON.parse(doc.createTable(0, 0, doc.getParagraphLength(0, 0), 2, 2));
  const cells: [number, string][] = [
    [0, "이름"], [1, "회사"],
    [2, "남대현"], [3, "포텐랩"],
  ];
  for (const [idx, txt] of cells) {
    doc.insertTextInCell(0, ct.paraIdx, ct.controlIdx, idx, 0, 0, txt);
  }
  const lastP = doc.getParagraphCount(0) - 1;
  doc.insertPicture(
    0, lastP, doc.getParagraphLength(0, lastP),
    new Uint8Array(PNG_BYTES),
    100, 100, 1, 1, "png", "sample"
  );
}, "hwp");

// empty.hwp — minimal document, no body text, no table, no image
build("empty.hwp", (_doc) => { /* createBlankDocument is enough */ }, "hwp");

// template.hwp — body text with {{placeholders}} only
build("template.hwp", (doc) => {
  doc.insertText(0, 0, 0, "안녕하세요 {{name}}님, {{company}}에서 보낸 메시지입니다.");
}, "hwp");

// text_only.hwpx — text-only .hwpx (used to verify .hwpx round-trip and cross-format-reject)
build("text_only.hwpx", (doc) => {
  doc.insertText(0, 0, 0, "hwpx 텍스트.");
}, "hwpx");
