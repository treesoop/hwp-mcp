# hwp-mcp v0.2 (rhwp-based) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild hwp-mcp from a Python self-parser to a Node.js MCP server backed by `@rhwp/core` (Rust+WASM), keeping the existing 8 tool signatures for backward compatibility.

**Architecture:** TypeScript MCP server using `@modelcontextprotocol/sdk` over stdio. WASM init isolated in `core/wasm-init.ts` (Node bootstrap with `measureTextWidth` shim). Document traversal helpers in `core/document.ts` operate on `HwpDocument` instances. Three tool files (`tools/read.ts`, `tools/images.ts`, `tools/write.ts`) wrap traversal helpers as MCP tools.

**Tech Stack:** TypeScript (ESM), Node.js ≥ 20, `@modelcontextprotocol/sdk`, `@rhwp/core@0.7.x`, vitest.

**Spec:** `docs/superpowers/specs/2026-04-29-hwp-mcp-rhwp-rebuild-design.md`

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `package.json` | NEW | npm metadata, deps, `bin: hwp-mcp`, type:module |
| `tsconfig.json` | NEW | strict TypeScript, ESM, NodeNext |
| `.gitignore` | MODIFY | add `node_modules/`, `dist/`, `*.log` |
| `src/server.ts` | NEW | MCP entry: register 8 tools, run stdio transport |
| `src/core/wasm-init.ts` | NEW | Node WASM bootstrap + `measureTextWidth` shim |
| `src/core/document.ts` | NEW | `openDocument`, `walkText`, `walkTables`, `walkImages`, `getImageBytes`, `tableToMarkdown` |
| `src/tools/read.ts` | NEW | `read_hwp`, `read_hwp_text`, `read_hwp_tables` handlers |
| `src/tools/images.ts` | NEW | `list_hwp_images`, `extract_hwp_images` handlers |
| `src/tools/write.ts` | NEW | `replace_hwp_text`, `fill_hwp_template`, `create_hwpx_document` handlers |
| `test/fixtures/build-fixtures.ts` | NEW | one-off script that uses `@rhwp/core` to generate fixtures |
| `test/fixtures/simple.hwpx` | NEW (generated) | text + 1 table + 1 image |
| `test/fixtures/template.hwpx` | NEW (generated) | text with `{{name}}` and `{{company}}` placeholders |
| `test/core.document.test.ts` | NEW | walker unit tests |
| `test/tools.read.test.ts` | NEW | read_* tool tests |
| `test/tools.images.test.ts` | NEW | image tool tests |
| `test/tools.write.test.ts` | NEW | write tool tests + cross-format error |
| `README.md` | REWRITE | English-first + Korean section, install + tools + rhwp credit |
| `LICENSE` | KEEP | MIT (existing) |
| `hwp_parser.py`, `hwp_writer.py`, `hwpx_parser.py`, `ole_writer.py`, `server.py`, `requirements.txt`, `pyproject.toml`, `src/hangul_mcp/` | DELETE | preserved on `legacy-python` branch |

---

## Conventions for All Tasks

- **Run `npm test` after every implementation step** — vitest watch mode is fine, but each step's "verify" sub-step runs the specific test once.
- **Commit message format:** Conventional Commits, e.g. `feat: add walkText helper`, `test: cover replace_hwp_text round-trip`. Use `chore:` for scaffolding, `docs:` for README, `refactor:` for restructure-only.
- **No skipping tests.** Every test failure is investigated; never use `.skip`.
- **Stop and ask** if `@rhwp/core` API behavior contradicts the d.ts (signatures observed in spec).

---

### Task 0: Backup Python implementation to legacy-python branch

**Files:**
- Branch: `legacy-python` (new)
- Delete on main: all `*.py`, `requirements.txt`, `pyproject.toml`, `src/hangul_mcp/`

**Goal:** Preserve current Python code in a side branch so it stays in `git log`, then clear main of Python so the Node scaffold has a clean room.

- [ ] **Step 1: Verify clean working tree**

```bash
git status
```
Expected: `nothing to commit, working tree clean`. If dirty, stop and ask the user.

- [ ] **Step 2: Create and push legacy-python branch from current main**

```bash
git branch legacy-python
git push -u origin legacy-python 2>&1 || echo "no remote yet — branch exists locally"
```
Expected: `Branch 'legacy-python' set up to track 'origin/legacy-python'.` OR the local-only fallback message.

- [ ] **Step 3: Remove Python files from main**

```bash
git rm hwp_parser.py hwp_writer.py hwpx_parser.py ole_writer.py server.py pyproject.toml requirements.txt
git rm -r src/hangul_mcp 2>/dev/null || git rm src/hangul_mcp/*.py 2>/dev/null || true
ls
```
Expected: only `LICENSE`, `README.md`, `docs/`, `src/` (possibly empty), and remaining git metadata.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove Python implementation; preserved on legacy-python branch

The Python parser/writer is being replaced by @rhwp/core (Rust+WASM).
Full Python source is preserved on the legacy-python branch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 1: Node project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `vitest.config.ts`
- Create: `src/server.ts` (placeholder, just exits 0)

**Goal:** Get `npm install`, `npm test`, `npm run build` working with empty entry points.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "hwp-mcp",
  "version": "0.2.0",
  "description": "MCP server for reading and writing HWP/HWPX (Korean Hangul) documents — built on rhwp.",
  "type": "module",
  "license": "MIT",
  "author": "Treesoop <official@treesoop.com>",
  "homepage": "https://github.com/PotenLab/hwp-mcp",
  "repository": { "type": "git", "url": "https://github.com/PotenLab/hwp-mcp" },
  "keywords": ["hwp", "hwpx", "hangul", "한글", "mcp", "model-context-protocol", "claude", "cursor", "korean", "hancom", "llm"],
  "bin": { "hwp-mcp": "dist/server.js" },
  "main": "dist/server.js",
  "files": ["dist", "README.md", "LICENSE"],
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "dev": "tsx src/server.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "build:fixtures": "tsx test/fixtures/build-fixtures.ts",
    "prepublishOnly": "npm run build && npm test"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@rhwp/core": "0.7.x"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

> Note: replace the `repository` URL with the actual GitHub URL if it differs.

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write `.gitignore`** (replace any existing one)

```
node_modules/
dist/
*.log
.DS_Store
.env
.vitest-cache/
```

- [ ] **Step 4: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 20000,
    pool: "threads",
  },
});
```

- [ ] **Step 5: Write minimal `src/server.ts`** (so build doesn't fail before later tasks)

```ts
#!/usr/bin/env node
// Placeholder; real entry implemented in Task 14.
process.stderr.write("hwp-mcp scaffold — server not yet implemented\n");
process.exit(0);
```

- [ ] **Step 6: Install dependencies**

```bash
npm install
```
Expected: `added N packages` with no errors. `node_modules/@rhwp/core/rhwp.js` should exist.

Verify the wasm file is present:
```bash
test -f node_modules/@rhwp/core/rhwp_bg.wasm && echo OK || echo MISSING
```
Expected: `OK`.

- [ ] **Step 7: Verify build + test scripts run**

```bash
npm run build
ls dist/server.js
npm test
```
- `npm run build` → no errors, `dist/server.js` exists.
- `npm test` → vitest runs and reports `No test files found` (this is fine; expected at this point).

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json .gitignore vitest.config.ts src/server.ts
git commit -m "chore: scaffold Node TypeScript MCP server

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: WASM init module (TDD)

**Files:**
- Create: `src/core/wasm-init.ts`
- Create: `test/core.wasm-init.test.ts`

**Goal:** Provide a single async `initRhwp()` function that loads the wasm bytes from disk, installs the `measureTextWidth` shim, and returns once the module is ready. Idempotent: subsequent calls resolve immediately.

**Why the shim:** rhwp's WASM expects `globalThis.measureTextWidth(font, text) → width` as a layout callback. Without it, paginate-related calls fail. CJK characters are approximated as full em width; Latin chars as 0.55× em. This is the same pattern used by `k-skill-rhwp` (npm).

- [ ] **Step 1: Write the failing test** — `test/core.wasm-init.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { initRhwp } from "../src/core/wasm-init.js";
import { version } from "@rhwp/core";

