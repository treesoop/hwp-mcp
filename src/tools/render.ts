import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import {
  closeDocument,
  getPageCount,
  openDocument,
  renderPageSvg,
} from "../core/document.js";

export interface RenderArgs {
  file_path: string;
  page?: number;
  output_path?: string;
}

export interface RenderAllArgs {
  file_path: string;
  output_dir?: string;
  max_pages?: number;
}

export async function renderHwpPage(args: RenderArgs): Promise<string> {
  let doc;
  try {
    doc = await openDocument(args.file_path);
  } catch (e) {
    return (e as Error).message;
  }
  try {
    const pages = getPageCount(doc);
    if (pages === 0) return "(렌더할 페이지가 없습니다 / no pages)";
    const page = args.page ?? 0;
    if (page < 0 || page >= pages) {
      return `페이지 범위 오류 (page out of range): ${page} (총 ${pages}페이지, 0-based)`;
    }
    const svg = renderPageSvg(doc, page);
    if (!args.output_path) {
      return svg; // return raw SVG for in-line consumption
    }
    writeFileSync(args.output_path, svg);
    return `SVG 저장 완료 (saved): ${args.output_path}\n페이지: ${page + 1}/${pages} | 크기: ${svg.length} bytes`;
  } catch (e) {
    return `렌더 오류 (render error): ${(e as Error).message}`;
  } finally {
    closeDocument(doc);
  }
}

export async function renderHwpAllPages(args: RenderAllArgs): Promise<string> {
  let doc;
  try {
    doc = await openDocument(args.file_path);
  } catch (e) {
    return (e as Error).message;
  }
  try {
    const pages = getPageCount(doc);
    if (pages === 0) return "(렌더할 페이지가 없습니다 / no pages)";
    const baseName = basename(args.file_path, extname(args.file_path));
    const outDir = args.output_dir
      ? resolve(args.output_dir)
      : resolve(dirname(args.file_path), `${baseName}_pages`);
    mkdirSync(outDir, { recursive: true });
    const limit = Math.min(args.max_pages ?? pages, pages);
    const saved: string[] = [];
    for (let i = 0; i < limit; i++) {
      const svg = renderPageSvg(doc, i);
      const fname = `page_${String(i + 1).padStart(3, "0")}.svg`;
      writeFileSync(join(outDir, fname), svg);
      saved.push(fname);
    }
    return [
      `${saved.length}/${pages} 페이지 SVG 저장 (rendered ${saved.length}/${pages} pages):`,
      `저장 위치 (output): ${outDir}`,
      "",
      ...saved.slice(0, 10).map((s) => `  - ${s}`),
      saved.length > 10 ? `  ... and ${saved.length - 10} more` : "",
    ].filter(Boolean).join("\n");
  } catch (e) {
    return `렌더 오류 (render error): ${(e as Error).message}`;
  } finally {
    closeDocument(doc);
  }
}
