import { describe, it, expect } from "vitest";
import { openDocument, closeDocument, walkEquations, walkText } from "../src/core/document.js";

describe("walkEquations", () => {
  it("extracts equation scripts from with_equation.hwp", async () => {
    const doc = await openDocument("test/fixtures/with_equation.hwp");
    const eqs = walkEquations(doc);
    expect(eqs.length).toBeGreaterThanOrEqual(1);
    expect(eqs[0].script).toMatch(/TIMES|LEFT|over/);
    closeDocument(doc);
  });

  it("walkText surfaces equations in the dump", async () => {
    const doc = await openDocument("test/fixtures/with_equation.hwp");
    const t = walkText(doc);
    expect(t).toContain("--- equations ---");
    expect(t).toContain("평점");
    closeDocument(doc);
  });
});
