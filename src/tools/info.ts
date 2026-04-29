import {
  closeDocument,
  getPageCount,
  openDocument,
  walkEquations,
  walkFootnotes,
  walkHeadersFooters,
  walkImages,
  walkTables,
} from "../core/document.js";

export interface FilePathArgs {
  file_path: string;
}

export async function getHwpInfo(args: FilePathArgs): Promise<string> {
  let doc;
  try {
    doc = await openDocument(args.file_path);
  } catch (e) {
    return (e as Error).message;
  }
  try {
    let infoRaw = "";
    try {
      infoRaw = doc.getDocumentInfo();
    } catch {
      /* old build */
    }
    let info: { version?: string; sectionCount?: number; pageCount?: number; encrypted?: boolean; fontsUsed?: string[] } = {};
    try {
      info = JSON.parse(infoRaw);
    } catch {
      /* not JSON */
    }
    const pages = getPageCount(doc);
    const tables = walkTables(doc).length;
    const images = walkImages(doc).length;
    const fns = walkFootnotes(doc).length;
    const eqs = walkEquations(doc).length;
    const hf = walkHeadersFooters(doc);
    const headers = hf.filter((h) => h.kind === "header").length;
    const footers = hf.filter((h) => h.kind === "footer").length;

    return [
      `# ${args.file_path}`,
      `버전 (version): ${info.version ?? "?"}`,
      `섹션 (sections): ${info.sectionCount ?? doc.getSectionCount()}`,
      `페이지 (pages): ${info.pageCount ?? pages}`,
      `암호화 (encrypted): ${info.encrypted ?? false}`,
      `사용 글꼴 (fonts): ${(info.fontsUsed ?? []).slice(0, 10).join(", ") || "?"}`,
      ``,
      `표 (tables): ${tables}`,
      `이미지 (images): ${images}`,
      `각주 (footnotes): ${fns}`,
      `수식 (equations): ${eqs}`,
      `머리말 (headers): ${headers}`,
      `꼬리말 (footers): ${footers}`,
    ].join("\n");
  } catch (e) {
    return `정보 조회 오류 (info error): ${(e as Error).message}`;
  } finally {
    closeDocument(doc);
  }
}

export async function listHwpFields(args: FilePathArgs): Promise<string> {
  let doc;
  try {
    doc = await openDocument(args.file_path);
  } catch (e) {
    return (e as Error).message;
  }
  try {
    let raw: string;
    try {
      raw = doc.getFieldList();
    } catch (e) {
      return `필드 목록 오류 (field list error): ${(e as Error).message}`;
    }
    let list: any[] = [];
    try {
      list = JSON.parse(raw);
    } catch {
      return raw; // return as-is if not JSON
    }
    if (!Array.isArray(list) || list.length === 0) {
      return "(필드가 없습니다 / no fields)";
    }
    return list
      .map((f, i) => {
        const name = f?.name ?? f?.field_name ?? f?.fieldName ?? "?";
        const type = f?.type ?? f?.fieldType ?? "";
        const value = f?.value ?? "";
        return `${i + 1}. ${name}${type ? ` [${type}]` : ""}${value ? ` = ${String(value).slice(0, 40)}` : ""}`;
      })
      .join("\n");
  } finally {
    closeDocument(doc);
  }
}
