# convert_hwp_markdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `convert_hwp_markdown` MCP tool that converts HWP/HWPX to Markdown preserving document flow order (tables in place as GFM, images extracted with relative links, equations inline, footnotes at end).

**Architecture:** A new core walker `walkDocumentFlow()` in `src/core/document.ts` emits ordered `FlowBlock[]` by iterating paragraphs and probing controls anchored at each paragraph (same probing pattern as existing `walkTables`/`walkImages`/`walkEquations`). A new tool file `src/tools/convert.ts` renders blocks to Markdown via a pure `flowToMarkdown()` function plus a thin IO wrapper that handles file output and image extraction. Registered in `src/server.ts`.

**Tech Stack:** TypeScript (ESM, `.js` import suffixes), `@rhwp/core` WASM, vitest, node:fs/node:path.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-08-convert-hwp-markdown-design.md`
- All tool functions return `Promise<string>`; errors are returned as bilingual Korean/English message strings, never thrown (match existing tools).
- Every rhwp probe call wrapped in try/catch and skipped on failure (best-effort).
- Always `try { … } finally { closeDocument(doc) }` after successful `openDocument`.
- Imports use `.js` suffix (ESM/NodeNext).
- Run tests with `npx vitest run <file>`.

**Verified API facts (probed 2026-07-08):**
- `doc.getStyleAt(s, p)` → JSON string `{"id":0,"name":"바탕글"}`. Style names include `"개요 1"`…`"개요 7"` (english `"Outline 1"`…).
- `simple.hwp` fixture: body text `안녕하세요 hwp-mcp.`, one 2x2 table (`이름/회사/남대현/포텐랩`), one PNG image. Table and image are anchored on different paragraphs; table para precedes image para.
- `with_equation.hwp`: contains equation control(s); `walkEquations` returns `script`.
- No footnote fixture exists — footnote rendering is covered by a pure-function unit test.

---

### Task 1: Core `walkDocumentFlow()` walker

**Files:**
- Modify: `src/core/document.ts` (append after `tableToMarkdown`, ~line 442)
- Test: `test/core.document.walk-flow.test.ts`

**Interfaces:**
- Consumes: existing internals of `document.ts` (`controlCount`, `readCellText`, `extFromMime`, `TableData`, `ImageRef`).
- Produces (used by Task 2/3):
  ```ts
  export type FlowBlock =
    | { kind: "para"; text: string; headingLevel?: number }
    | { kind: "table"; table: TableData }
    | { kind: "image"; ref: ImageRef }
    | { kind: "equation"; script: string };
  export function walkDocumentFlow(doc: HwpDocument): FlowBlock[];
  ```

- [ ] **Step 1: Write the failing test**

```ts
// test/core.document.walk-flow.test.ts
import { describe, it, expect } from "vitest";
import {
  closeDocument,
  openDocument,
  walkDocumentFlow,
} from "../src/core/document.js";

