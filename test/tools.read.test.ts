import { describe, it, expect } from "vitest";
import { readHwp, readHwpText, readHwpTables } from "../src/tools/read.js";

describe("readHwpText", () => {
  it("returns body text from simple.hwp", async () => {
    const out = await readHwpText({ file_path: "test/fixtures/simple.hwp" });
    expect(out).toContain("안녕하세요 hwp-mcp.");
  });

  it("returns Korean error when file is missing", async () => {
    const out = await readHwpText({ file_path: "/no/such/file.hwp" });
    expect(out).toMatch(/파일을 찾을 수 없습니다|not found/);
  });
});

describe("readHwpTables", () => {
  it("returns markdown for the table in simple.hwp", async () => {
    const out = await readHwpTables({ file_path: "test/fixtures/simple.hwp" });
    expect(out).toContain("표 1");
    expect(out).toContain("| 이름 | 회사 |");
    expect(out).toContain("| 남대현 | 포텐랩 |");
  });

  it("returns 'no tables' for empty.hwp", async () => {
    const out = await readHwpTables({ file_path: "test/fixtures/empty.hwp" });
    expect(out).toMatch(/표가 없습니다|no tables/);
  });
});

describe("readHwp", () => {
  it("returns combined output with stats header, body, table, and image listing", async () => {
    const out = await readHwp({ file_path: "test/fixtures/simple.hwp" });
    expect(out).toContain("# simple.hwp");
    expect(out).toContain("형식: .HWP");
    expect(out).toContain("안녕하세요 hwp-mcp.");
    expect(out).toContain("| 이름 | 회사 |");
    expect(out).toContain("## 포함된 이미지");
  });
});
