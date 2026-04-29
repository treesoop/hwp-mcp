import { existsSync } from "node:fs";
import { extname } from "node:path";
import { getFormatFromPath } from "../core/document.js";
import {
  appendHwpxParagraph,
  appendHwpxTableColumn,
  appendHwpxTableRow,
  applyHwpxTextStyle,
  deleteHwpxImage,
  deleteHwpxParagraph,
  deleteHwpxTableColumn,
  deleteHwpxTableRow,
  insertHwpxImage,
  setHwpxCellText,
  setHwpxFieldValue,
  setHwpxParagraphText,
  type TextStyle,
} from "../core/hwpx-mutate.js";

function defaultOutput(input: string, suffix: string): string {
  const ext = extname(input);
  const base = input.slice(0, input.length - ext.length);
  return `${base}_${suffix}${ext}`;
}

function preflight(filePath: string): string | null {
  if (!existsSync(filePath)) return `파일을 찾을 수 없습니다 (file not found): ${filePath}`;
  let fmt;
  try {
    fmt = getFormatFromPath(filePath);
  } catch (e) {
    return (e as Error).message;
  }
  if (fmt !== "hwpx") {
    return "v0.2은 .hwpx 편집만 지원합니다 (edit tools support .hwpx only in v0.2).";
  }
  return null;
}

export interface AppendParaArgs {
  file_path: string;
  text: string;
  output_path?: string;
}

export async function appendHwpParagraph(args: AppendParaArgs): Promise<string> {
  const err = preflight(args.file_path);
  if (err) return err;
  const out = args.output_path && args.output_path.length > 0
    ? args.output_path
    : defaultOutput(args.file_path, "appended");
  try {
    const r = await appendHwpxParagraph(args.file_path, out, args.text);
    return `문단 추가 (paragraph appended): ${r.inserted}건\n저장 (saved): ${out}`;
  } catch (e) {
    return `문단 추가 오류 (append error): ${(e as Error).message}`;
  }
}

export interface DeleteParaArgs {
  file_path: string;
  index: number;
  output_path?: string;
}

export async function deleteHwpParagraph(args: DeleteParaArgs): Promise<string> {
  const err = preflight(args.file_path);
  if (err) return err;
  const out = args.output_path && args.output_path.length > 0
    ? args.output_path
    : defaultOutput(args.file_path, "deleted");
  try {
    const r = await deleteHwpxParagraph(args.file_path, out, args.index);
    if (r.deleted === 0) return `인덱스 범위 초과 (index out of range): ${args.index} (총 ${r.total})`;
    return `문단 ${args.index} 삭제 (deleted): 1건 / 전체 ${r.total}\n저장 (saved): ${out}`;
  } catch (e) {
    return `문단 삭제 오류 (delete error): ${(e as Error).message}`;
  }
}

export interface AppendRowArgs {
  file_path: string;
  table_index: number;
  cells: string;
  output_path?: string;
}

export async function appendHwpTableRow(args: AppendRowArgs): Promise<string> {
  const err = preflight(args.file_path);
  if (err) return err;
  let cells: string[];
  try {
    cells = JSON.parse(args.cells);
    if (!Array.isArray(cells)) throw new Error("cells must be a JSON string array");
  } catch (e) {
    return `cells JSON 파싱 오류 (cells JSON error): ${(e as Error).message}`;
  }
  const out = args.output_path && args.output_path.length > 0
    ? args.output_path
    : defaultOutput(args.file_path, "row-added");
  try {
    const r = await appendHwpxTableRow(args.file_path, out, args.table_index, cells);
    return `표 ${args.table_index} 행 추가 (row appended): 1건, ${r.tableCols}열\n저장 (saved): ${out}`;
  } catch (e) {
    return `표 행 추가 오류 (append row error): ${(e as Error).message}`;
  }
}

export interface DeleteRowArgs {
  file_path: string;
  table_index: number;
  row_index: number;
  output_path?: string;
}