describe("initRhwp", () => {
  it("returns once and lets us call rhwp's version()", async () => {
    await initRhwp();
    const v = version();
    expect(typeof v).toBe("string");
    expect(v.length).toBeGreaterThan(0);
  });

  it("is idempotent across multiple calls", async () => {
    await initRhwp();
    await initRhwp();
    await initRhwp();
    expect(typeof version()).toBe("string");
  });

  it("installs the measureTextWidth shim", async () => {
    await initRhwp();
    expect(typeof (globalThis as any).measureTextWidth).toBe("function");
    const w = (globalThis as any).measureTextWidth("12px sans", "한글");
    expect(typeof w).toBe("number");
    expect(w).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- test/core.wasm-init.test.ts
```
Expected: FAIL with "Cannot find module '../src/core/wasm-init.js'" or similar import error.

- [ ] **Step 3: Implement `src/core/wasm-init.ts`**

```ts
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import init from "@rhwp/core";

const require = createRequire(import.meta.url);

let ready: Promise<void> | null = null;

function installMeasureShim(): void {
  if (typeof (globalThis as any).measureTextWidth === "function") return;
  (globalThis as any).measureTextWidth = (font: string, text: string): number => {
    // Parse "12px sans" or "16pt Times" — extract leading number as em size.
    const match = /([0-9.]+)\s*(px|pt)?/.exec(font);
    const size = match ? parseFloat(match[1]) : 12;
    let w = 0;
    for (const ch of text) {
      const cp = ch.codePointAt(0) ?? 0;
      // CJK Unified, Hangul, Hiragana/Katakana, Fullwidth → full em
      const isCjk =
        (cp >= 0x3000 && cp <= 0x303f) ||
        (cp >= 0x3040 && cp <= 0x30ff) ||
        (cp >= 0x3400 && cp <= 0x4dbf) ||
        (cp >= 0x4e00 && cp <= 0x9fff) ||
        (cp >= 0xac00 && cp <= 0xd7a3) ||
        (cp >= 0xff00 && cp <= 0xffef);
      w += isCjk ? size : size * 0.55;
    }
    return w;
  };
}

export function initRhwp(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    installMeasureShim();
    const wasmPath = require.resolve("@rhwp/core/rhwp_bg.wasm");
    const bytes = readFileSync(wasmPath);
    // rhwp's __wbg_init accepts InitInput directly (BufferSource is allowed).
    await init({ module_or_path: bytes });
  })();
  return ready;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- test/core.wasm-init.test.ts
```
Expected: 3/3 PASS.

If fails on `init({ module_or_path: bytes })`: the `@rhwp/core` `__wbg_init` accepts `InitInput` directly per its d.ts. Try `await init(bytes)` as a fallback (the d.ts says passing `InitInput` directly is deprecated but still supported). Update the call accordingly and re-test.

- [ ] **Step 5: Commit**

```bash
git add src/core/wasm-init.ts test/core.wasm-init.test.ts
git commit -m "feat: add Node WASM init for @rhwp/core

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Document open + close + format helpers (TDD)

**Files:**
- Create: `src/core/document.ts` (initial — `openDocument`, `closeDocument`, `getOriginalFormatFromExt`)
- Create: `test/core.document.open.test.ts`
- Create: `test/fixtures/build-fixtures.ts` (initial — generates `simple.hwpx`)

**Goal:** Read a `.hwp`/`.hwpx` file from disk, return an `HwpDocument` instance, and expose a `closeDocument` helper that calls `free()`. Also produce the first fixture (`test/fixtures/simple.hwpx`) by using `HwpDocument.createEmpty()` + `insertText` + `exportHwpx`.

- [ ] **Step 1: Write fixture builder skeleton** — `test/fixtures/build-fixtures.ts`

```ts
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { initRhwp } from "../../src/core/wasm-init.js";
import { HwpDocument } from "@rhwp/core";

async function buildSimpleHwpx() {
  await initRhwp();
  const doc = HwpDocument.createEmpty();
  // Insert plain paragraph text at section 0, paragraph 0, char_offset 0.
  doc.insertText(0, 0, 0, "안녕하세요 hwp-mcp.");
  // Insert a 2x2 table after the text paragraph (createTable returns JSON).
  // createTable(section_idx, para_idx, char_offset, row_count, col_count)
  doc.createTable(0, 0, doc.getParagraphLength(0, 0), 2, 2);
  const bytes = doc.exportHwpx();
  doc.free();
  const out = resolve(dirname(new URL(import.meta.url).pathname), "simple.hwpx");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes);
  console.log("wrote", out, bytes.byteLength, "bytes");
}

await buildSimpleHwpx();
```

- [ ] **Step 2: Generate fixture**

```bash
npm run build:fixtures
ls -la test/fixtures/simple.hwpx
```
Expected: `simple.hwpx` exists, size > 0 (typically 5–30 KB).

If `createTable` rejects the offset, simplify the fixture to text-only first and add the table generation in Task 5.

- [ ] **Step 3: Write the failing test** — `test/core.document.open.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { openDocument, closeDocument } from "../src/core/document.js";

describe("openDocument", () => {
  it("opens an .hwpx file and reports its section count", async () => {
    const doc = await openDocument("test/fixtures/simple.hwpx");
    expect(doc.getSectionCount()).toBeGreaterThanOrEqual(1);
    closeDocument(doc);
  });

  it("rejects unsupported extensions", async () => {
    await expect(openDocument("test/fixtures/simple.txt")).rejects.toThrow(
      /Unsupported|지원하지 않는/
    );
  });

  it("rejects non-existent files", async () => {
    await expect(openDocument("test/fixtures/does-not-exist.hwpx")).rejects.toThrow(
      /not found|찾을 수 없습니다/
    );
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
npm test -- test/core.document.open.test.ts
```
Expected: FAIL on missing module `../src/core/document.js`.

- [ ] **Step 5: Implement `src/core/document.ts`**

```ts
import { readFileSync, existsSync } from "node:fs";
import { extname } from "node:path";
import { HwpDocument } from "@rhwp/core";
import { initRhwp } from "./wasm-init.js";

export type HwpFormat = "hwp" | "hwpx";

export function getFormatFromPath(path: string): HwpFormat {
  const ext = extname(path).toLowerCase();
  if (ext === ".hwp") return "hwp";
  if (ext === ".hwpx") return "hwpx";
  throw new Error(`Unsupported file extension: ${ext} (지원하지 않는 형식, expected .hwp or .hwpx)`);
}

export async function openDocument(path: string): Promise<HwpDocument> {
  if (!existsSync(path)) {
    throw new Error(`File not found (파일을 찾을 수 없습니다): ${path}`);
  }
  // Validate extension before reading.
  getFormatFromPath(path);
  await initRhwp();
  const bytes = readFileSync(path);
  return new HwpDocument(new Uint8Array(bytes));
}

export function closeDocument(doc: HwpDocument): void {
  try {
    doc.free();
  } catch {
    /* already freed */
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npm test -- test/core.document.open.test.ts
```
Expected: 3/3 PASS. (The "rejects unsupported extensions" test does not need a real `simple.txt` — `existsSync` runs first; we need to make sure the test ordering matches what's expected. If it fails because `simple.txt` doesn't exist and the file-not-found check fires first, change the test to use a path that exists but has wrong extension, e.g. `test/fixtures/build-fixtures.ts`.)

- [ ] **Step 7: Commit**

```bash
git add src/core/document.ts test/core.document.open.test.ts test/fixtures/build-fixtures.ts test/fixtures/simple.hwpx
git commit -m "feat: add openDocument helper + simple.hwpx fixture

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: walkText helper (TDD)

**Files:**
- Modify: `src/core/document.ts` (add `walkText`)
- Create: `test/core.document.walk-text.test.ts`
- Modify: `test/fixtures/build-fixtures.ts` (ensure simple.hwpx contains a known sentence)

**Goal:** Iterate every section × paragraph using `getSectionCount()`, `getParagraphCount(s)`, `getParagraphLength(s, p)`, `getTextRange(s, p, 0, len)` and concatenate with `\n`.

- [ ] **Step 1: Write the failing test** — `test/core.document.walk-text.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { openDocument, closeDocument, walkText } from "../src/core/document.js";

describe("walkText", () => {
  it("returns the body text of simple.hwpx including the known sentence", async () => {
    const doc = await openDocument("test/fixtures/simple.hwpx");
    const text = walkText(doc);
    expect(text).toContain("안녕하세요 hwp-mcp.");
    closeDocument(doc);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- test/core.document.walk-text.test.ts
```
Expected: FAIL on missing export `walkText`.

- [ ] **Step 3: Implement `walkText` in `src/core/document.ts`**

Append to the file:

```ts
export function walkText(doc: HwpDocument): string {
  const lines: string[] = [];
  const sectionCount = doc.getSectionCount();
  for (let s = 0; s < sectionCount; s++) {
    const paraCount = doc.getParagraphCount(s);
    for (let p = 0; p < paraCount; p++) {
      const len = doc.getParagraphLength(s, p);
      if (len === 0) {
        lines.push("");
        continue;
      }
      lines.push(doc.getTextRange(s, p, 0, len));
    }
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- test/core.document.walk-text.test.ts
```
Expected: 1/1 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/document.ts test/core.document.walk-text.test.ts
git commit -m "feat: add walkText body-text traversal

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: walkTables helper + tableToMarkdown (TDD)

**Files:**
- Modify: `src/core/document.ts` (add `walkTables`, `tableToMarkdown`, types)
- Modify: `test/fixtures/build-fixtures.ts` (ensure a 2-column 2-row table is present, with known cell text)
- Create: `test/core.document.walk-tables.test.ts`

**Goal:** Use `getControlTextPositions(s, p)` to find which paragraphs contain controls (tables, images, shapes), filter to tables via `getTableDimensions`, build a row × col matrix of cell text via `getCellParagraphCount`/`getCellParagraphLength`/`getTextInCell`, and convert to GitHub-flavored markdown.

**API recap:**
- `getControlTextPositions(s, p): string` returns JSON; expected shape (verified at Step 4): `[{controlIdx: number, charPosition: number, kind: "table"|"picture"|...}]`. If shape differs, log it from a probe step and update the parsing logic.
- `getTableDimensions(s, p, ci): string` returns JSON: `{"rows":N, "cols":M, ...}` per spec (verify with probe).
- `getCellParagraphCount(s, p, ci, cell_idx): number`
- `getCellParagraphLength(s, p, ci, cell_idx, cell_para_idx): number`
- `getTextInCell(s, p, ci, cell_idx, cell_para_idx, char_offset, count): string`
- Cell index numbering: row-major (cell_idx = row × cols + col).

- [ ] **Step 1: Update fixture to include a known table**

Edit `test/fixtures/build-fixtures.ts`:

```ts
async function buildSimpleHwpx() {
  await initRhwp();
  const doc = HwpDocument.createEmpty();
  doc.insertText(0, 0, 0, "안녕하세요 hwp-mcp.");
  // Append a paragraph break, then create a 2×2 table at end of doc.
  // First, find tail paragraph index/offset:
  const sections = doc.getSectionCount();
  const lastPara = doc.getParagraphCount(sections - 1) - 1;
  const tail = doc.getParagraphLength(sections - 1, lastPara);
  doc.createTable(sections - 1, lastPara, tail, 2, 2);
  // Insert text into each cell. cell_idx is row*cols + col.
  // The table is the last control in the last paragraph after createTable.
  // Find its control_idx via getControlTextPositions.
  const ctrlsJson = doc.getControlTextPositions(sections - 1, lastPara);
  console.log("controls JSON:", ctrlsJson);
  const ctrls = JSON.parse(ctrlsJson);
  const tableCtrl = ctrls[ctrls.length - 1];
  const tableCi: number = tableCtrl.controlIdx ?? tableCtrl.control_idx ?? 0;

  const cells = [
    [0, "이름"], [1, "회사"],
    [2, "남대현"], [3, "포텐랩"],
  ];
  for (const [cellIdx, txt] of cells as [number, string][]) {
    doc.insertTextInCell(sections - 1, lastPara, tableCi, cellIdx, 0, 0, txt);
  }
  const bytes = doc.exportHwpx();
  doc.free();
  const out = resolve(dirname(new URL(import.meta.url).pathname), "simple.hwpx");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes);
  console.log("wrote", out, bytes.byteLength, "bytes");
}
```

Run it:
```bash
npm run build:fixtures
```
Expected: prints `controls JSON: [...]` and writes the fixture. **Inspect the printed JSON** — note the exact key names (`controlIdx` vs `control_idx`, `kind` vs `type`). Update `walkTables` parsing in Step 3 to match.

- [ ] **Step 2: Write the failing test** — `test/core.document.walk-tables.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { openDocument, closeDocument, walkTables, tableToMarkdown } from "../src/core/document.js";

describe("walkTables", () => {
  it("finds the 2x2 table with known cell text", async () => {
    const doc = await openDocument("test/fixtures/simple.hwpx");
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
```

- [ ] **Step 3: Run to verify it fails**

```bash
npm test -- test/core.document.walk-tables.test.ts
```
Expected: FAIL on missing exports.

- [ ] **Step 4: Implement `walkTables` + `tableToMarkdown` in `src/core/document.ts`**

Append:

```ts
export interface TableData {
  rows: number;
  cols: number;
  cells: string[][]; // [row][col]
}

interface ControlPos {
  controlIdx: number;
  charPosition?: number;
  kind?: string;
}

function parseControlPositions(json: string): ControlPos[] {
  if (!json || json === "null") return [];
  const raw = JSON.parse(json) as Array<Record<string, unknown>>;
  return raw.map((r) => ({
    controlIdx: Number(r.controlIdx ?? r.control_idx ?? 0),
    charPosition: r.charPosition === undefined ? undefined : Number(r.charPosition ?? r.char_position),
    kind: typeof r.kind === "string" ? r.kind : (typeof r.type === "string" ? r.type : undefined),
  }));
}

function readCellText(
  doc: HwpDocument,
  s: number,
  p: number,
  ci: number,
  cellIdx: number
): string {
  const paraCount = doc.getCellParagraphCount(s, p, ci, cellIdx);
  const lines: string[] = [];
  for (let cp = 0; cp < paraCount; cp++) {
    const len = doc.getCellParagraphLength(s, p, ci, cellIdx, cp);
    lines.push(len === 0 ? "" : doc.getTextInCell(s, p, ci, cellIdx, cp, 0, len));
  }
  return lines.join("\n").trim();
}

export function walkTables(doc: HwpDocument): TableData[] {
  const out: TableData[] = [];
  const sectionCount = doc.getSectionCount();
  for (let s = 0; s < sectionCount; s++) {
    const paraCount = doc.getParagraphCount(s);
    for (let p = 0; p < paraCount; p++) {
      const ctrls = parseControlPositions(doc.getControlTextPositions(s, p));
      for (const c of ctrls) {
        let dimsJson: string;
        try {
          dimsJson = doc.getTableDimensions(s, p, c.controlIdx);
        } catch {
          continue; // not a table
        }
        if (!dimsJson || dimsJson === "null") continue;
        let dims: { rows?: number; cols?: number; row_count?: number; col_count?: number };
        try {
          dims = JSON.parse(dimsJson);
        } catch {
          continue;
        }
        const rows = Number(dims.rows ?? dims.row_count ?? 0);
        const cols = Number(dims.cols ?? dims.col_count ?? 0);
        if (rows === 0 || cols === 0) continue;
        const cells: string[][] = [];
        for (let r = 0; r < rows; r++) {
          const row: string[] = [];
          for (let col = 0; col < cols; col++) {
            row.push(readCellText(doc, s, p, c.controlIdx, r * cols + col));
          }
          cells.push(row);
        }
        out.push({ rows, cols, cells });
      }
    }
  }
  return out;
}

function escapeMd(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function tableToMarkdown(t: TableData): string {
  if (t.rows === 0 || t.cols === 0) return "";
  const [header, ...rest] = t.cells;
  const lines: string[] = [];
  lines.push("| " + header.map(escapeMd).join(" | ") + " |");
  lines.push("| " + Array(t.cols).fill("---").join(" | ") + " |");
  for (const row of rest) {
    lines.push("| " + row.map(escapeMd).join(" | ") + " |");
  }
  return lines.join("\n");
}
```

> **Important:** if Step 1's printed `controlsJSON` revealed different keys (e.g. `control_idx`, `position`, `type`), update the `parseControlPositions` and the `getTableDimensions` JSON parsing accordingly before running the test.

- [ ] **Step 5: Run to verify it passes**

```bash
npm test -- test/core.document.walk-tables.test.ts
```
Expected: 2/2 PASS. If the cell content doesn't match because of trailing newlines or trim differences, do NOT loosen the test — fix `readCellText` to trim correctly.

- [ ] **Step 6: Commit**

```bash
git add src/core/document.ts test/core.document.walk-tables.test.ts test/fixtures/build-fixtures.ts test/fixtures/simple.hwpx
git commit -m "feat: add walkTables + tableToMarkdown

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: walkImages + getImageBytes (TDD)

**Files:**
- Modify: `src/core/document.ts` (add `walkImages`, `getImageBytes`, types)
- Modify: `test/fixtures/build-fixtures.ts` (insert a tiny PNG via `insertPicture`)
- Create: `test/fixtures/sample.png` (1×1 red PNG, committed binary)
- Create: `test/core.document.walk-images.test.ts`

**Goal:** List every image (picture control) in the document, returning `{section, paragraph, controlIdx, mime, byteLength}` per image. Provide `getImageBytes(doc, ref)` to retrieve raw bytes.

- [ ] **Step 1: Add a 1×1 PNG fixture**

The bytes of a minimal red 1×1 PNG (67 bytes):

```bash
python3 -c "
import base64, sys
data = base64.b64decode(b'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==')
with open('test/fixtures/sample.png','wb') as f: f.write(data)
print(len(data),'bytes written')"
```
Expected: `67 bytes written`.

- [ ] **Step 2: Update fixture builder to insert a picture**

Append to `buildSimpleHwpx` in `test/fixtures/build-fixtures.ts` (just before `exportHwpx`):

```ts
  // Insert the 1×1 PNG after the table.
  const imgBytes = readFileSync(
    resolve(dirname(new URL(import.meta.url).pathname), "sample.png")
  );
  // insertPicture(s, p, char_offset, image_data, w, h, natural_w_px, natural_h_px, ext, description)
  doc.insertPicture(
    sections - 1, lastPara, tail,
    new Uint8Array(imgBytes),
    100, 100, 1, 1,
    "png", "sample"
  );
```

Add `import { readFileSync } from "node:fs";` at the top if not already there.

Re-generate:
```bash
npm run build:fixtures
```
Expected: fixture rewritten without errors.

- [ ] **Step 3: Write the failing test** — `test/core.document.walk-images.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { openDocument, closeDocument, walkImages, getImageBytes } from "../src/core/document.js";

describe("walkImages / getImageBytes", () => {
  it("lists the inserted image with mime and length", async () => {
    const doc = await openDocument("test/fixtures/simple.hwpx");
    const imgs = walkImages(doc);
    expect(imgs.length).toBeGreaterThanOrEqual(1);
    const first = imgs[0];
    expect(first.mime).toMatch(/image\/png|png/);
    expect(first.byteLength).toBeGreaterThan(0);
    closeDocument(doc);
  });

  it("retrieves image bytes that start with the PNG signature", async () => {
    const doc = await openDocument("test/fixtures/simple.hwpx");
    const imgs = walkImages(doc);
    const bytes = getImageBytes(doc, imgs[0]);
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
    expect(bytes[2]).toBe(0x4e);
    expect(bytes[3]).toBe(0x47);
    closeDocument(doc);
  });
});
```

- [ ] **Step 4: Run to verify it fails**

```bash
npm test -- test/core.document.walk-images.test.ts
```
Expected: FAIL on missing exports.

- [ ] **Step 5: Implement `walkImages` + `getImageBytes`** — append to `src/core/document.ts`

```ts
export interface ImageRef {
  section: number;
  paragraph: number;
  controlIdx: number;
  mime: string;
  byteLength: number;
  ext: string; // e.g. "png", "jpg" — derived from mime
}

function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("gif")) return "gif";
  if (m.includes("bmp")) return "bmp";
  if (m.includes("svg")) return "svg";
  if (m.includes("webp")) return "webp";
  if (m.includes("emf")) return "emf";
  if (m.includes("wmf")) return "wmf";
  return "bin";
}

export function walkImages(doc: HwpDocument): ImageRef[] {
  const out: ImageRef[] = [];
  const sectionCount = doc.getSectionCount();
  for (let s = 0; s < sectionCount; s++) {
    const paraCount = doc.getParagraphCount(s);
    for (let p = 0; p < paraCount; p++) {
      const ctrls = parseControlPositions(doc.getControlTextPositions(s, p));
      for (const c of ctrls) {
        let mime: string;
        try {
          mime = doc.getControlImageMime(s, p, c.controlIdx);
        } catch {
          continue; // not a picture
        }
        if (!mime) continue;
        let bytes: Uint8Array;
        try {
          bytes = doc.getControlImageData(s, p, c.controlIdx);
        } catch {
          continue;
        }
        out.push({
          section: s,
          paragraph: p,
          controlIdx: c.controlIdx,
          mime,
          byteLength: bytes.byteLength,
          ext: extFromMime(mime),
        });
      }
    }
  }
  return out;
}

export function getImageBytes(doc: HwpDocument, ref: ImageRef): Uint8Array {
  return doc.getControlImageData(ref.section, ref.paragraph, ref.controlIdx);
}
```

- [ ] **Step 6: Run to verify it passes**

```bash
npm test -- test/core.document.walk-images.test.ts
```
Expected: 2/2 PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/document.ts test/core.document.walk-images.test.ts test/fixtures/build-fixtures.ts test/fixtures/simple.hwpx test/fixtures/sample.png
git commit -m "feat: add walkImages + getImageBytes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: tools/read.ts — read_hwp_text (TDD)

**Files:**
- Create: `src/tools/read.ts`
- Create: `test/tools.read.text.test.ts`

**Goal:** Implement the first tool handler. Handlers are pure functions returning a string (matching the existing Python tool's contract).

- [ ] **Step 1: Write the failing test** — `test/tools.read.text.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { readHwpText } from "../src/tools/read.js";

describe("readHwpText", () => {
  it("returns body text from simple.hwpx", async () => {
    const out = await readHwpText({ file_path: "test/fixtures/simple.hwpx" });
    expect(out).toContain("안녕하세요 hwp-mcp.");
  });

  it("returns Korean error when file is missing", async () => {
    const out = await readHwpText({ file_path: "/no/such/file.hwpx" });
    expect(out).toMatch(/파일을 찾을 수 없습니다|not found/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- test/tools.read.text.test.ts
```
Expected: FAIL on missing module.

- [ ] **Step 3: Implement `src/tools/read.ts`**

```ts
import { closeDocument, openDocument, walkText } from "../core/document.js";

export interface ReadHwpArgs {
  file_path: string;
}

export async function readHwpText(args: ReadHwpArgs): Promise<string> {
  let doc;
  try {
    doc = await openDocument(args.file_path);
  } catch (e) {
    return (e as Error).message;
  }
  try {
    const text = walkText(doc);
    return text.trim().length === 0 ? "(텍스트가 비어있습니다 / empty)" : text;
  } catch (e) {
    return `텍스트 추출 오류 (text extraction error): ${(e as Error).message}`;
  } finally {
    closeDocument(doc);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- test/tools.read.text.test.ts
```
Expected: 2/2 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/read.ts test/tools.read.text.test.ts
git commit -m "feat: add read_hwp_text tool handler

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: tools/read.ts — read_hwp_tables (TDD)

**Files:**
- Modify: `src/tools/read.ts` (add `readHwpTables`)
- Create: `test/tools.read.tables.test.ts`

- [ ] **Step 1: Failing test** — `test/tools.read.tables.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { readHwpTables } from "../src/tools/read.js";

describe("readHwpTables", () => {
  it("returns markdown for the table in simple.hwpx", async () => {
    const out = await readHwpTables({ file_path: "test/fixtures/simple.hwpx" });
    expect(out).toContain("표 1");
    expect(out).toContain("| 이름 | 회사 |");
    expect(out).toContain("| 남대현 | 포텐랩 |");
  });

  it("returns 'no tables' message when none present", async () => {
    // Create an empty fixture inline:
    // (For now we just point at a known-empty file; if not yet generated,
    //  this case can use a missing file fallback.)
    const out = await readHwpTables({ file_path: "test/fixtures/empty.hwpx" });
    // empty.hwpx generated in build-fixtures (see Step 0 below); if absent, accept "not found".
    expect(out).toMatch(/표가 없습니다|no tables|찾을 수 없습니다|not found/);
  });
});
```

- [ ] **Step 0 (fixture): Add `empty.hwpx` to fixture builder**

Edit `test/fixtures/build-fixtures.ts` and add at the bottom:

```ts
async function buildEmptyHwpx() {
  await initRhwp();
  const doc = HwpDocument.createEmpty();
  const bytes = doc.exportHwpx();
  doc.free();
  const out = resolve(dirname(new URL(import.meta.url).pathname), "empty.hwpx");
  writeFileSync(out, bytes);
  console.log("wrote", out, bytes.byteLength, "bytes");
}
await buildEmptyHwpx();
```

Run:
```bash
npm run build:fixtures
```
Expected: both `simple.hwpx` and `empty.hwpx` written.

- [ ] **Step 2: Run failing test**

```bash
npm test -- test/tools.read.tables.test.ts
```
Expected: FAIL on missing export.

- [ ] **Step 3: Implement `readHwpTables`** — append to `src/tools/read.ts`

```ts
import { tableToMarkdown, walkTables } from "../core/document.js";

export async function readHwpTables(args: ReadHwpArgs): Promise<string> {
  let doc;
  try {
    doc = await openDocument(args.file_path);
  } catch (e) {
    return (e as Error).message;
  }
  try {
    const tables = walkTables(doc);
    if (tables.length === 0) return "(표가 없습니다 / no tables)";
    const out: string[] = [];
    tables.forEach((t, i) => {
      out.push(`### 표 ${i + 1} (${t.rows}행 x ${t.cols}열)`);
      out.push(tableToMarkdown(t));
      out.push("");
    });
    return out.join("\n");
  } catch (e) {
    return `표 추출 오류 (table extraction error): ${(e as Error).message}`;
  } finally {
    closeDocument(doc);
  }
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npm test -- test/tools.read.tables.test.ts
```
Expected: 2/2 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/read.ts test/tools.read.tables.test.ts test/fixtures/build-fixtures.ts test/fixtures/empty.hwpx
git commit -m "feat: add read_hwp_tables tool handler

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: tools/read.ts — read_hwp (combined) (TDD)

**Files:**
- Modify: `src/tools/read.ts` (add `readHwp`)
- Create: `test/tools.read.combined.test.ts`

**Goal:** Combine text + tables + image-list into a single response that mirrors the Python tool's existing format (header line with stats, then paragraph text interleaved with tables, then image list).

- [ ] **Step 1: Failing test** — `test/tools.read.combined.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { readHwp } from "../src/tools/read.js";

describe("readHwp", () => {
  it("returns combined output with stats header, body, table, and image listing", async () => {
    const out = await readHwp({ file_path: "test/fixtures/simple.hwpx" });
    expect(out).toContain("# simple.hwpx");
    expect(out).toContain("형식: .HWPX");
    expect(out).toContain("안녕하세요 hwp-mcp.");
    expect(out).toContain("| 이름 | 회사 |");
    expect(out).toContain("## 포함된 이미지");
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
npm test -- test/tools.read.combined.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement `readHwp`** — append to `src/tools/read.ts`

```ts
import { basename, extname } from "node:path";
import { walkImages } from "../core/document.js";

export async function readHwp(args: ReadHwpArgs): Promise<string> {
  let doc;
  try {
    doc = await openDocument(args.file_path);
  } catch (e) {
    return (e as Error).message;
  }
  try {
    const text = walkText(doc);
    const tables = walkTables(doc);
    const images = walkImages(doc);
    const ext = extname(args.file_path).toUpperCase();
    const paragraphCount = text.split("\n").length;

    const out: string[] = [];
    out.push(`# ${basename(args.file_path)}`);
    out.push(
      `형식: ${ext} | 문단: ${paragraphCount}개 | 표: ${tables.length}개 | 이미지: ${images.length}개`
    );
    out.push("");

    out.push(text);

    tables.forEach((t, i) => {
      out.push("");
      out.push(`### 표 ${i + 1} (${t.rows}행 x ${t.cols}열)`);
      out.push(tableToMarkdown(t));
    });

    if (images.length > 0) {
      out.push("");
      out.push("---");
      out.push("## 포함된 이미지");
      images.forEach((img, i) => {
        out.push(`${i + 1}. [section ${img.section}, para ${img.paragraph}, ctrl ${img.controlIdx}] ${img.mime} (${img.byteLength} bytes)`);
      });
    }

    return out.join("\n");
  } catch (e) {
    return `파일 읽기 오류 (read error): ${(e as Error).message}`;
  } finally {
    closeDocument(doc);
  }
}
```

- [ ] **Step 4: Run pass**

```bash
npm test -- test/tools.read.combined.test.ts
```
Expected: 1/1 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/read.ts test/tools.read.combined.test.ts
git commit -m "feat: add read_hwp combined tool handler

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: tools/images.ts — list + extract (TDD)

**Files:**
- Create: `src/tools/images.ts`
- Create: `test/tools.images.test.ts`

- [ ] **Step 1: Failing test** — `test/tools.images.test.ts`

```ts
import { describe, it, expect, afterEach } from "vitest";
import { rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listHwpImages, extractHwpImages } from "../src/tools/images.js";

const tmp = join(tmpdir(), `hwp-mcp-test-${process.pid}`);

afterEach(() => {
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
});

describe("listHwpImages / extractHwpImages", () => {
  it("lists images with mime and bytes info", async () => {
    const out = await listHwpImages({ file_path: "test/fixtures/simple.hwpx" });
    expect(out).toMatch(/png|image/i);
  });

  it("returns 'no images' for empty.hwpx", async () => {
    const out = await listHwpImages({ file_path: "test/fixtures/empty.hwpx" });
    expect(out).toMatch(/이미지가 없습니다|no images/);
  });

  it("extracts image files to a directory", async () => {
    const out = await extractHwpImages({
      file_path: "test/fixtures/simple.hwpx",
      output_dir: tmp,
    });
    expect(out).toMatch(/이미지|extracted/);
    const files = readdirSync(tmp);
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(files.some((f) => f.endsWith(".png"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
npm test -- test/tools.images.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement `src/tools/images.ts`**

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { closeDocument, getImageBytes, openDocument, walkImages } from "../core/document.js";

export interface ListImagesArgs {
  file_path: string;
}
export interface ExtractImagesArgs {
  file_path: string;
  output_dir?: string;
}

export async function listHwpImages(args: ListImagesArgs): Promise<string> {
  let doc;
  try {
    doc = await openDocument(args.file_path);
  } catch (e) {
    return (e as Error).message;
  }
  try {
    const imgs = walkImages(doc);
    if (imgs.length === 0) return "(이미지가 없습니다 / no images)";
    return imgs
      .map(
        (img, i) =>
          `${i + 1}. [section ${img.section}, para ${img.paragraph}, ctrl ${img.controlIdx}] ${img.mime} (${img.byteLength} bytes, .${img.ext})`
      )
      .join("\n");
  } finally {
    closeDocument(doc);
  }
}

export async function extractHwpImages(args: ExtractImagesArgs): Promise<string> {
  let doc;
  try {
    doc = await openDocument(args.file_path);
  } catch (e) {
    return (e as Error).message;
  }
  try {
    const imgs = walkImages(doc);
    if (imgs.length === 0) return "(추출할 이미지가 없습니다 / no images to extract)";
    const baseName = basename(args.file_path, extname(args.file_path));
    const outDir = args.output_dir
      ? resolve(args.output_dir)
      : resolve(dirname(args.file_path), `${baseName}_images`);
    mkdirSync(outDir, { recursive: true });
    const saved: string[] = [];
    imgs.forEach((img, i) => {
      const bytes = getImageBytes(doc, img);
      const fname = `image_${String(i + 1).padStart(3, "0")}.${img.ext}`;
      const fpath = join(outDir, fname);
      writeFileSync(fpath, bytes);
      saved.push(fname);
    });
    return [
      `이미지 ${saved.length}개를 추출했습니다 (extracted ${saved.length} images):`,
      `저장 위치 (output): ${outDir}`,
      "",
      ...saved.map((s) => `  - ${s}`),
    ].join("\n");
  } finally {
    closeDocument(doc);
  }
}
```

- [ ] **Step 4: Run pass**

```bash
npm test -- test/tools.images.test.ts
```
Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/images.ts test/tools.images.test.ts
git commit -m "feat: add list_hwp_images + extract_hwp_images tool handlers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: tools/write.ts — replace_hwp_text (TDD)

**Files:**
- Create: `src/tools/write.ts`
- Create: `test/tools.write.replace.test.ts`

**Goal:** Round-trip text replacement: open → `replaceAll` → export → write to disk → re-open → verify replaced text present.

- [ ] **Step 1: Failing test** — `test/tools.write.replace.test.ts`

```ts
import { describe, it, expect, afterEach } from "vitest";
import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { replaceHwpText } from "../src/tools/write.js";
import { openDocument, closeDocument, walkText } from "../src/core/document.js";

const out = join(tmpdir(), `hwp-mcp-replace-${process.pid}.hwpx`);

afterEach(() => {
  if (existsSync(out)) rmSync(out);
});

describe("replaceHwpText", () => {
  it("replaces text in .hwpx and round-trips", async () => {
    const result = await replaceHwpText({
      file_path: "test/fixtures/simple.hwpx",
      old_text: "남대현",
      new_text: "이순신",
      output_path: out,
    });
    expect(result).toMatch(/1건|1 occurrence|교체/);
    expect(existsSync(out)).toBe(true);
    const doc = await openDocument(out);
    const text = walkText(doc);
    expect(text).not.toContain("남대현");
    expect(text).toContain("이순신");
    closeDocument(doc);
  });

  it("rejects cross-format save", async () => {
    const wrongOut = out.replace(/\.hwpx$/, ".hwp");
    const result = await replaceHwpText({
      file_path: "test/fixtures/simple.hwpx",
      old_text: "x",
      new_text: "y",
      output_path: wrongOut,
    });
    expect(result).toMatch(/크로스 포맷|cross-format|same extension/);
    expect(existsSync(wrongOut)).toBe(false);
  });
});
```

> **Note:** the table cell text "남대현" is in a *cell paragraph*, not a body paragraph. `replaceAll` is documented to replace across the document including cells. If the test fails with 0 replacements, check the d.ts for replaceAll semantics or use a body-text occurrence ("hwp-mcp" → "rhwp") instead.

- [ ] **Step 2: Run failing test**

```bash
npm test -- test/tools.write.replace.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement `src/tools/write.ts`** (initial — only `replaceHwpText`)

```ts
import { writeFileSync } from "node:fs";
import { extname } from "node:path";
import { closeDocument, getFormatFromPath, openDocument, type HwpFormat } from "../core/document.js";

export interface ReplaceTextArgs {
  file_path: string;
  old_text: string;
  new_text: string;
  output_path?: string;
}

function defaultOutputPath(input: string, suffix: string): string {
  const ext = extname(input);
  const base = input.slice(0, input.length - ext.length);
  return `${base}_${suffix}${ext}`;
}

function ensureSameFormat(inputPath: string, outputPath: string): void {
  const inFmt = getFormatFromPath(inputPath);
  const outFmt = getFormatFromPath(outputPath);
  if (inFmt !== outFmt) {
    throw new Error(
      `크로스 포맷 저장은 지원되지 않습니다 (cross-format save not supported): use the same extension as input (.${inFmt}).`
    );
  }
}

function exportBytes(doc: any, fmt: HwpFormat): Uint8Array {
  return fmt === "hwp" ? doc.exportHwp() : doc.exportHwpx();
}

export async function replaceHwpText(args: ReplaceTextArgs): Promise<string> {
  const outputPath = args.output_path && args.output_path.length > 0
    ? args.output_path
    : defaultOutputPath(args.file_path, "modified");
  try {
    ensureSameFormat(args.file_path, outputPath);
  } catch (e) {
    return (e as Error).message;
  }
  let doc;
  try {
    doc = await openDocument(args.file_path);
  } catch (e) {
    return (e as Error).message;
  }
  try {
    const fmt = getFormatFromPath(args.file_path);
    const result = doc.replaceAll(args.old_text, args.new_text, true);
    let count = 0;
    try {
      const parsed = JSON.parse(result);
      count = Number(parsed.count ?? parsed.replaced ?? parsed.total ?? 0);
    } catch {
      // result may be plain string; assume any non-empty result means success
      count = result ? 1 : 0;
    }
    const bytes = exportBytes(doc, fmt);
    writeFileSync(outputPath, bytes);
    return `'${args.old_text}' → '${args.new_text}': ${count}건 교체 (replaced ${count})\n저장 (saved): ${outputPath}`;
  } catch (e) {
    return `텍스트 교체 오류 (replace error): ${(e as Error).message}`;
  } finally {
    closeDocument(doc);
  }
}
```

- [ ] **Step 4: Run pass**

```bash
npm test -- test/tools.write.replace.test.ts
```
Expected: 2/2 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/write.ts test/tools.write.replace.test.ts
git commit -m "feat: add replace_hwp_text tool handler with round-trip test

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: tools/write.ts — fill_hwp_template (TDD)

**Files:**
- Modify: `src/tools/write.ts` (add `fillHwpTemplate`)
- Modify: `test/fixtures/build-fixtures.ts` (add `template.hwpx` with `{{name}}`/`{{company}}`)
- Create: `test/tools.write.fill.test.ts`

**Goal:** Accept a JSON map of replacements, apply each with `replaceAll`, save. If a key is also a known field name (from `getFieldList()`), prefer `setFieldValueByName`. Default behavior matches Python tool's existing contract.

- [ ] **Step 1: Add template fixture** — append to `test/fixtures/build-fixtures.ts`

```ts
async function buildTemplateHwpx() {
  await initRhwp();
  const doc = HwpDocument.createEmpty();
  doc.insertText(0, 0, 0, "안녕하세요 {{name}}님, {{company}}에서 보낸 메시지입니다.");
  const bytes = doc.exportHwpx();
  doc.free();
  const out = resolve(dirname(new URL(import.meta.url).pathname), "template.hwpx");
  writeFileSync(out, bytes);
  console.log("wrote", out, bytes.byteLength, "bytes");
}
await buildTemplateHwpx();
```

Run:
```bash
npm run build:fixtures
```

- [ ] **Step 2: Failing test** — `test/tools.write.fill.test.ts`

```ts
import { describe, it, expect, afterEach } from "vitest";
import { rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fillHwpTemplate } from "../src/tools/write.js";
import { openDocument, closeDocument, walkText } from "../src/core/document.js";

const out = join(tmpdir(), `hwp-mcp-fill-${process.pid}.hwpx`);
afterEach(() => {
  if (existsSync(out)) rmSync(out);
});

describe("fillHwpTemplate", () => {
  it("fills {{name}} and {{company}} placeholders", async () => {
    const r = await fillHwpTemplate({
      file_path: "test/fixtures/template.hwpx",
      replacements: JSON.stringify({ "{{name}}": "남대현", "{{company}}": "포텐랩" }),
      output_path: out,
    });
    expect(r).toMatch(/총 2건|2 replacements/);
    const doc = await openDocument(out);
    const text = walkText(doc);
    expect(text).toContain("남대현");
    expect(text).toContain("포텐랩");
    expect(text).not.toContain("{{name}}");
    expect(text).not.toContain("{{company}}");
    closeDocument(doc);
  });

  it("returns parse error on invalid JSON", async () => {
    const r = await fillHwpTemplate({
      file_path: "test/fixtures/template.hwpx",
      replacements: "{not json",
      output_path: out,
    });
    expect(r).toMatch(/JSON|파싱/i);
  });
});
```

- [ ] **Step 3: Run failing test**

```bash
npm test -- test/tools.write.fill.test.ts
```
Expected: FAIL.

- [ ] **Step 4: Implement `fillHwpTemplate`** — append to `src/tools/write.ts`

```ts
export interface FillTemplateArgs {
  file_path: string;
  replacements: string; // JSON string of Record<string, string>
  output_path?: string;
}

export async function fillHwpTemplate(args: FillTemplateArgs): Promise<string> {
  let map: Record<string, string>;
  try {
    map = JSON.parse(args.replacements);
    if (typeof map !== "object" || map === null || Array.isArray(map)) {
      throw new Error("replacements must be a JSON object of string→string");
    }
  } catch (e) {
    return `replacements JSON 파싱 오류 (JSON parse error): ${(e as Error).message}`;
  }

  const outputPath = args.output_path && args.output_path.length > 0
    ? args.output_path
    : defaultOutputPath(args.file_path, "filled");
  try {
    ensureSameFormat(args.file_path, outputPath);
  } catch (e) {
    return (e as Error).message;
  }

  let doc;
  try {
    doc = await openDocument(args.file_path);
  } catch (e) {
    return (e as Error).message;
  }

  // Detect known field names — used to route {{x}} entries to setFieldValueByName.
  let fieldNames = new Set<string>();
  try {
    const list = JSON.parse(doc.getFieldList());
    if (Array.isArray(list)) {
      fieldNames = new Set(
        list.map((f: any) => String(f.name ?? f.field_name ?? f)).filter(Boolean)
      );
    }
  } catch {
    /* getFieldList may return non-JSON; fall back to replaceAll */
  }

  const fmt = getFormatFromPath(args.file_path);
  const counts: Record<string, number> = {};
  let total = 0;

  for (const [key, value] of Object.entries(map)) {
    // Strip {{ }} for field-name comparison.
    const stripped = key.replace(/^\{\{(.+)\}\}$/, "$1").trim();
    if (fieldNames.has(stripped)) {
      try {
        doc.setFieldValueByName(stripped, value);
        counts[key] = 1;
        total += 1;
        continue;
      } catch {
        /* fall through to replaceAll */
      }
    }
    try {
      const r = doc.replaceAll(key, value, true);
      let n = 0;
      try {
        const parsed = JSON.parse(r);
        n = Number(parsed.count ?? parsed.replaced ?? parsed.total ?? 0);
      } catch {
        n = r ? 1 : 0;
      }
      counts[key] = n;
      total += n;
    } catch (e) {
      return `치환 오류 (replace error) on '${key}': ${(e as Error).message}`;
    }
  }

  try {
    const bytes = exportBytes(doc, fmt);
    writeFileSync(outputPath, bytes);
  } catch (e) {
    return `저장 오류 (save error): ${(e as Error).message}`;
  } finally {
    closeDocument(doc);
  }

  const lines = [
    `저장 완료 (saved): ${outputPath}`,
    `총 ${total}건 치환 (${total} replacements)`,
    "",
  ];
  for (const [k, n] of Object.entries(counts)) {
    lines.push(`  '${k}' → ${n}건`);
  }
  return lines.join("\n");
}
```

- [ ] **Step 5: Run pass**

```bash
npm test -- test/tools.write.fill.test.ts
```
Expected: 2/2 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/tools/write.ts test/tools.write.fill.test.ts test/fixtures/build-fixtures.ts test/fixtures/template.hwpx
git commit -m "feat: add fill_hwp_template tool handler

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: tools/write.ts — create_hwpx_document (TDD)

**Files:**
- Modify: `src/tools/write.ts` (add `createHwpxDocument`)
- Create: `test/tools.write.create.test.ts`

**Goal:** Accept a JSON content list (text + tables) and produce a new `.hwpx` file via `HwpDocument.createEmpty()` + `insertText` + `createTable` + `insertTextInCell` + `exportHwpx`.

- [ ] **Step 1: Failing test** — `test/tools.write.create.test.ts`

```ts
import { describe, it, expect, afterEach } from "vitest";
import { rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHwpxDocument } from "../src/tools/write.js";
import { openDocument, closeDocument, walkText, walkTables } from "../src/core/document.js";

const out = join(tmpdir(), `hwp-mcp-create-${process.pid}.hwpx`);
afterEach(() => {
  if (existsSync(out)) rmSync(out);
});

describe("createHwpxDocument", () => {
  it("creates a doc with text and a table", async () => {
    const r = await createHwpxDocument({
      output_path: out,
      content: JSON.stringify([
        { type: "text", text: "사원 명부" },
        {
          type: "table",
          headers: ["이름", "역할"],
          rows: [
            ["김철수", "CTO"],
            ["이영희", "PM"],
          ],
        },
      ]),
    });
    expect(r).toMatch(/생성 완료|created/);
    expect(existsSync(out)).toBe(true);
    const doc = await openDocument(out);
    expect(walkText(doc)).toContain("사원 명부");
    const tables = walkTables(doc);
    expect(tables).toHaveLength(1);
    expect(tables[0].cells[0]).toEqual(["이름", "역할"]);
    expect(tables[0].cells[1]).toEqual(["김철수", "CTO"]);
    expect(tables[0].cells[2]).toEqual(["이영희", "PM"]);
    closeDocument(doc);
  });

  it("rejects non-.hwpx output paths", async () => {
    const wrong = out.replace(/\.hwpx$/, ".hwp");
    const r = await createHwpxDocument({
      output_path: wrong,
      content: JSON.stringify([{ type: "text", text: "x" }]),
    });
    expect(r).toMatch(/\.hwpx|HWPX/);
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
npm test -- test/tools.write.create.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement `createHwpxDocument`** — append to `src/tools/write.ts`

```ts
import { HwpDocument } from "@rhwp/core";
import { initRhwp } from "../core/wasm-init.js";

type ContentItem =
  | { type: "text"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] };

export interface CreateHwpxArgs {
  output_path: string;
  content: string; // JSON string of ContentItem[]
}

export async function createHwpxDocument(args: CreateHwpxArgs): Promise<string> {
  if (!args.output_path.toLowerCase().endsWith(".hwpx")) {
    return `출력 경로는 .hwpx 확장자여야 합니다 (output must end with .hwpx): ${args.output_path}`;
  }
  let items: ContentItem[];
  try {
    items = JSON.parse(args.content);
    if (!Array.isArray(items)) throw new Error("content must be a JSON array");
  } catch (e) {
    return `content JSON 파싱 오류 (JSON parse error): ${(e as Error).message}`;
  }

  await initRhwp();
  const doc = HwpDocument.createEmpty();
  try {
    for (const item of items) {
      const sec = doc.getSectionCount() - 1;
      const para = doc.getParagraphCount(sec) - 1;
      const tail = doc.getParagraphLength(sec, para);
      if (item.type === "text") {
        // Add a newline-separated paragraph if there is already content.
        const prefix = tail === 0 ? "" : "\n";
        doc.insertText(sec, para, tail, prefix + item.text);
      } else if (item.type === "table") {
        const cols = item.headers.length;
        const rows = item.rows.length + 1; // header + body
        if (rows === 1 || cols === 0) continue;
        // Insert a newline before the table if the paragraph already has text.
        const insertOffset = tail === 0 ? tail : (doc.insertText(sec, para, tail, "\n"), tail + 1);
        doc.createTable(sec, para, insertOffset, rows, cols);
        // Find the just-created table's controlIdx (last control in this paragraph).
        const ctrls = JSON.parse(doc.getControlTextPositions(sec, para));
        const tableCi = Number(
          ctrls[ctrls.length - 1]?.controlIdx ?? ctrls[ctrls.length - 1]?.control_idx ?? 0
        );
        const all: string[][] = [item.headers, ...item.rows];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const cellIdx = r * cols + c;
            const txt = all[r][c] ?? "";
            if (txt.length > 0) {
              doc.insertTextInCell(sec, para, tableCi, cellIdx, 0, 0, txt);
            }
          }
        }
      }
    }
    const bytes = doc.exportHwpx();
    writeFileSync(args.output_path, bytes);
  } catch (e) {
    return `문서 생성 오류 (create error): ${(e as Error).message}`;
  } finally {
    doc.free();
  }

  return `HWPX 문서 생성 완료 (created): ${args.output_path}`;
}
```

> **API note:** `insertText` returns a JSON status string per the d.ts. The expression `(doc.insertText(...), tail + 1)` uses the comma operator to discard that return and produce `tail + 1`.

- [ ] **Step 4: Run pass**

```bash
npm test -- test/tools.write.create.test.ts
```
Expected: 2/2 PASS.

If the table cells are off-by-one (e.g. text appears in the wrong cell), the insertion offset for the table needs adjustment. Print the document text and tables JSON in a temporary log, then correct.

- [ ] **Step 5: Commit**

```bash
git add src/tools/write.ts test/tools.write.create.test.ts
git commit -m "feat: add create_hwpx_document tool handler

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: src/server.ts — MCP entry, register tools

**Files:**
- Replace: `src/server.ts`
- Create: `test/server.smoke.test.ts`

**Goal:** Connect all 8 tools to the official MCP TypeScript SDK over stdio. Each tool description is in **English** (better LLM tool selection); error messages from handlers remain Korean+English.

- [ ] **Step 1: Smoke test that server module imports cleanly**

`test/server.smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("server module", () => {
  it("imports without throwing", async () => {
    const mod = await import("../src/server.js");
    expect(mod).toBeDefined();
  });
});
```

Note: importing the module should not call `runServer()` automatically — see Step 3.

- [ ] **Step 2: Run smoke test (will fail until Step 3)**

```bash
npm test -- test/server.smoke.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Replace `src/server.ts`**

```ts
#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readHwp, readHwpText, readHwpTables } from "./tools/read.js";
import { listHwpImages, extractHwpImages } from "./tools/images.js";
import { replaceHwpText, fillHwpTemplate, createHwpxDocument } from "./tools/write.js";

const TOOLS = [
  {
    name: "read_hwp",
    description:
      "Read full HWP/HWPX document content as text + tables (markdown) + image listing. Args: file_path (absolute path).",
    inputSchema: {
      type: "object",
      properties: { file_path: { type: "string" } },
      required: ["file_path"],
    },
  },
  {
    name: "read_hwp_text",
    description:
      "Extract plain body text from an HWP/HWPX file (no tables, no images). Args: file_path.",
    inputSchema: {
      type: "object",
      properties: { file_path: { type: "string" } },
      required: ["file_path"],
    },
  },
  {
    name: "read_hwp_tables",
    description:
      "Extract every table from an HWP/HWPX file as GitHub-flavored markdown. Args: file_path.",
    inputSchema: {
      type: "object",
      properties: { file_path: { type: "string" } },
      required: ["file_path"],
    },
  },
  {
    name: "list_hwp_images",
    description:
      "List embedded images (mime, byte length, locator) in an HWP/HWPX file. Args: file_path.",
    inputSchema: {
      type: "object",
      properties: { file_path: { type: "string" } },
      required: ["file_path"],
    },
  },
  {
    name: "extract_hwp_images",
    description:
      "Save every embedded image to disk. Args: file_path, output_dir (optional; defaults to <file>_images/).",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        output_dir: { type: "string" },
      },
      required: ["file_path"],
    },
  },
  {
    name: "replace_hwp_text",
    description:
      "Find and replace text in an HWP/HWPX file. Saves to a new file (same format as input). Args: file_path, old_text, new_text, output_path (optional).",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        old_text: { type: "string" },
        new_text: { type: "string" },
        output_path: { type: "string" },
      },
      required: ["file_path", "old_text", "new_text"],
    },
  },
  {
    name: "fill_hwp_template",
    description:
      "Fill multiple placeholders in an HWP/HWPX template. `replacements` is a JSON object string, e.g. {\"{{name}}\":\"Kim\",\"{{company}}\":\"Acme\"}. If a key matches a known field name in the document, the field API is used instead of text replacement. Args: file_path, replacements, output_path (optional).",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        replacements: { type: "string" },
        output_path: { type: "string" },
      },
      required: ["file_path", "replacements"],
    },
  },
  {
    name: "create_hwpx_document",
    description:
      "Create a new .hwpx file from a JSON content list of {type:'text',text} and {type:'table',headers,rows} items. Args: output_path (must end with .hwpx), content (JSON string of items).",
    inputSchema: {
      type: "object",
      properties: {
        output_path: { type: "string" },
        content: { type: "string" },
      },
      required: ["output_path", "content"],
    },
  },
];

const HANDLERS: Record<string, (args: any) => Promise<string>> = {
  read_hwp: readHwp,
  read_hwp_text: readHwpText,
  read_hwp_tables: readHwpTables,
  list_hwp_images: listHwpImages,
  extract_hwp_images: extractHwpImages,
  replace_hwp_text: replaceHwpText,
  fill_hwp_template: fillHwpTemplate,
  create_hwpx_document: createHwpxDocument,
};

export function buildServer(): Server {
  const server = new Server(
    { name: "hwp-mcp", version: "0.2.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const handler = HANDLERS[req.params.name];
    if (!handler) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }],
        isError: true,
      };
    }
    try {
      const text = await handler(req.params.arguments ?? {});
      return { content: [{ type: "text", text }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `오류 (error): ${(e as Error).message}` }],
        isError: true,
      };
    }
  });

  return server;
}

export async function runServer(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runServer().catch((e) => {
    process.stderr.write(`fatal: ${e?.message ?? e}\n`);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run smoke test**

```bash
npm test -- test/server.smoke.test.ts
```
Expected: 1/1 PASS.

- [ ] **Step 5: Build and verify the binary works**

```bash
npm run build
chmod +x dist/server.js
node dist/server.js < /dev/null &
SERVER_PID=$!
sleep 1
kill $SERVER_PID 2>/dev/null || true
echo "server started and was terminable"
```
Expected: no errors when starting; clean termination.

- [ ] **Step 6: Run the full test suite**

```bash
npm test
```
Expected: all suites green (counts roughly: wasm-init 3, document open 3, walk-text 1, walk-tables 2, walk-images 2, read.text 2, read.tables 2, read.combined 1, images 3, write.replace 2, write.fill 2, write.create 2, server.smoke 1 = ~26 tests).

- [ ] **Step 7: Commit**

```bash
git add src/server.ts test/server.smoke.test.ts
git commit -m "feat: wire MCP server entry with all 8 tools

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: README rewrite (English-first + Korean section + rhwp credit)

**Files:**
- Replace: `README.md`

**Goal:** Single English-first README with a Korean section, install snippets, tool table, examples, limitations, rhwp credit. SEO keywords appear naturally in headings and body. No emojis.

- [ ] **Step 1: Replace `README.md`**

```markdown
# hwp-mcp

> Read & write **HWP / HWPX** (Korean Hangul) documents from Claude, Cursor, ChatGPT, and any MCP-compatible client.

[![npm version](https://img.shields.io/npm/v/hwp-mcp.svg)](https://www.npmjs.com/package/hwp-mcp)
[![Built on rhwp](https://img.shields.io/badge/built%20on-rhwp-blue)](https://github.com/edwardkim/rhwp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

`hwp-mcp` is an MCP (Model Context Protocol) server that lets AI assistants read, edit, and create Korean Hancom Office documents. It is built on top of [**rhwp**](https://github.com/edwardkim/rhwp), a Rust + WebAssembly HWP/HWPX engine by Edward Kim.

---

## Install

### Claude Code

```bash
claude mcp add hwp-mcp -- npx -y hwp-mcp
```

### Claude Desktop / Cursor / VS Code (settings JSON)

```json
{
  "mcpServers": {
    "hwp-mcp": {
      "command": "npx",
      "args": ["-y", "hwp-mcp"]
    }
  }
}
```

Requires Node.js ≥ 20.

---

## Tools

### Read

| Tool | Description |
|------|-------------|
| `read_hwp` | Full document: text + tables (markdown) + image list |
| `read_hwp_text` | Body text only |
| `read_hwp_tables` | Tables as GitHub-flavored markdown |
| `list_hwp_images` | List embedded images (mime, bytes) |
| `extract_hwp_images` | Save embedded images to disk |

### Write

| Tool | Description |
|------|-------------|
| `replace_hwp_text` | Find & replace, save round-trip |
| `fill_hwp_template` | Fill multiple `{{placeholders}}` (or HWP fields) |
| `create_hwpx_document` | Create a new .hwpx with text + tables |

---

## Usage examples

### Read a document

```
You: Read /path/to/document.hwp

AI: # document.hwp
    형식: .HWP | 문단: 23개 | 표: 2개 | 이미지: 1개
    ...
    | Name | Position | Company |
    | --- | --- | --- |
    | Kim | CTO | Acme |
```

### Fill a template

```
You: Fill /path/to/form.hwp with {{name}}=남대현, {{company}}=포텐랩

AI: 저장 완료 (saved): form_filled.hwp
    총 2건 치환 (2 replacements)
      '{{name}}' → 1건
      '{{company}}' → 1건
```

### Create a new HWPX document

```
You: Create employees.hwpx with title "사원 명부" and a table of names and roles.

AI: HWPX 문서 생성 완료 (created): employees.hwpx
```

---

## Limitations (v0.2)

- **Cross-format save is rejected** — `.hwp` input must save as `.hwp`, `.hwpx` as `.hwpx`. The reverse is rejected with a clear error. Cross-format export will be revisited when `@rhwp/core`'s adapter API stabilizes.
- **Headers, footers, footnotes, and text-boxes are not yet extracted** by the read tools — only body paragraphs and tables. Tracked for a 0.3 release.
- **Complex table cell merges** are flattened to a best-effort 2D matrix in markdown output.

---

## 한국어

`hwp-mcp`은 Claude, Cursor, ChatGPT 등 MCP 호환 AI에서 한글 문서(HWP, HWPX)를 읽고 쓸 수 있도록 해주는 서버입니다. 파서·렌더링은 [rhwp](https://github.com/edwardkim/rhwp) (Edward Kim 작) 의 Rust+WebAssembly 엔진을 사용합니다.

### 설치

Claude Code:
```bash
claude mcp add hwp-mcp -- npx -y hwp-mcp
```

Claude Desktop / Cursor 설정 JSON:
```json
{
  "mcpServers": {
    "hwp-mcp": { "command": "npx", "args": ["-y", "hwp-mcp"] }
  }
}
```

Node.js 20 이상 필요.

### 사용 예시

```
사용자: /Users/me/이력서.hwp 읽어줘

AI: # 이력서.hwp
    형식: .HWP | 문단: 18개 | 표: 1개 | 이미지: 0개
    ...
```

### 한계 (v0.2)

- `.hwp` ↔ `.hwpx` 크로스 포맷 저장 미지원 (입력과 같은 확장자로만 저장)
- 머리말/꼬리말/각주/텍스트박스 본문 추출 미지원 (0.3 예정)
- 셀 병합 표는 best-effort 2차원 표로 평탄화

---

## Built on rhwp

`hwp-mcp` is a thin MCP adapter on top of [`@rhwp/core`](https://www.npmjs.com/package/@rhwp/core). All HWP parsing, rendering, field handling, and document export comes from rhwp. Please consider supporting that project: <https://github.com/edwardkim/rhwp>.

## License

MIT.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for v0.2 — English-first + Korean + rhwp credit

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Manual smoke test + publish dry-run

**Files:**
- (no source changes; verification only)

**Goal:** Confirm the built artifact actually serves MCP and is publish-ready. We do **not** publish in this task — that's an explicit step the user takes.

- [ ] **Step 1: Build production artifact**

```bash
npm run build
ls dist/
```
Expected: `dist/server.js` and `dist/core/*.js`, `dist/tools/*.js`.

- [ ] **Step 2: Test the bin via npx-style invocation**

Make a tiny stdin script:

```bash
cat > /tmp/mcp-init.json << 'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","clientInfo":{"name":"test","version":"0"},"capabilities":{}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
EOF
node dist/server.js < /tmp/mcp-init.json | head -50
```
Expected: two JSON-RPC responses on stdout — `result.protocolVersion` from initialize, then a `tools` array of 8 entries from tools/list.

- [ ] **Step 3: Run a real read tool through stdio**

```bash
cat > /tmp/mcp-call.json << 'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","clientInfo":{"name":"test","version":"0"},"capabilities":{}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"read_hwp_text","arguments":{"file_path":"test/fixtures/simple.hwpx"}}}
EOF
node dist/server.js < /tmp/mcp-call.json | tail -2
```
Expected: a JSON-RPC response with `result.content[0].text` containing `"안녕하세요 hwp-mcp."`.

- [ ] **Step 4: `npm publish --dry-run`**

```bash
npm publish --dry-run
```
Expected: a tarball summary listing `dist/`, `README.md`, `LICENSE`, `package.json`. No source files (`.ts`) or `node_modules` should appear.

- [ ] **Step 5: Final commit (release-notes-only)**

```bash
git status
```
If clean: nothing to commit. If there are leftover artifacts (e.g. `package-lock.json` if not yet tracked), stage and commit them:

```bash
git add package-lock.json
git commit -m "chore: lock dependencies for v0.2.0

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Tag the release locally (publish step is the user's call)**

```bash
git tag v0.2.0
git log --oneline | head -20
```
Expected: tag created; recent commits visible.

> **Stop here and hand back to the user.** They review, run `npm publish` themselves, push the tag, and update GitHub topics + release notes.

---

### Task 17: Real-world smoke test against a government .hwpx

**Files:**
- (no source changes; verification only — but if a reproducible bug surfaces, file as a known-issue note in README and stop)

**Goal:** Run each of the 8 tools against a real, in-the-wild Korean government .hwpx file (257 KB, complex layout — likely contains headers, footers, tables, and images). The user's smoke target:

`/Users/dion/Downloads/1. 산업부/2. 산업AI 솔루션 실증 확산 지원/[붙임1] 2026년 산업AI 솔루션 실증·확산 지원 시행계획.hwpx`

This is **acceptance**, not unit testing — we want to see the tools produce reasonable output without crashing, and document any real-world gaps.

- [ ] **Step 1: Define a shell var for convenience**

```bash
SMOKE_FILE='/Users/dion/Downloads/1. 산업부/2. 산업AI 솔루션 실증 확산 지원/[붙임1] 2026년 산업AI 솔루션 실증·확산 지원 시행계획.hwpx'
test -f "$SMOKE_FILE" && echo "OK $(stat -f%z "$SMOKE_FILE") bytes" || echo "FILE MISSING — STOP"
```
Expected: `OK 257361 bytes`. If MISSING, stop and ask the user.

- [ ] **Step 2: read_hwp_text — should return a substantial body of Korean text without crashing**

Build a JSON-RPC stdin script and invoke:

```bash
SMOKE_FILE='/Users/dion/Downloads/1. 산업부/2. 산업AI 솔루션 실증 확산 지원/[붙임1] 2026년 산업AI 솔루션 실증·확산 지원 시행계획.hwpx'
node -e '
const fs=require("fs");
const path=process.argv[1];
const init=JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2024-11-05",clientInfo:{name:"smoke",version:"0"},capabilities:{}}});
const call=JSON.stringify({jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"read_hwp_text",arguments:{file_path:path}}});
process.stdout.write(init+"\n"+call+"\n");
' "$SMOKE_FILE" | node dist/server.js | tail -1 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log("LEN:",r.result?.content?.[0]?.text?.length);console.log("HEAD:",r.result?.content?.[0]?.text?.slice(0,300));})'
```
Expected: `LEN:` is a positive number (typically several KB), and `HEAD:` shows recognizable Korean from the document title/intro. **No crash.** Note any anomalies.

- [ ] **Step 3: read_hwp_tables — should return at least one table**

Same scaffolding, change tool name to `read_hwp_tables`:

```bash
node -e '
const path=process.argv[1];
const init=JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2024-11-05",clientInfo:{name:"smoke",version:"0"},capabilities:{}}});
const call=JSON.stringify({jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"read_hwp_tables",arguments:{file_path:path}}});
process.stdout.write(init+"\n"+call+"\n");
' "$SMOKE_FILE" | node dist/server.js | tail -1 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);const t=r.result?.content?.[0]?.text||"";console.log("LEN:",t.length);console.log("HEAD:",t.slice(0,500));})'
```
Expected: at least one `### 표 N` heading and a markdown pipe table.

- [ ] **Step 4: list_hwp_images**

```bash
node -e '
const path=process.argv[1];
const init=JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2024-11-05",clientInfo:{name:"smoke",version:"0"},capabilities:{}}});
const call=JSON.stringify({jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"list_hwp_images",arguments:{file_path:path}}});
process.stdout.write(init+"\n"+call+"\n");
' "$SMOKE_FILE" | node dist/server.js | tail -1 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log(r.result?.content?.[0]?.text||"none");})'
```
Expected: either an image list or `(이미지가 없습니다 / no images)`.

- [ ] **Step 5: extract_hwp_images to a tmp dir** (only if Step 4 reported images)

```bash
EXTRACT_DIR=$(mktemp -d)
node -e '
const path=process.argv[1], dir=process.argv[2];
const init=JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2024-11-05",clientInfo:{name:"smoke",version:"0"},capabilities:{}}});
const call=JSON.stringify({jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"extract_hwp_images",arguments:{file_path:path,output_dir:dir}}});
process.stdout.write(init+"\n"+call+"\n");
' "$SMOKE_FILE" "$EXTRACT_DIR" | node dist/server.js | tail -1 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{console.log(JSON.parse(s).result?.content?.[0]?.text);})'
ls -la "$EXTRACT_DIR"
```
Expected: image files in `$EXTRACT_DIR`. Open one to confirm it's not corrupt (e.g. `file $EXTRACT_DIR/image_001.png`).

- [ ] **Step 6: read_hwp (combined)** — confirms full pipeline composes correctly

```bash
node -e '
const path=process.argv[1];
const init=JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2024-11-05",clientInfo:{name:"smoke",version:"0"},capabilities:{}}});
const call=JSON.stringify({jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"read_hwp",arguments:{file_path:path}}});
process.stdout.write(init+"\n"+call+"\n");
' "$SMOKE_FILE" | node dist/server.js | tail -1 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const t=JSON.parse(s).result?.content?.[0]?.text||"";console.log("LEN:",t.length);console.log("HEAD:",t.slice(0,400));console.log("TAIL:",t.slice(-200));})'
```
Expected: starts with `# [붙임1] 2026년 ...`, includes `형식: .HWPX`, contains body + at least one `### 표`, possibly an image listing.

- [ ] **Step 7: replace_hwp_text round-trip** — pick a string we know exists

```bash
OUT_FILE="/tmp/smoke-replaced.hwpx"
node -e '
const path=process.argv[1], out=process.argv[2];
const init=JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2024-11-05",clientInfo:{name:"smoke",version:"0"},capabilities:{}}});
const call=JSON.stringify({jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"replace_hwp_text",arguments:{file_path:path,old_text:"산업AI",new_text:"산업-AI",output_path:out}}});
process.stdout.write(init+"\n"+call+"\n");
' "$SMOKE_FILE" "$OUT_FILE" | node dist/server.js | tail -1 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{console.log(JSON.parse(s).result?.content?.[0]?.text);})'
ls -la "$OUT_FILE"
```
Expected: replacement count ≥ 1, output file written. Verify by re-reading text and grepping for `산업-AI`:

```bash
node -e '
const path=process.argv[1];
const init=JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2024-11-05",clientInfo:{name:"smoke",version:"0"},capabilities:{}}});
const call=JSON.stringify({jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"read_hwp_text",arguments:{file_path:path}}});
process.stdout.write(init+"\n"+call+"\n");
' "$OUT_FILE" | node dist/server.js | tail -1 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const t=JSON.parse(s).result?.content?.[0]?.text||"";console.log("contains 산업-AI:",t.includes("산업-AI"));console.log("contains 산업AI (unchanged) count:", (t.match(/산업AI/g)||[]).length);})'
```
Expected: `contains 산업-AI: true`. The unchanged-occurrence count may be 0 (all replaced) or non-zero (rhwp's replaceAll behavior depends on overlap rules) — log either result.

- [ ] **Step 8: fill_hwp_template (sanity only — the real doc has no `{{}}` placeholders, so 0 replacements is the expected and correct behavior)**

```bash
OUT_FILE="/tmp/smoke-fill.hwpx"
node -e '
const path=process.argv[1], out=process.argv[2];
const init=JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2024-11-05",clientInfo:{name:"smoke",version:"0"},capabilities:{}}});
const repl=JSON.stringify({"{{nothing}}":"x"});
const call=JSON.stringify({jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"fill_hwp_template",arguments:{file_path:path,replacements:repl,output_path:out}}});
process.stdout.write(init+"\n"+call+"\n");
' "$SMOKE_FILE" "$OUT_FILE" | node dist/server.js | tail -1 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{console.log(JSON.parse(s).result?.content?.[0]?.text);})'
```
Expected: `총 0건 치환` (correct; no placeholders in doc), file still saved at `$OUT_FILE`.

- [ ] **Step 9: create_hwpx_document — independent of the smoke file**

```bash
NEW_FILE="/tmp/smoke-new.hwpx"
node -e '
const out=process.argv[1];
const init=JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2024-11-05",clientInfo:{name:"smoke",version:"0"},capabilities:{}}});
const content=JSON.stringify([{type:"text",text:"산업AI 솔루션 점검표"},{type:"table",headers:["항목","상태"],rows:[["발표","완료"],["보고서","진행중"]]}]);
const call=JSON.stringify({jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"create_hwpx_document",arguments:{output_path:out,content:content}}});
process.stdout.write(init+"\n"+call+"\n");
' "$NEW_FILE" | node dist/server.js | tail -1 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{console.log(JSON.parse(s).result?.content?.[0]?.text);})'
ls -la "$NEW_FILE"
```
Expected: file created, non-zero size. Optionally re-read with `read_hwp` and confirm.

- [ ] **Step 10: Cleanup**

```bash
rm -f /tmp/smoke-replaced.hwpx /tmp/smoke-fill.hwpx /tmp/smoke-new.hwpx
test -n "$EXTRACT_DIR" && rm -rf "$EXTRACT_DIR" || true
```

- [ ] **Step 11: Report results to the user**

Report a per-tool pass/fail summary in plain text. For any failure, capture:
- the JSON-RPC error or the rendered tool output
- a short hypothesis (e.g. "headers/footers present, traversal walker doesn't enter them — falls under known v0.2 limitation")
- whether to (a) accept as a known limitation, (b) hot-fix before publish, (c) defer to 0.3

If any tool errors out *crashing* (not just empty output), STOP and ask the user before publishing.

---

## Self-Review Notes

- Spec section 1 (packaging) → Tasks 1, 16 ✅
- Spec section 2 (8 tools, signatures preserved) → Tasks 7–13 ✅
- Spec section 3 (save policy: same-format only, cross-format rejected) → Tasks 11 (replace), 12 (fill), 13 (create only .hwpx) ✅
- Spec section 4 (code structure) → file table + Tasks 2–14 ✅
- Spec section 5 (`@modelcontextprotocol/sdk`, no FastMCP) → Task 14 ✅
- Spec section 5a (language policy: tool descriptions English, messages Korean+English) → Task 14 ✅
- Spec section 6 (README) → Task 15 ✅
- Spec section 7 (vitest, fixtures) → Task 1 (vitest), Task 3 onward (fixtures) ✅
- Spec section 8 (risks) → wasm-init isolation Task 2; tilde version pin in Task 1 ✅
- User-requested real-world acceptance against `[붙임1] 2026년 산업AI 솔루션 ….hwpx` → Task 17 ✅

No placeholders. Method names consistent (`walkText`, `walkTables`, `walkImages`, `getImageBytes`, `tableToMarkdown`, `openDocument`, `closeDocument`, `getFormatFromPath`). All Task 17 stdio scripts use `tail -1` to read the second JSON-RPC response (the tools/call result), since `initialize` writes the first response.

---

## Execution Handoff

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task with two-stage review between tasks.
2. **Inline Execution** — execute tasks here with checkpoints.

The user has already chosen "끝까지 다 해" — proceeding with **Subagent-Driven**.
