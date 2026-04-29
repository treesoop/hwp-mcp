import { describe, it, expect, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createHwpxDocument,
  fillHwpTemplate,
  replaceHwpText,
} from "../src/tools/write.js";
import {
  closeDocument,
  openDocument,
  walkText,
} from "../src/core/document.js";

const tmpReplace = join(tmpdir(), `hwp-mcp-replace-${process.pid}.hwpx`);
const tmpFill = join(tmpdir(), `hwp-mcp-fill-${process.pid}.hwpx`);
const tmpCreate = join(tmpdir(), `hwp-mcp-create-${process.pid}.hwpx`);

afterEach(() => {
  for (const f of [tmpReplace, tmpFill, tmpCreate]) {
    if (existsSync(f)) rmSync(f);
  }
});

describe("replaceHwpText", () => {
  it("replaces text in .hwpx and round-trips", async () => {
    const r = await replaceHwpText({
      file_path: "test/fixtures/text_only.hwpx",
      old_text: "hwpx 텍스트.",
      new_text: "이순신.",
      output_path: tmpReplace,
    });
    expect(r).toMatch(/1건|replaced 1/);
    expect(existsSync(tmpReplace)).toBe(true);
    const doc = await openDocument(tmpReplace);
    const text = walkText(doc);
    expect(text).toContain("이순신.");
    expect(text).not.toContain("hwpx 텍스트.");
    closeDocument(doc);
  });

  it("rejects cross-format save (.hwpx in, .hwp out)", async () => {
    const wrong = tmpReplace.replace(/\.hwpx$/, ".hwp");
    const r = await replaceHwpText({
      file_path: "test/fixtures/text_only.hwpx",
      old_text: "x",
      new_text: "y",
      output_path: wrong,
    });
    expect(r).toMatch(/크로스 포맷|cross-format/);
    expect(existsSync(wrong)).toBe(false);
  });

  it("rejects .hwp input with a v0.2 limitation message", async () => {
    const wrong = tmpReplace.replace(/\.hwpx$/, ".hwp");
    const r = await replaceHwpText({
      file_path: "test/fixtures/simple.hwp",
      old_text: "x",
      new_text: "y",
      output_path: wrong,
    });
    expect(r).toMatch(/v0\.2|\.hwpx만|hwpx only/);
  });
});

describe("fillHwpTemplate", () => {
  it("fills multiple keys via .hwpx mutation", async () => {
    // text_only.hwpx contains only "hwpx 텍스트."; we replace two substrings.
    const r = await fillHwpTemplate({
      file_path: "test/fixtures/text_only.hwpx",
      replacements: JSON.stringify({ "hwpx": "HWPX", "텍스트": "메시지" }),
      output_path: tmpFill,
    });
    expect(r).toMatch(/총 2건|2 replacements/);
    const doc = await openDocument(tmpFill);
    const text = walkText(doc);
    expect(text).toContain("HWPX");
    expect(text).toContain("메시지");
    closeDocument(doc);
  });

  it("returns parse error on invalid JSON", async () => {
    const r = await fillHwpTemplate({
      file_path: "test/fixtures/text_only.hwpx",
      replacements: "{not json",
      output_path: tmpFill,
    });
    expect(r).toMatch(/JSON|파싱/i);
  });
});

describe("createHwpxDocument", () => {
  it("creates a doc with text", async () => {
    const r = await createHwpxDocument({
      output_path: tmpCreate,
      content: JSON.stringify([
        { type: "text", text: "사원 명부" },
        { type: "text", text: "두 번째 줄" },
      ]),
    });
    expect(r).toMatch(/생성 완료|created/);
    expect(existsSync(tmpCreate)).toBe(true);
    const doc = await openDocument(tmpCreate);
    const text = walkText(doc);
    expect(text).toContain("사원 명부");
    expect(text).toContain("두 번째 줄");
    closeDocument(doc);
  });

  it("rejects non-.hwpx output paths", async () => {
    const wrong = tmpCreate.replace(/\.hwpx$/, ".hwp");
    const r = await createHwpxDocument({
      output_path: wrong,
      content: JSON.stringify([{ type: "text", text: "x" }]),
    });
    expect(r).toMatch(/\.hwpx|HWPX/);
  });
});
