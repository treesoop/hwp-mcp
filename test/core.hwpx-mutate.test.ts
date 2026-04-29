import { describe, it, expect, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mutateHwpxText } from "../src/core/hwpx-mutate.js";
import { closeDocument, openDocument, walkText } from "../src/core/document.js";

const tmp = join(tmpdir(), `hwp-mcp-mutate-${process.pid}.hwpx`);

afterEach(() => {
  if (existsSync(tmp)) rmSync(tmp);
});

describe("mutateHwpxText", () => {
  it("replaces text in section*.xml and round-trips via rhwp read", async () => {
    const r = await mutateHwpxText("test/fixtures/text_only.hwpx", tmp, {
      "hwpx 텍스트.": "변경된 텍스트.",
    });
    expect(r.total).toBe(1);
    expect(r.perKey["hwpx 텍스트."]).toBe(1);
    const doc = await openDocument(tmp);
    expect(walkText(doc)).toContain("변경된 텍스트.");
    closeDocument(doc);
  });

  it("reports 0 for missing keys and still saves the file", async () => {
    const r = await mutateHwpxText("test/fixtures/text_only.hwpx", tmp, {
      "이건 없음": "x",
    });
    expect(r.total).toBe(0);
    expect(r.perKey["이건 없음"]).toBe(0);
    expect(existsSync(tmp)).toBe(true);
  });
});
