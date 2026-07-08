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
