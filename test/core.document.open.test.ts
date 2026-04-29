import { describe, it, expect } from "vitest";
import { openDocument, closeDocument } from "../src/core/document.js";

describe("openDocument", () => {
  it("opens an .hwpx file and reports its section count", async () => {
    const doc = await openDocument("test/fixtures/simple.hwp");
    expect(doc.getSectionCount()).toBeGreaterThanOrEqual(1);
    closeDocument(doc);
  });

  it("rejects unsupported extensions", async () => {
    await expect(
      openDocument("test/fixtures/build-fixtures.ts")
    ).rejects.toThrow(/Unsupported|지원하지 않는/);
  });

  it("rejects non-existent files", async () => {
    await expect(
      openDocument("test/fixtures/does-not-exist.hwpx")
    ).rejects.toThrow(/not found|찾을 수 없습니다/);
  });
});
