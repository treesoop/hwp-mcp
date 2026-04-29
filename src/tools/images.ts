import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import {
  closeDocument,
  getImageBytes,
  openDocument,
  walkImages,
} from "../core/document.js";

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
