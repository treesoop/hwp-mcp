import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { existsSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { replaceHwpImage, listHwpBinData } from "../src/tools/replace-image.js";
import {
  closeDocument,
  openDocument,
  walkImages,
  getImageBytes,
} from "../src/core/document.js";
import { initRhwp } from "../src/core/wasm-init.js";
import { HwpDocument } from "@rhwp/core";

const tmpFix = join(tmpdir(), `hwp-mcp-img-${process.pid}.hwpx`);
const tmpOut = join(tmpdir(), `hwp-mcp-img-out-${process.pid}.hwpx`);
const tmpPng = join(tmpdir(), `hwp-mcp-img-new-${process.pid}.png`);

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
  "base64"
);
// Pretend PNG #2 — 2-byte change so equality check is meaningful
const PNG2 = Buffer.from(PNG_BYTES);
PNG2[PNG2.length - 5] ^= 0x42;

beforeAll(async () => {
  // Build a .hwpx with one embedded image
  await initRhwp();
  const doc = HwpDocument.createEmpty();
  doc.createBlankDocument();
  doc.insertText(0, 0, 0, "이미지 테스트");
  doc.insertPicture(
    0, 0, doc.getParagraphLength(0, 0),
    new Uint8Array(PNG_BYTES),
    100, 100, 1, 1, "png", "img1"
  );
  // exportHwpx loses the picture, but we want the BinData entry to exist —
  // so use exportHwp() and then load it as raw HWPX is not possible. Instead,
  // we test against an .hwpx written by build-fixtures... but our existing
  // text_only.hwpx has no images. Synthesize one via direct ZIP:
  // simpler: use the user's real .hwpx? No — keep test self-contained.
  // Workaround: write one with insertPicture into a fresh .hwpx via ZIP-level
  // injection — but rhwp's exportHwpx drops pictures. So use a known
  // fixture-with-images: simple.hwp is .hwp not .hwpx.
  //
  // Solution: round-trip simple.hwp by reading it (rhwp), exportHwpx loses the
  // image. So we cannot easily get a small .hwpx with a BinData entry.
  //
  // Pragmatic workaround for tests: build a minimal .hwpx ZIP from scratch
  // with a fake BinData entry using JSZip, then test replace against that.
  doc.free();
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file("mimetype", "application/hwp+zip", { compression: "STORE" });
  zip.file("Contents/section0.xml", '<?xml version="1.0"?><hs:sec xmlns:hs="x"/>');
  zip.file("BinData/image1.png", PNG_BYTES);
  const out = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  writeFileSync(tmpFix, out);
  writeFileSync(tmpPng, PNG2);
});

afterEach(() => {
  if (existsSync(tmpOut)) rmSync(tmpOut);
});

describe("listHwpBinData", () => {
  it("lists BinData entries", async () => {
    const r = await listHwpBinData({ file_path: tmpFix });
    expect(r).toContain("BinData/image1.png");
  });
});

describe("replaceHwpImage", () => {
  it("replaces image bytes by basename", async () => {
    const r = await replaceHwpImage({
      file_path: tmpFix,
      target: "image1.png",
      source_path: tmpPng,
      output_path: tmpOut,
    });
    expect(r).toMatch(/교체 완료|replaced/);
    // Verify the bytes actually changed
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(readFileSync(tmpOut));
    const entry = await zip.file("BinData/image1.png")?.async("uint8array");
    expect(entry?.length).toBe(PNG2.length);
    expect(entry?.[entry.length - 5]).toBe(PNG2[PNG2.length - 5]);
  });

  it("reports an unknown target with a list of available entries", async () => {
    const r = await replaceHwpImage({
      file_path: tmpFix,
      target: "doesnotexist.png",
      source_path: tmpPng,
      output_path: tmpOut,
    });
    expect(r).toMatch(/찾지 못했습니다|target not found/);
    expect(r).toContain("BinData/image1.png");
  });

  it("rejects .hwp input", async () => {
    const r = await replaceHwpImage({
      file_path: "test/fixtures/simple.hwp",
      target: "x.png",
      source_path: tmpPng,
      output_path: tmpOut,
    });
    expect(r).toMatch(/\.hwpx|hwpx only/);
  });
});
