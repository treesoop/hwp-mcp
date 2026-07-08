# convert_hwp_markdown — Design

Date: 2026-07-08
Status: approved (user delegated execution)

## Goal

Add a `convert_hwp_markdown` MCP tool that converts an HWP/HWPX document to
Markdown while preserving document flow order: tables rendered as GFM in
place, images extracted to files with relative links, equations inline,
footnotes collected at the end.

Existing `read_hwp` emits all body text first and appends tables afterwards,
losing document order. Images are only listed, never embedded.

## Tool Signature

```
convert_hwp_markdown(file_path: string, output_path?: string, image_dir?: string)
```

- No `output_path` → returns the Markdown string; images become
  `[image: png, 34KB]` placeholders (no files written).
- With `output_path` → writes the `.md` file; images are extracted to
  `image_dir` (default: `<md basename>_images/` next to the output file) as
  `img_001.png`, `img_002.jpg`, … and referenced with relative links
  `![img_001](<dir>/img_001.png)`.

## Architecture

### Core: `walkDocumentFlow(doc): FlowBlock[]` (src/core/document.ts)

```ts
type FlowBlock =
  | { kind: "para"; text: string; headingLevel?: number } // 1–6
  | { kind: "table"; table: TableData }
  | { kind: "image"; ref: ImageRef }
  | { kind: "equation"; script: string };
```

- Iterate sections → paragraphs in order. For each paragraph:
  1. Emit the paragraph text block. Query `getStyleAt` for the style name;
     if it matches `/개요\s*([1-7])|Outline\s*([1-7])/i`, set `headingLevel`
     (clamp 7 → 6). Any lookup failure is ignored (best-effort).
  2. Emit controls anchored at that paragraph in `controlIdx` order.
     For each control index, probe table → image → equation using the same
     probing logic as the existing `walkTables` / `walkImages` /
     `walkEquations` walkers.
- Reuses `TableData`, `ImageRef`, cell-reading helpers. No new rhwp API.

### Tool: src/tools/convert.ts

`convertHwpMarkdown(args)` renders `FlowBlock[]`:

- `para` → text, prefixed with `#` × headingLevel when present; empty
  paragraphs become blank lines.
- `table` → existing `tableToMarkdown`.
- `image` → file mode: `getImageBytes` + write + relative link;
  string mode: `[image: <ext>, <size>]` placeholder.
- `equation` → `$<script>$` inline (raw HWP equation script, not converted
  to LaTeX).
- Footnotes: `walkFootnotes` appended at document end as `[^N]: text`.
  v1 does not insert in-body reference markers (no anchor available).
- Headers/footers: excluded.

Error handling mirrors existing tools: `openDocument` failure returns the
error message string; `try/finally closeDocument`.

### Registration

- `src/server.ts`: register `convert_hwp_markdown` with bilingual
  description, following existing tool patterns.
- README: add row to the tools table.

## Testing (vitest, existing fixtures)

- Flow order preserved: table appears between surrounding paragraphs
  (simple.hwp / fixture with table).
- String mode vs file mode: placeholder vs extracted file + relative link.
- Heading best-effort: style lookup failure degrades to plain paragraph.
- Equation rendered as `$…$` (with_equation.hwp).
- Footnotes appended as `[^N]:` entries.
- Empty document → sensible message (empty.hwp).

## Out of Scope (v1)

- PDF export (documented decision: defer; HTML route exists via
  `render_hwp_html`).
- In-body footnote reference markers.
- base64 image embedding.
- Text-level styling (bold/italic runs) in Markdown output.