export async function deleteHwpTableRow(args: DeleteRowArgs): Promise<string> {
  const err = preflight(args.file_path);
  if (err) return err;
  const out = args.output_path && args.output_path.length > 0
    ? args.output_path
    : defaultOutput(args.file_path, "row-deleted");
  try {
    const r = await deleteHwpxTableRow(args.file_path, out, args.table_index, args.row_index);
    if (r.deleted === 0) return `행 인덱스 범위 초과 (row index out of range): ${args.row_index} (남은 ${r.remaining})`;
    return `표 ${args.table_index} 행 ${args.row_index} 삭제 (deleted)\n남은 행: ${r.remaining}\n저장 (saved): ${out}`;
  } catch (e) {
    return `표 행 삭제 오류 (delete row error): ${(e as Error).message}`;
  }
}

export interface SetFieldArgs {
  file_path: string;
  name: string;
  value: string;
  output_path?: string;
}

export async function setHwpFieldValue(args: SetFieldArgs): Promise<string> {
  const err = preflight(args.file_path);
  if (err) return err;
  const out = args.output_path && args.output_path.length > 0
    ? args.output_path
    : defaultOutput(args.file_path, "field-set");
  try {
    const r = await setHwpxFieldValue(args.file_path, out, args.name, args.value);
    if (r.replaced === 0) return `필드를 찾지 못했습니다 (field not found): ${args.name}`;
    return `필드 '${args.name}' = '${args.value}' (replaced ${r.replaced})\n저장 (saved): ${out}`;
  } catch (e) {
    return `필드 설정 오류 (set field error): ${(e as Error).message}`;
  }
}

export interface SetParaTextArgs {
  file_path: string;
  index: number;
  text: string;
  output_path?: string;
}

export async function setHwpParagraphText(args: SetParaTextArgs): Promise<string> {
  const err = preflight(args.file_path);
  if (err) return err;
  const out = args.output_path && args.output_path.length > 0
    ? args.output_path
    : defaultOutput(args.file_path, "para-set");
  try {
    const r = await setHwpxParagraphText(args.file_path, out, args.index, args.text);
    if (r.replaced === 0) return `인덱스 범위 초과 (index out of range): ${args.index} (전체 ${r.total})`;
    return `문단 ${args.index} 텍스트 설정 (paragraph text set)\n저장 (saved): ${out}`;
  } catch (e) {
    return `문단 텍스트 설정 오류 (set paragraph text error): ${(e as Error).message}`;
  }
}

export interface SetCellTextArgs {
  file_path: string;
  table_index: number;
  row: number;
  col: number;
  text: string;
  output_path?: string;
}

export async function setHwpCellText(args: SetCellTextArgs): Promise<string> {
  const err = preflight(args.file_path);
  if (err) return err;
  const out = args.output_path && args.output_path.length > 0
    ? args.output_path
    : defaultOutput(args.file_path, "cell-set");
  try {
    await setHwpxCellText(args.file_path, out, args.table_index, args.row, args.col, args.text);
    return `표 ${args.table_index} 셀 (${args.row},${args.col}) 텍스트 설정\n저장 (saved): ${out}`;
  } catch (e) {
    return `셀 텍스트 설정 오류 (set cell text error): ${(e as Error).message}`;
  }
}

export interface AppendColumnArgs {
  file_path: string;
  table_index: number;
  cells: string;
  output_path?: string;
}

export async function appendHwpTableColumn(args: AppendColumnArgs): Promise<string> {
  const err = preflight(args.file_path);
  if (err) return err;
  let cells: string[];
  try {
    cells = JSON.parse(args.cells);
    if (!Array.isArray(cells)) throw new Error("cells must be a JSON string array");
  } catch (e) {
    return `cells JSON 파싱 오류 (cells JSON error): ${(e as Error).message}`;
  }
  const out = args.output_path && args.output_path.length > 0
    ? args.output_path
    : defaultOutput(args.file_path, "col-added");
  try {
    const r = await appendHwpxTableColumn(args.file_path, out, args.table_index, cells);
    return `표 ${args.table_index} 열 추가 (column appended): ${r.inserted}개 셀, ${r.rows}행 영향\n저장 (saved): ${out}`;
  } catch (e) {
    return `표 열 추가 오류 (append column error): ${(e as Error).message}`;
  }
}

