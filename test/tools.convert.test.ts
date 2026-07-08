import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertHwpMarkdown, flowToMarkdown } from "../src/tools/convert.js";
import type { FlowBlock } from "../src/core/document.js";

const placeholder = () => "[image: png, 67B]";

describe("flowToMarkdown", () => {
  it("renders paragraphs, headings, tables, equations in order", () => {
    const blocks: FlowBlock[] = [
      { kind: "para", text: "제목", headingLevel: 1 },
      { kind: "para", text: "본문 문단." },
      {
        kind: "table",
        table: { rows: 2, cols: 2, cells: [["이름", "회사"], ["남대현", "포텐랩"]] },
      },
      { kind: "equation", script: "a^2 + b^2 = c^2" },
    ];
    const md = flowToMarkdown(blocks, [], { imageRenderer: placeholder });
    expect(md).toBe(
      [
        "# 제목",
        "",
        "본문 문단.",
        "",
        "| 이름 | 회사 |",
        "| --- | --- |",
        "| 남대현 | 포텐랩 |",
        "",
        "$a^2 + b^2 = c^2$",
      ].join("\n")
    );
  });

  it("skips empty paragraphs", () => {
    const blocks: FlowBlock[] = [
      { kind: "para", text: "하나" },
      { kind: "para", text: "" },
      { kind: "para", text: "" },
      { kind: "para", text: "둘" },
    ];
    const md = flowToMarkdown(blocks, [], { imageRenderer: placeholder });
    expect(md).toBe("하나\n\n둘");
  });

  it("renders images via imageRenderer with running index", () => {
    const blocks: FlowBlock[] = [
      { kind: "image", ref: { section: 0, paragraph: 0, controlIdx: 0, mime: "image/png", byteLength: 67, ext: "png" } },
      { kind: "image", ref: { section: 0, paragraph: 1, controlIdx: 0, mime: "image/jpeg", byteLength: 100, ext: "jpg" } },
    ];
    const seen: number[] = [];
    const md = flowToMarkdown(blocks, [], {
      imageRenderer: (ref, i) => {
        seen.push(i);
        return `![img_${String(i + 1).padStart(3, "0")}](x/img_${String(i + 1).padStart(3, "0")}.${ref.ext})`;
      },
    });
    expect(seen).toEqual([0, 1]);
    expect(md).toContain("![img_001](x/img_001.png)");
    expect(md).toContain("![img_002](x/img_002.jpg)");
  });

  it("appends footnotes at document end", () => {
    const md = flowToMarkdown(
      [{ kind: "para", text: "본문" }],
      [
        { section: 0, paragraph: 0, controlIdx: 0, number: 1, text: "첫 각주" },
        { section: 0, paragraph: 1, controlIdx: 0, number: 2, text: "둘째 각주" },
      ],
      { imageRenderer: placeholder }
    );
    expect(md).toBe("본문\n\n---\n\n[^1]: 첫 각주\n[^2]: 둘째 각주");
  });
});

describe("convertHwpMarkdown", () => {
  it("string mode: returns markdown with table in place and image placeholder", async () => {
    const md = await convertHwpMarkdown({ file_path: "test/fixtures/simple.hwp" });
    const textPos = md.indexOf("안녕하세요 hwp-mcp.");
    const tablePos = md.indexOf("| 이름 | 회사 |");
    const imgPos = md.search(/\[image: png, \d+(\.\d+)?(B|KB)\]/);
    expect(textPos).toBeGreaterThanOrEqual(0);
    expect(tablePos).toBeGreaterThan(textPos);
    expect(imgPos).toBeGreaterThan(tablePos);
    expect(md).toContain("| 남대현 | 포텐랩 |");
  });

  it("string mode: renders equations inline for with_equation.hwp", async () => {
    const md = await convertHwpMarkdown({ file_path: "test/fixtures/with_equation.hwp" });
    expect(md).toMatch(/\$.+\$/);
  });

  it("file mode: writes md + extracts images with relative links", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hwpmd-"));
    const out = join(dir, "simple.md");
    const result = await convertHwpMarkdown({
      file_path: "test/fixtures/simple.hwp",
      output_path: out,
    });
    expect(result).toContain(out);
    const md = readFileSync(out, "utf8");
    expect(md).toContain("![img_001](simple_images/img_001.png)");
    expect(existsSync(join(dir, "simple_images", "img_001.png"))).toBe(true);
    expect(readdirSync(join(dir, "simple_images"))).toEqual(["img_001.png"]);
  });

  it("file mode: honors custom image_dir with correct relative link", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hwpmd-"));
    const out = join(dir, "doc.md");
    const imgDir = join(dir, "assets");
    await convertHwpMarkdown({
      file_path: "test/fixtures/simple.hwp",
      output_path: out,
      image_dir: imgDir,
    });
    const md = readFileSync(out, "utf8");
    expect(md).toContain("![img_001](assets/img_001.png)");
    expect(existsSync(join(imgDir, "img_001.png"))).toBe(true);
  });

  it("returns Korean error for missing file", async () => {
    const md = await convertHwpMarkdown({ file_path: "/no/such.hwp" });
    expect(md).toMatch(/파일을 찾을 수 없습니다|not found/);
  });

  it("handles empty document", async () => {
    const md = await convertHwpMarkdown({ file_path: "test/fixtures/empty.hwp" });
    expect(md).toMatch(/비어|empty/);
  });
});
