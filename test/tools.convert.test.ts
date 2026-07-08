import { describe, it, expect } from "vitest";
import { flowToMarkdown } from "../src/tools/convert.js";
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