describe("walkDocumentFlow", () => {
  it("emits blocks in document order for simple.hwp (text, table, image)", async () => {
    const doc = await openDocument("test/fixtures/simple.hwp");
    try {
      const blocks = walkDocumentFlow(doc);
      const kinds = blocks.map((b) => b.kind);
      // text paragraph comes before table, table before image
      const textIdx = blocks.findIndex(
        (b) => b.kind === "para" && b.text.includes("안녕하세요 hwp-mcp.")
      );
      const tableIdx = kinds.indexOf("table");
      const imageIdx = kinds.indexOf("image");
      expect(textIdx).toBeGreaterThanOrEqual(0);
      expect(tableIdx).toBeGreaterThan(textIdx);
      expect(imageIdx).toBeGreaterThan(tableIdx);
      const table = blocks[tableIdx] as Extract<
        ReturnType<typeof walkDocumentFlow>[number],
        { kind: "table" }
      >;
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/core.document.walk-flow.test.ts`
Expected: FAIL — `walkDocumentFlow` is not exported.

- [ ] **Step 3: Implement `walkDocumentFlow` in `src/core/document.ts`**

Append after `tableToMarkdown` (end of file). Note: table/image/equation
probing per control index copies the probe pattern from the existing
walkers; the existing walkers stay untouched.

```ts
export type FlowBlock =
  | { kind: "para"; text: string; headingLevel?: number }
  | { kind: "table"; table: TableData }
  | { kind: "image"; ref: ImageRef }
  | { kind: "equation"; script: string };

const HEADING_RE = /(?:개요|Outline)\s*([1-7])/i;

function headingLevelAt(doc: HwpDocument, s: number, p: number): number | undefined {
  let raw: string;
  try {
    raw = doc.getStyleAt(s, p);
  } catch {
    return undefined;
  }
  if (!raw) return undefined;
  let name = "";
  try {
    const parsed = JSON.parse(raw) as { name?: string };
    name = parsed.name ?? "";
  } catch {
    name = raw;
  }
  const m = HEADING_RE.exec(name);
  if (!m) return undefined;
  return Math.min(Number(m[1]), 6);
}

function tableAt(doc: HwpDocument, s: number, p: number, ci: number): TableData | undefined {
  let dimsJson: string;
  try {
    dimsJson = doc.getTableDimensions(s, p, ci);
  } catch {
    return undefined;
  }
  if (!dimsJson || dimsJson === "null") return undefined;
  let dims: TableDims;
  try {
    dims = JSON.parse(dimsJson);
  } catch {
    return undefined;
  }
  const rows = Number(dims.rowCount ?? dims.rows ?? dims.row_count ?? 0);
  const cols = Number(dims.colCount ?? dims.cols ?? dims.col_count ?? 0);
  const cellCount = Number(dims.cellCount ?? dims.cell_count ?? rows * cols);
  if (rows === 0 || cols === 0) return undefined;
  const cells: string[][] = Array.from({ length: rows }, () => Array(cols).fill(""));
  for (let cellIdx = 0; cellIdx < cellCount; cellIdx++) {
    let row = 0,
      col = 0;
    try {
      const info = JSON.parse(doc.getCellInfo(s, p, ci, cellIdx));
      row = Number(info.row ?? info.r ?? 0);
      col = Number(info.col ?? info.c ?? 0);
    } catch {
      row = Math.floor(cellIdx / cols);
      col = cellIdx % cols;
    }
    if (row >= rows || col >= cols) continue;
    cells[row][col] = readCellText(doc, s, p, ci, cellIdx);
  }
  return { rows, cols, cells };
}

function imageAt(doc: HwpDocument, s: number, p: number, ci: number): ImageRef | undefined {
  let mime: string;
  try {
    mime = doc.getControlImageMime(s, p, ci);
  } catch {
    return undefined;
  }
  if (!mime) return undefined;
  let bytes: Uint8Array;
  try {
    bytes = doc.getControlImageData(s, p, ci);
  } catch {
    return undefined;
  }
  return {
    section: s,
    paragraph: p,
    controlIdx: ci,
    mime,
    byteLength: bytes.byteLength,
    ext: extFromMime(mime),
  };
}

function equationAt(doc: HwpDocument, s: number, p: number, ci: number): string | undefined {
  let raw: string;
  try {
    raw = doc.getEquationProperties(s, p, ci, 0, 0);
  } catch {
    return undefined;
  }
  if (!raw || !raw.includes("script")) return undefined;
  try {
    const parsed = JSON.parse(raw) as { script?: string };
    return parsed.script || undefined;
  } catch {
    return undefined;
  }
}

export function walkDocumentFlow(doc: HwpDocument): FlowBlock[] {
  const blocks: FlowBlock[] = [];
  const sectionCount = doc.getSectionCount();
  for (let s = 0; s < sectionCount; s++) {
    const paraCount = doc.getParagraphCount(s);
    for (let p = 0; p < paraCount; p++) {
      const len = doc.getParagraphLength(s, p);
      const text = len > 0 ? doc.getTextRange(s, p, 0, len) : "";
      const headingLevel = headingLevelAt(doc, s, p);
      blocks.push(
        headingLevel !== undefined
          ? { kind: "para", text, headingLevel }
          : { kind: "para", text }
      );
      const n = controlCount(doc, s, p);
      for (let ci = 0; ci < n; ci++) {
        const table = tableAt(doc, s, p, ci);
        if (table) {
          blocks.push({ kind: "table", table });
          continue;
        }
        const img = imageAt(doc, s, p, ci);
        if (img) {
          blocks.push({ kind: "image", ref: img });
          continue;
        }
        const script = equationAt(doc, s, p, ci);
        if (script) {
          blocks.push({ kind: "equation", script });
        }
      }
    }
  }
  return blocks;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/core.document.walk-flow.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Run full suite to check no regression**

Run: `npx vitest run`
Expected: all existing tests still PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/document.ts test/core.document.walk-flow.test.ts
git commit -m "feat(core): add walkDocumentFlow order-preserving walker"
```

---

### Task 2: Pure renderer `flowToMarkdown()`

**Files:**
- Create: `src/tools/convert.ts`
- Test: `test/tools.convert.test.ts` (renderer unit tests only in this task)

**Interfaces:**
- Consumes: `FlowBlock`, `TableData`, `tableToMarkdown`, `FootnoteRef` from `../core/document.js` (`FootnoteRef` has `{ number: number; text: string }` fields per document.ts:200).
- Produces (used by Task 3):
  ```ts
  export interface RenderOptions {
    // returns markdown replacement for an image block, in emit order (0-based)
    imageRenderer: (ref: ImageRef, index: number) => string;
  }
  export function flowToMarkdown(
    blocks: FlowBlock[],
    footnotes: FootnoteRef[],
    opts: RenderOptions
  ): string;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// test/tools.convert.test.ts
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

  it("skips empty paragraphs and clamps heading spacing", () => {
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
        { number: 1, text: "첫 각주" },
        { number: 2, text: "둘째 각주" },
      ],
      { imageRenderer: placeholder }
    );
    expect(md).toBe("본문\n\n---\n\n[^1]: 첫 각주\n[^2]: 둘째 각주");
  });
});
```

Note: if `FootnoteRef`'s actual field names differ from `{ number, text }`,
check `src/core/document.ts:200-206` and adjust the test literals to the real
interface — do not change the interface.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/tools.convert.test.ts`
Expected: FAIL — module `src/tools/convert.ts` does not exist.

- [ ] **Step 3: Implement renderer in `src/tools/convert.ts`**

```ts
import type { FlowBlock, FootnoteRef, ImageRef } from "../core/document.js";
import { tableToMarkdown } from "../core/document.js";

export interface RenderOptions {
  imageRenderer: (ref: ImageRef, index: number) => string;
}

export function flowToMarkdown(
  blocks: FlowBlock[],
  footnotes: FootnoteRef[],
  opts: RenderOptions
): string {
  const chunks: string[] = [];
  let imageIdx = 0;
  for (const b of blocks) {
    switch (b.kind) {
      case "para": {
        const text = b.text.trim();
        if (!text) continue;
        chunks.push(
          b.headingLevel !== undefined ? `${"#".repeat(b.headingLevel)} ${text}` : text
        );
        break;
      }
      case "table":
        chunks.push(tableToMarkdown(b.table));
        break;
      case "image":
        chunks.push(opts.imageRenderer(b.ref, imageIdx++));
        break;
      case "equation":
        chunks.push(`$${b.script}$`);
        break;
    }
  }
  if (footnotes.length > 0) {
    chunks.push("---");
    chunks.push(footnotes.map((f) => `[^${f.number}]: ${f.text}`).join("\n"));
  }
  return chunks.join("\n\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/tools.convert.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/convert.ts test/tools.convert.test.ts
git commit -m "feat(tools): add pure flowToMarkdown renderer"
```

---

### Task 3: `convertHwpMarkdown` tool (string + file modes)

**Files:**
- Modify: `src/tools/convert.ts` (append)
- Modify: `test/tools.convert.test.ts` (append describe block)

**Interfaces:**
- Consumes: `walkDocumentFlow`, `walkFootnotes`, `getImageBytes`, `openDocument`, `closeDocument` from `../core/document.js`; `flowToMarkdown` from Task 2.
- Produces (used by Task 4):
  ```ts
  export interface ConvertArgs {
    file_path: string;
    output_path?: string;
    image_dir?: string;
  }
  export async function convertHwpMarkdown(args: ConvertArgs): Promise<string>;
  ```

- [ ] **Step 1: Write the failing tests (append to `test/tools.convert.test.ts`)**

```ts
import { convertHwpMarkdown } from "../src/tools/convert.js";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
```

- [ ] **Step 2: Run tests to verify new ones fail**

Run: `npx vitest run test/tools.convert.test.ts`
Expected: 4 renderer tests PASS, 6 new tests FAIL (`convertHwpMarkdown` not exported).

- [ ] **Step 3: Implement `convertHwpMarkdown` (append to `src/tools/convert.ts`)**

Add imports at top of file (merge with existing import from `../core/document.js`):

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import {
  closeDocument,
  getImageBytes,
  openDocument,
  tableToMarkdown,
  walkDocumentFlow,
  walkFootnotes,
} from "../core/document.js";
```

Append:

```ts
export interface ConvertArgs {
  file_path: string;
  output_path?: string;
  image_dir?: string;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}

function imgName(index: number, ext: string): string {
  return `img_${String(index + 1).padStart(3, "0")}.${ext}`;
}

export async function convertHwpMarkdown(args: ConvertArgs): Promise<string> {
  let doc;
  try {
    doc = await openDocument(args.file_path);
  } catch (e) {
    return (e as Error).message;
  }
  try {
    const blocks = walkDocumentFlow(doc);
    const footnotes = walkFootnotes(doc);

    if (!args.output_path) {
      const md = flowToMarkdown(blocks, footnotes, {
        imageRenderer: (ref) => `[image: ${ref.ext}, ${fmtSize(ref.byteLength)}]`,
      });
      return md.trim().length === 0 ? "(문서가 비어있습니다 / empty document)" : md;
    }

    const outPath = resolve(args.output_path);
    const outDir = dirname(outPath);
    const mdBase = basename(outPath, extname(outPath));
    const imageDir = args.image_dir
      ? resolve(args.image_dir)
      : join(outDir, `${mdBase}_images`);
    let imagesWritten = 0;

    const md = flowToMarkdown(blocks, footnotes, {
      imageRenderer: (ref, i) => {
        const name = imgName(i, ref.ext);
        try {
          const bytes = getImageBytes(doc, ref);
          mkdirSync(imageDir, { recursive: true });
          writeFileSync(join(imageDir, name), bytes);
          imagesWritten++;
        } catch {
          return `[image: ${ref.ext}, ${fmtSize(ref.byteLength)}]`;
        }
        const rel = relative(outDir, join(imageDir, name)) || name;
        return `![img_${String(i + 1).padStart(3, "0")}](${rel})`;
      },
    });

    mkdirSync(outDir, { recursive: true });
    writeFileSync(outPath, md, "utf8");
    return [
      `Markdown 저장 완료 (saved): ${outPath}`,
      `크기: ${Buffer.byteLength(md, "utf8")} bytes | 이미지: ${imagesWritten}개 (${imagesWritten > 0 ? imageDir : "없음"})`,
    ].join("\n");
  } catch (e) {
    return `변환 오류 (convert error): ${(e as Error).message}`;
  } finally {
    closeDocument(doc);
  }
}
```

Note: `tableToMarkdown` import is already used by `flowToMarkdown` from Task 2 — do not duplicate.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/tools.convert.test.ts`
Expected: PASS (10 tests). If the empty.hwp test fails because the blank
document produces stray whitespace-only output, verify `flowToMarkdown`
skips whitespace-only paragraphs (it trims) — the string-mode empty check
should then hold.

- [ ] **Step 5: Commit**

```bash
git add src/tools/convert.ts test/tools.convert.test.ts
git commit -m "feat(tools): add convertHwpMarkdown string/file modes"
```

---

### Task 4: Server registration + README

**Files:**
- Modify: `src/server.ts` (tool definition list + handler map)
- Modify: `README.md` (tools table)
- Test: existing `test/server.smoke.test.ts` (no new tests; smoke must pass)

**Interfaces:**
- Consumes: `convertHwpMarkdown`, `ConvertArgs` from `./tools/convert.js`.
- Produces: MCP tool name `convert_hwp_markdown`.

- [ ] **Step 1: Register tool definition in `src/server.ts`**

Add import near the other tool imports:

```ts
import { convertHwpMarkdown } from "./tools/convert.js";
```

Add to the tool definitions array (after the `read_hwp_tables` entry, ~line 70):

```ts
{
  name: "convert_hwp_markdown",
  description:
    "Convert an HWP/HWPX document to Markdown preserving document flow order: tables as GFM in place, images extracted with relative links, equations inline ($…$), footnotes at end. If output_path is omitted, the Markdown string is returned inline with image placeholders. Args: file_path, output_path (optional .md path), image_dir (optional, default <md name>_images/ next to output).",
  inputSchema: {
    type: "object",
    properties: {
      file_path: { type: "string" },
      output_path: { type: "string" },
      image_dir: { type: "string" },
    },
    required: ["file_path"],
  },
},
```

Add to the handler map (~line 514, alphabetical-ish near read handlers):

```ts
convert_hwp_markdown: convertHwpMarkdown,
```

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: all tests PASS (including server smoke test).

- [ ] **Step 3: Update README tools table**

Find the tools table in `README.md` (search for `read_hwp_tables`) and add a row following the existing format:

```markdown
| `convert_hwp_markdown` | HWP/HWPX → Markdown 변환 (문서 순서 유지, 표 GFM, 이미지 추출+상대링크, 수식 인라인) |
```

Match the actual column structure of the existing table when inserting.

- [ ] **Step 4: Typecheck build**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts README.md
git commit -m "feat: register convert_hwp_markdown MCP tool"
```
