import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendHwpParagraph,
  deleteHwpParagraph,
  appendHwpTableRow,
  deleteHwpImage,
} from "../src/tools/edit.js";
import { closeDocument, openDocument, walkText, walkTables } from "../src/core/document.js";
import { initRhwp } from "../src/core/wasm-init.js";
import { HwpDocument } from "@rhwp/core";
import JSZip from "jszip";

const tmpFix = join(tmpdir(), `hwp-mcp-edit-${process.pid}.hwpx`);
const tmpOut = join(tmpdir(), `hwp-mcp-edit-out-${process.pid}.hwpx`);

beforeAll(async () => {
  // Build a fixture .hwpx via rhwp (text round-trips fine in .hwpx).
  await initRhwp();
  const doc = HwpDocument.createEmpty();
  doc.createBlankDocument();
  doc.insertText(0, 0, 0, "원본 텍스트.");
  const bytes = doc.exportHwpx();
  doc.free();
  writeFileSync(tmpFix, bytes);
});

afterEach(() => {
  if (existsSync(tmpOut)) rmSync(tmpOut);
});

describe("appendHwpParagraph", () => {
  it("appends a new paragraph and the text round-trips through rhwp", async () => {
    const r = await appendHwpParagraph({
      file_path: tmpFix,
      text: "새 문단 추가됨",
      output_path: tmpOut,
    });
    expect(r).toMatch(/추가|appended/);
    const doc = await openDocument(tmpOut);
    const text = walkText(doc);
    expect(text).toContain("새 문단 추가됨");
    expect(text).toContain("원본 텍스트");
    closeDocument(doc);
  });

  it("rejects .hwp input", async () => {
    const r = await appendHwpParagraph({
      file_path: "test/fixtures/simple.hwp",
      text: "x",
      output_path: tmpOut,
    });
    expect(r).toMatch(/\.hwpx/);
  });
});

describe("deleteHwpParagraph", () => {
  it("deletes paragraph at index 0", async () => {
    // First append something so there are 2 paragraphs
    await appendHwpParagraph({
      file_path: tmpFix,
      text: "두 번째 문단",
      output_path: tmpOut,
    });
    const out2 = tmpOut.replace(".hwpx", "-2.hwpx");
    try {
      const r = await deleteHwpParagraph({
        file_path: tmpOut,
        index: 0,
        output_path: out2,
      });
      expect(r).toMatch(/삭제|deleted/);
    } finally {
      if (existsSync(out2)) rmSync(out2);
    }
  });

  it("reports out-of-range index", async () => {
    const r = await deleteHwpParagraph({
      file_path: tmpFix,
      index: 9999,
      output_path: tmpOut,
    });
    expect(r).toMatch(/범위|range/);
  });
});

describe("deleteHwpImage", () => {
  it("removes a BinData entry by basename", async () => {
    // Build a minimal .hwpx with an image entry
    const local = join(tmpdir(), `hwp-mcp-edit-img-${process.pid}.hwpx`);
    const zip = new JSZip();
    zip.file("mimetype", "application/hwp+zip", { compression: "STORE" });
    zip.file("Contents/section0.xml", '<?xml version="1.0"?><hs:sec xmlns:hs="x"><hp:p id="1"><hp:run><hp:t>x</hp:t></hp:run></hp:p></hs:sec>');
    zip.file("BinData/img1.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const out = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    writeFileSync(local, out);
    try {
      const r = await deleteHwpImage({
        file_path: local,
        target: "img1.png",
        output_path: tmpOut,
      });
      expect(r).toMatch(/삭제|deleted/);
      const z2 = await JSZip.loadAsync(require("node:fs").readFileSync(tmpOut));
      expect(z2.file("BinData/img1.png")).toBeNull();
    } finally {
      if (existsSync(local)) rmSync(local);
    }
  });
});
