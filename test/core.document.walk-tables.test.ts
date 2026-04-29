import { describe, it, expect } from "vitest";
import { openDocument, closeDocument, walkTables, tableToMarkdown } from "../src/core/document.js";

describe("walkTables", () => {
  it("finds the 2x2 table with known cell text", async () => {
    const doc = await openDocument("test/fixtures/simple.hwp");
    const tables = walkTables(doc);
    expect(tables).toHaveLength(1);
    const t = tables[0];
    expect(t.rows).toBe(2);
    expect(t.cols).toBe(2);
    expect(t.cells).toEqual([
      ["이름", "회사"],
      ["남대현", "포텐랩"],
    ]);
    closeDocument(doc);
  });

  it("renders a table to markdown with header row", () => {
    const md = tableToMarkdown({
      rows: 2,
      cols: 2,
      cells: [
        ["이름", "회사"],
        ["남대현", "포텐랩"],
      ],
    });
    expect(md).toContain("| 이름 | 회사 |");
    expect(md).toContain("| --- | --- |");
    expect(md).toContain("| 남대현 | 포텐랩 |");
  });
});
