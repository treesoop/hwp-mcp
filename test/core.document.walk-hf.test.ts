import { describe, it, expect } from "vitest";
import { openDocument, closeDocument, walkHeadersFooters, walkText } from "../src/core/document.js";

describe("walkHeadersFooters", () => {
  it("extracts both header and footer text from with_hf.hwp", async () => {
    const doc = await openDocument("test/fixtures/with_hf.hwp");
    const hfs = walkHeadersFooters(doc);
    const headerText = hfs.find((h) => h.kind === "header")?.text;
    const footerText = hfs.find((h) => h.kind === "footer")?.text;
    expect(headerText).toBe("회사 머리말 ABC");
    expect(footerText).toBe("꼬리말 XYZ");
    closeDocument(doc);
  });

  it("walkText surfaces header/footer in the combined dump", async () => {
    const doc = await openDocument("test/fixtures/with_hf.hwp");
    const t = walkText(doc);
    expect(t).toContain("--- headers ---");
    expect(t).toContain("회사 머리말 ABC");
    expect(t).toContain("--- footers ---");
    expect(t).toContain("꼬리말 XYZ");
    expect(t).toContain("본문 내용");
    closeDocument(doc);
  });
});
