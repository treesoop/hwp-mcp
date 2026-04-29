import { existsSync } from "node:fs";
import { extname } from "node:path";
import { getFormatFromPath } from "../core/document.js";
import {
  listHwpxBinDataEntries,
  replaceHwpxImages,
} from "../core/hwpx-mutate.js";

export interface ReplaceImageArgs {
  file_path: string;
  target: string;
  source_path: string;
  output_path?: string;
}

function defaultOutputPath(input: string, suffix: string): string {
  const ext = extname(input);
  const base = input.slice(0, input.length - ext.length);
  return `${base}_${suffix}${ext}`;
}

export async function replaceHwpImage(args: ReplaceImageArgs): Promise<string> {
  if (!existsSync(args.file_path)) {
    return `파일을 찾을 수 없습니다 (file not found): ${args.file_path}`;
  }
  if (!existsSync(args.source_path)) {
    return `대체 이미지 파일을 찾을 수 없습니다 (replacement file not found): ${args.source_path}`;
  }
  let fmt;
  try {
    fmt = getFormatFromPath(args.file_path);
  } catch (e) {
    return (e as Error).message;
  }
  if (fmt !== "hwpx") {
    return "v0.2은 .hwpx 이미지 교체만 지원합니다 (image replace supports .hwpx only in v0.2).";
  }
  const outputPath =
    args.output_path && args.output_path.length > 0
      ? args.output_path
      : defaultOutputPath(args.file_path, "img");
  try {
    const r = await replaceHwpxImages(args.file_path, outputPath, {
      [args.target]: args.source_path,
    });
    if (r.total === 0) {
      const entries = await listHwpxBinDataEntries(args.file_path);
      return [
        `대상 이미지를 찾지 못했습니다 (target not found): ${args.target}`,
        `사용 가능한 BinData 엔트리:`,
        ...entries.map((e) => `  - ${e}`),
      ].join("\n");
    }
    const rep = r.replaced[0];
    return `이미지 교체 완료 (replaced): ${rep.entry} ← ${rep.from} (${rep.bytes} bytes)\n저장 (saved): ${outputPath}`;
  } catch (e) {
    return `이미지 교체 오류 (image replace error): ${(e as Error).message}`;
  }
}

export interface ListBinDataArgs {
  file_path: string;
}

export async function listHwpBinData(args: ListBinDataArgs): Promise<string> {
  if (!existsSync(args.file_path)) {
    return `파일을 찾을 수 없습니다 (file not found): ${args.file_path}`;
  }
  let fmt;
  try {
    fmt = getFormatFromPath(args.file_path);
  } catch (e) {
    return (e as Error).message;
  }
  if (fmt !== "hwpx") {
    return "v0.2은 .hwpx 만 지원 (BinData listing requires .hwpx in v0.2).";
  }
  const entries = await listHwpxBinDataEntries(args.file_path);
  if (entries.length === 0) return "(BinData 엔트리 없음 / no BinData entries)";
  return entries.map((e, i) => `${i + 1}. ${e}`).join("\n");
}
