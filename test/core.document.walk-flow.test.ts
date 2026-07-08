import { describe, it, expect } from "vitest";
import {
  closeDocument,
  openDocument,
  walkDocumentFlow,
  type FlowBlock,
} from "../src/core/document.js";

describe("walkDocumentFlow", () => {
  it("emits blocks in document order for simple.hwp (text, table, image)", async () => {
    const doc = await openDocument("test/fixtures/simple.hwp");
    try {
      const blocks = walkDocumentFlow(doc);
      const kinds = blocks.map((b) => b.kind);
      const textIdx = blocks.findIndex(
        (b) => b.kind === "para" && b.text.includes("안녕하세요 hwp-mcp.")
      );
      const tableIdx = kinds.indexOf("table");
      const imageIdx = kinds.indexOf("image");
      expect(textIdx).toBeGreaterThanOrEqual(0);
      expect(tableIdx).toBeGreaterThan(textIdx);
      expect(imageIdx).toBeGreaterThan(tableIdx);
      const table = blocks[tableIdx] as Extract<FlowBlock, { kind: "table" }>;
      expect(table.table.cells[0]).toEqual(["이름", "회사"]);
    } finally {
      closeDocument(doc);
    }
  });

  it("emits equation blocks for with_equation.hwp", async () => {
    const doc = await openDocument("test/fixtures/with_equation.hwp");
    try {
      const blocks = walkDocumentFlow(doc);
      const eq = blocks.find((b) => b.kind === "equation");
      expect(eq).toBeDefined();
      expect((eq as { script: string }).script.length).toBeGreaterThan(0);
    } finally {
      closeDocument(doc);
    }
  });

  it("does not set headingLevel for 바탕글 paragraphs", async () => {
    const doc = await openDocument("test/fixtures/simple.hwp");
    try {
      const blocks = walkDocumentFlow(doc);
      for (const b of blocks) {
        if (b.kind === "para") expect(b.headingLevel).toBeUndefined();
      }
    } finally {
      closeDocument(doc);
    }
  });
});