export interface DeleteColumnArgs {
  file_path: string;
  table_index: number;
  col_index: number;
  output_path?: string;
}

export async function deleteHwpTableColumn(args: DeleteColumnArgs): Promise<string> {
  const err = preflight(args.file_path);
  if (err) return err;
  const out = args.output_path && args.output_path.length > 0
    ? args.output_path
    : defaultOutput(args.file_path, "col-deleted");
  try {
    const r = await deleteHwpxTableColumn(args.file_path, out, args.table_index, args.col_index);
    return `표 ${args.table_index} 열 ${args.col_index} 삭제 (deleted) — ${r.rowsAffected}행 영향\n저장 (saved): ${out}`;
  } catch (e) {
    return `표 열 삭제 오류 (delete column error): ${(e as Error).message}`;
  }
}

export interface InsertImageArgs {
  file_path: string;
  source_path: string;
  ext?: string;
  output_path?: string;
}

export async function insertHwpImage(args: InsertImageArgs): Promise<string> {
  const err = preflight(args.file_path);
  if (err) return err;
  if (!existsSync(args.source_path)) {
    return `이미지 소스 파일 없음 (source not found): ${args.source_path}`;
  }
  const out = args.output_path && args.output_path.length > 0
    ? args.output_path
    : defaultOutput(args.file_path, "img-added");
  const allowedExts = new Set(["png", "jpg", "bmp", "gif"]);
  const ext = (args.ext ?? extname(args.source_path).slice(1).toLowerCase()) as "png" | "jpg" | "bmp" | "gif";
  if (!allowedExts.has(ext)) {
    return `지원하지 않는 형식 (unsupported ext): .${ext}. png/jpg/bmp/gif 만 지원.`;
  }
  try {
    const r = await insertHwpxImage(args.file_path, out, args.source_path, ext);
    return `이미지 삽입 완료 (image inserted): ${r.entry} (id=${r.itemId})\n저장 (saved): ${out}`;
  } catch (e) {
    return `이미지 삽입 오류 (insert image error): ${(e as Error).message}`;
  }
}

export interface ApplyStyleArgs {
  file_path: string;
  target_text: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  font_size?: number;
  output_path?: string;
}

export async function applyHwpTextStyle(args: ApplyStyleArgs): Promise<string> {
  const err = preflight(args.file_path);
  if (err) return err;
  const out = args.output_path && args.output_path.length > 0
    ? args.output_path
    : defaultOutput(args.file_path, "styled");
  const style: TextStyle = {};
  if (args.color) style.color = args.color.replace(/^#/, "");
  if (args.bold !== undefined) style.bold = args.bold;
  if (args.italic !== undefined) style.italic = args.italic;
  if (args.underline !== undefined) style.underline = args.underline;
  if (args.font_size !== undefined) style.fontSize = args.font_size;
  try {
    const r = await applyHwpxTextStyle(args.file_path, out, args.target_text, style);
    if (r.retargeted === 0) return `대상 텍스트를 찾지 못했습니다 (target not found): ${args.target_text}`;
    return `텍스트 서식 적용 (style applied): '${args.target_text}' → charPrId=${r.charPrId}\n저장 (saved): ${out}`;
  } catch (e) {
    return `서식 적용 오류 (style error): ${(e as Error).message}`;
  }
}

export interface DeleteImageArgs {
  file_path: string;
  target: string;
  output_path?: string;
}

export async function deleteHwpImage(args: DeleteImageArgs): Promise<string> {
  const err = preflight(args.file_path);
  if (err) return err;
  const out = args.output_path && args.output_path.length > 0
    ? args.output_path
    : defaultOutput(args.file_path, "img-removed");
  try {
    const r = await deleteHwpxImage(args.file_path, out, args.target);
    if (!r.deleted) return `대상 이미지를 찾지 못했습니다 (target not found): ${args.target}`;
    return `이미지 삭제 (deleted): ${r.deleted}\n저장 (saved): ${out}`;
  } catch (e) {
    return `이미지 삭제 오류 (delete error): ${(e as Error).message}`;
  }
}
