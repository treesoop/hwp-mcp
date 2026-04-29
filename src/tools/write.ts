import { existsSync, writeFileSync } from "node:fs";
import { extname } from "node:path";
import { HwpDocument } from "@rhwp/core";
import { copyFile } from "node:fs/promises";
import {
  closeDocument,
  getFormatFromPath,
  openDocument,
  walkText,
} from "../core/document.js";
import { initRhwp } from "../core/wasm-init.js";
import { mutateHwpxText } from "../core/hwpx-mutate.js";

export interface ReplaceTextArgs {
  file_path: string;
  old_text: string;
  new_text: string;
  output_path?: string;
}
export interface FillTemplateArgs {
  file_path: string;
  replacements: string;
  output_path?: string;
}
export interface CreateHwpxArgs {
  output_path: string;
  content: string;
}

type ContentItem =
  | { type: "text"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] };

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

function rejectIfHwp(inputPath: string): string | null {
  if (getFormatFromPath(inputPath) === "hwp") {
    return (
      "v0.2은 .hwp 쓰기를 지원하지 않습니다. .hwpx 파일을 사용하거나 한컴 오피스로 .hwpx로 저장 후 시도하세요. " +
      "(write tools support .hwpx only in v0.2; .hwp write is planned for v0.3.)"
    );
  }
  return null;
}

export async function replaceHwpText(args: ReplaceTextArgs): Promise<string> {
  if (!existsSync(args.file_path)) {
    return `파일을 찾을 수 없습니다 (file not found): ${args.file_path}`;
  }
  let inFmt;
  try {
    inFmt = getFormatFromPath(args.file_path);
  } catch (e) {
    return (e as Error).message;
  }
  const outputPath =
    args.output_path && args.output_path.length > 0
      ? args.output_path
      : defaultOutputPath(args.file_path, "modified");
  try {
    ensureSameFormat(args.file_path, outputPath);
  } catch (e) {
    return (e as Error).message;
  }
  const reject = rejectIfHwp(args.file_path);
  if (reject) return reject;

  // .hwpx path — direct mutation, no rhwp export needed.
  try {
    const r = await mutateHwpxText(args.file_path, outputPath, {
      [args.old_text]: args.new_text,
    });
    return `'${args.old_text}' → '${args.new_text}': ${r.total}건 교체 (replaced ${r.total})\n저장 (saved): ${outputPath}`;
  } catch (e) {
    return `텍스트 교체 오류 (replace error): ${(e as Error).message}`;
  }
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

  if (!existsSync(args.file_path)) {
    return `파일을 찾을 수 없습니다 (file not found): ${args.file_path}`;
  }
  try {
    getFormatFromPath(args.file_path);
  } catch (e) {
    return (e as Error).message;
  }
  const outputPath =
    args.output_path && args.output_path.length > 0
      ? args.output_path
      : defaultOutputPath(args.file_path, "filled");
  try {
    ensureSameFormat(args.file_path, outputPath);
  } catch (e) {
    return (e as Error).message;
  }
  const reject = rejectIfHwp(args.file_path);
  if (reject) return reject;

  try {
    const r = await mutateHwpxText(args.file_path, outputPath, map);
    const lines = [
      `저장 완료 (saved): ${outputPath}`,
      `총 ${r.total}건 치환 (${r.total} replacements)`,
      "",
    ];
    for (const [k, n] of Object.entries(r.perKey)) {
      lines.push(`  '${k}' → ${n}건`);
    }
    return lines.join("\n");
  } catch (e) {
    return `치환 오류 (replace error): ${(e as Error).message}`;
  }
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

  // Strategy:
  //   1) Build a doc via @rhwp/core in memory (text-only round-trips fine in
  //      .hwpx; tables/images do not, so we render tables as plain text rows
  //      with separator pipes — sufficient for v0.2 scope, fully working in
  //      v0.3 once we generate OWPML directly).
  //   2) exportHwpx and write.
  await initRhwp();
  const doc = HwpDocument.createEmpty();
  doc.createBlankDocument();
  try {
    let first = true;
    for (const item of items) {
      const sec = doc.getSectionCount() - 1;
      const para = doc.getParagraphCount(sec) - 1;
      const tail = doc.getParagraphLength(sec, para);
      if (item.type === "text") {
        const prefix = first && tail === 0 ? "" : "\n";
        doc.insertText(sec, para, tail, prefix + item.text);
        first = false;
      } else if (item.type === "table") {
        // Render tables as flat lines until v0.3 adds OWPML table generation.
        const lines: string[] = [];
        lines.push(item.headers.join(" | "));
        lines.push(item.headers.map(() => "---").join(" | "));
        for (const row of item.rows) lines.push(row.join(" | "));
        const block = (first && tail === 0 ? "" : "\n") + lines.join("\n");
        doc.insertText(sec, para, tail, block);
        first = false;
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

// Internal helper kept for tests/diagnostic round-trip checks.
export async function _readBackText(path: string): Promise<string> {
  const doc = await openDocument(path);
  try {
    return walkText(doc);
  } finally {
    closeDocument(doc);
  }
}

// Suppress unused import warning when copyFile isn't directly used yet.
void copyFile;
