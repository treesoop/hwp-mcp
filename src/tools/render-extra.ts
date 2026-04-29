import { writeFileSync } from "node:fs";
import {
  closeDocument,
  getPageCount,
  openDocument,
} from "../core/document.js";
import { initRhwp } from "../core/wasm-init.js";

export interface RenderHtmlArgs {
  file_path: string;
  page?: number;
  output_path?: string;
}

export async function renderHwpHtml(args: RenderHtmlArgs): Promise<string> {
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
    const html = doc.renderPageHtml(page);
    if (!args.output_path) return html;
    writeFileSync(args.output_path, html);
    return `HTML 저장 완료 (saved): ${args.output_path}\n페이지: ${page + 1}/${pages} | 크기: ${html.length} bytes`;
  } catch (e) {
    return `HTML 렌더 오류 (HTML render error): ${(e as Error).message}`;
  } finally {
    closeDocument(doc);
  }
}

export interface RenderEqArgs {
  script: string;
  font_size?: number;
  color?: number;
}

export async function renderHwpEquationSvg(args: RenderEqArgs): Promise<string> {
  await initRhwp();
  const { HwpDocument } = await import("@rhwp/core");
  const doc = HwpDocument.createEmpty();
  try {
    const fontSize = args.font_size ?? 1300;
    const color = args.color ?? 0;
    return doc.renderEquationPreview(args.script, fontSize, color);
  } catch (e) {
    return `수식 렌더 오류 (equation render error): ${(e as Error).message}`;
  } finally {
    doc.free();
  }
}
