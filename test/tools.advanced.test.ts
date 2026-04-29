import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { existsSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendHwpTableColumn,
  deleteHwpTableColumn,
  insertHwpImage,
  applyHwpTextStyle,
} from "../src/tools/edit.js";
import { closeDocument, openDocument, walkText } from "../src/core/document.js";
import JSZip from "jszip";

const tmpHwpx = join(tmpdir(), `hwp-mcp-adv-${process.pid}.hwpx`);
const tmpOut = join(tmpdir(), `hwp-mcp-adv-out-${process.pid}.hwpx`);
const tmpPng = join(tmpdir(), `hwp-mcp-adv-png-${process.pid}.png`);

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
  "base64"
);

beforeAll(async () => {
  // Hand-built .hwpx with a 2x2 table and a charPr block in header.xml
  const zip = new JSZip();
  zip.file("mimetype", "application/hwp+zip", { compression: "STORE" });
  zip.file(
    "Contents/header.xml",
    '<?xml version="1.0"?><hh:head xmlns:hh="x" xmlns:hc="y">' +
      '<hh:charPrList><hh:charPr id="0" height="1000"><hc:color val="#000000"/></hh:charPr></hh:charPrList>' +
      '</hh:head>'
  );
  zip.file(
    "Contents/section0.xml",
    '<?xml version="1.0"?><hs:sec xmlns:hs="x" xmlns:hp="y">' +
      '<hp:p id="1" paraPrIDRef="0" styleIDRef="0">' +
      '<hp:run charPrIDRef="0"><hp:t>스타일 대상 텍스트</hp:t></hp:run>' +
      "</hp:p>" +
      '<hp:p id="2" paraPrIDRef="0" styleIDRef="0">' +
      '<hp:run charPrIDRef="0">' +
      '<hp:tbl id="100" rowCnt="2" colCnt="2">' +
      "<hp:tr>" +
      "<hp:tc><hp:t>A1</hp:t></hp:tc>" +
      "<hp:tc><hp:t>B1</hp:t></hp:tc>" +
      "</hp:tr>" +
      "<hp:tr>" +
      "<hp:tc><hp:t>A2</hp:t></hp:tc>" +
      "<hp:tc><hp:t>B2</hp:t></hp:tc>" +
      "</hp:tr>" +
      "</hp:tbl>" +
      "</hp:run>" +
      "</hp:p>" +
      "</hs:sec>"
  );
  zip.file(
    "Contents/content.hpf",
    '<?xml version="1.0"?><opf:package xmlns:opf="x">' +
      "<opf:manifest>" +
      '<opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>' +
      '<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>' +
      "</opf:manifest>" +
      "</opf:package>"
  );
  const out = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  writeFileSync(tmpHwpx, out);
  writeFileSync(tmpPng, PNG_BYTES);
});

afterEach(() => {
  if (existsSync(tmpOut)) rmSync(tmpOut);
});

describe("appendHwpTableColumn / deleteHwpTableColumn", () => {
  it("appends a column to every row of the table", async () => {
    const r = await appendHwpTableColumn({
      file_path: tmpHwpx,
      table_index: 0,
      cells: JSON.stringify(["C1", "C2"]),
      output_path: tmpOut,
    });
    expect(r).toMatch(/추가|appended/);
    const xml = await JSZip.loadAsync(readFileSync(tmpOut))
      .then((z) => z.file("Contents/section0.xml")!.async("string"));
    // Each row should now have 3 <hp:tc>
    const tcCount = (xml.match(/<hp:tc>/g) ?? []).length;
    expect(tcCount).toBe(6);
    expect(xml).toContain("C1");
    expect(xml).toContain("C2");
  });

  it("deletes column 0 from every row", async () => {
    const r = await deleteHwpTableColumn({
      file_path: tmpHwpx,
      table_index: 0,
      col_index: 0,
      output_path: tmpOut,
    });
    expect(r).toMatch(/삭제|deleted/);
    const xml = await JSZip.loadAsync(readFileSync(tmpOut))
      .then((z) => z.file("Contents/section0.xml")!.async("string"));
    const tcCount = (xml.match(/<hp:tc>/g) ?? []).length;
    expect(tcCount).toBe(2);
    expect(xml).not.toContain("A1");
    expect(xml).not.toContain("A2");
    expect(xml).toContain("B1");
    expect(xml).toContain("B2");
  });
});

describe("insertHwpImage", () => {
  it("inserts an image, registers in manifest, and adds <hp:pic> reference", async () => {
    const r = await insertHwpImage({
      file_path: tmpHwpx,
      source_path: tmpPng,
      ext: "png",
      output_path: tmpOut,
    });
    expect(r).toMatch(/삽입|inserted/);
    const zip = await JSZip.loadAsync(readFileSync(tmpOut));
    // BinData entry should exist
    const binEntries = Object.keys(zip.files).filter((n) => n.startsWith("BinData/"));
    expect(binEntries.length).toBeGreaterThanOrEqual(1);
    expect(binEntries.some((e) => e.endsWith(".png"))).toBe(true);
    // Manifest should reference the new item
    const hpf = await zip.file("Contents/content.hpf")!.async("string");
    expect(hpf).toMatch(/image\d\.png/);
    // Section should have new <hp:pic>
    const sec = await zip.file("Contents/section0.xml")!.async("string");
    expect(sec).toContain("<hp:pic ");
    expect(sec).toMatch(/binaryItemIDRef="image\d"/);
  });
});

