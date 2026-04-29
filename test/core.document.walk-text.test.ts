import { describe, it, expect } from "vitest";
import { openDocument, closeDocument, walkText } from "../src/core/document.js";

describe("walkText", () => {
  it("returns the body text of simple.hwpx including the known sentence", async () => {
    const doc = await openDocument("test/fixtures/simple.hwp");
    const text = walkText(doc);
    expect(text).toContain("안녕하세요 hwp-mcp.");
    closeDocument(doc);
  });
});
