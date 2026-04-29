import { basename, extname } from "node:path";
import {
  closeDocument,
  openDocument,
  tableToMarkdown,
  walkImages,
  walkTables,
  walkText,
} from "../core/document.js";

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
        out.push(
          `${i + 1}. [section ${img.section}, para ${img.paragraph}, ctrl ${img.controlIdx}] ${img.mime} (${img.byteLength} bytes)`
        );
      });
    }

    return out.join("\n");
  } catch (e) {
    return `파일 읽기 오류 (read error): ${(e as Error).message}`;
  } finally {
    closeDocument(doc);
  }
}