describe("applyHwpParagraphStyle", () => {
  it("creates a new paraPr and retargets the Nth paragraph", async () => {
    const { applyHwpParagraphStyle } = await import("../src/tools/edit.js");
    // The fixture's section has paraPr id=0 in header.xml? It doesn't, so we
    // skip the strict header check by injecting one.
    const zip = await JSZip.loadAsync(readFileSync(tmpHwpx));
    const header = await zip.file("Contents/header.xml")!.async("string");
    if (!header.includes("<hh:paraPr")) {
      const augmented = header.replace(
        /<\/hh:head>/,
        '<hh:paraPrList><hh:paraPr id="0" align="LEFT" indent="0"/></hh:paraPrList></hh:head>'
      );
      zip.file("Contents/header.xml", augmented);
      const out = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
      writeFileSync(tmpHwpx, out);
    }
    const r = await applyHwpParagraphStyle({
      file_path: tmpHwpx,
      paragraph_index: 0,
      align: "CENTER",
      output_path: tmpOut,
    });
    expect(r).toMatch(/적용|applied/);
    const z2 = await JSZip.loadAsync(readFileSync(tmpOut));
    const h2 = await z2.file("Contents/header.xml")!.async("string");
    expect(h2).toContain('id="1"');
    const sec = await z2.file("Contents/section0.xml")!.async("string");
    expect(sec).toMatch(/paraPrIDRef="1"/);
  });
});

describe("insertHwpTable", () => {
  it("inserts a real OWPML table with header + 2 body rows", async () => {
    const { insertHwpTable } = await import("../src/tools/edit.js");
    const r = await insertHwpTable({
      file_path: tmpHwpx,
      headers: JSON.stringify(["이름", "역할"]),
      rows: JSON.stringify([["김철수", "CTO"], ["이영희", "PM"]]),
      output_path: tmpOut,
    });
    expect(r).toMatch(/삽입|inserted/);
    const z = await JSZip.loadAsync(readFileSync(tmpOut));
    const sec = await z.file("Contents/section0.xml")!.async("string");
    // We expect 2 tables now — the existing one + the new one
    const tblCount = (sec.match(/<hp:tbl /g) ?? []).length;
    expect(tblCount).toBeGreaterThanOrEqual(2);
    expect(sec).toContain("이름");
    expect(sec).toContain("김철수");
    expect(sec).toContain("이영희");
  });
});

describe("mergeHwpCellsHorizontal", () => {
  it("sets colSpan on the first cell and removes absorbed cells", async () => {
    const { mergeHwpCellsHorizontal } = await import("../src/tools/edit.js");
    const r = await mergeHwpCellsHorizontal({
      file_path: tmpHwpx,
      table_index: 0,
      row: 0,
      col_start: 0,
      col_count: 2,
      output_path: tmpOut,
    });
    expect(r).toMatch(/병합 완료|merged/);
    const z = await JSZip.loadAsync(readFileSync(tmpOut));
    const sec = await z.file("Contents/section0.xml")!.async("string");
    expect(sec).toMatch(/colSpan="2"/);
    // Row 0 originally had 2 <hp:tc>; after merge should have 1
    const firstTr = sec.match(/<hp:tr>[\s\S]*?<\/hp:tr>/)?.[0] ?? "";
    const tcInFirst = (firstTr.match(/<hp:tc/g) ?? []).length;
    expect(tcInFirst).toBe(1);
  });
});

describe("applyHwpTextStyle", () => {
  it("creates a new charPr and retargets the run carrying the target text", async () => {
    const r = await applyHwpTextStyle({
      file_path: tmpHwpx,
      target_text: "스타일 대상",
      color: "FF0000",
      bold: true,
      output_path: tmpOut,
    });
    expect(r).toMatch(/적용|applied/);
    const zip = await JSZip.loadAsync(readFileSync(tmpOut));
    const header = await zip.file("Contents/header.xml")!.async("string");
    // New charPr id=1 should exist
    expect(header).toContain('id="1"');
    expect(header).toContain('val="#FF0000"');
    expect(header).toContain('bold="1"');
    const sec = await zip.file("Contents/section0.xml")!.async("string");
    // The matching run should now point to charPrIDRef="1"
    expect(sec).toMatch(/charPrIDRef="1"[^>]*>[^<]*<hp:t>스타일 대상/);
  });

  it("reports target not found", async () => {
    const r = await applyHwpTextStyle({
      file_path: tmpHwpx,
      target_text: "이 문자열은 없음",
      color: "00FF00",
      output_path: tmpOut,
    });
    expect(r).toMatch(/찾지 못했습니다|not found/);
  });
});
