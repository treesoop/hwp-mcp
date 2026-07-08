import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import type { FlowBlock, FootnoteRef, ImageRef } from "../core/document.js";
import {
  closeDocument,
  getImageBytes,
  openDocument,
  tableToMarkdown,
  walkDocumentFlow,
  walkFootnotes,
} from "../core/document.js";

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
      `크기: ${Buffer.byteLength(md, "utf8")} bytes | 이미지: ${imagesWritten}개${imagesWritten > 0 ? ` (${imageDir})` : ""}`,
    ].join("\n");
  } catch (e) {
    return `변환 오류 (convert error): ${(e as Error).message}`;
  } finally {
    closeDocument(doc);
  }
}
