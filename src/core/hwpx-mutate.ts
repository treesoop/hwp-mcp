import { readFile, writeFile } from "node:fs/promises";
import JSZip from "jszip";

export interface MutationResult {
  total: number;
  perKey: Record<string, number>;
}

/**
 * Read a .hwpx file, apply text replacements inside `Contents/section*.xml`,
 * and write a new .hwpx. Operates on the raw OWPML XML, bypassing rhwp's
 * exportHwpx() (which currently does not preserve in-memory edits in 0.7.7).
 *
 * Limitations: a single hp:t text node holds the search target as a contiguous
 * substring. Splits across runs (e.g. "산업" in one <hp:t>, "AI" in the next)
 * are NOT joined and will not match. This mirrors hwpctl's text replace
 * semantics, which is acceptable for MCP-driven template fills.
 */
export async function mutateHwpxText(
  inputPath: string,
  outputPath: string,
  replacements: Record<string, string>
): Promise<MutationResult> {
  const bytes = await readFile(inputPath);
  const zip = await JSZip.loadAsync(bytes);

  const counts: Record<string, number> = {};
  let total = 0;

  const sectionFiles = Object.keys(zip.files).filter((n) =>
    /^Contents\/section\d+\.xml$/i.test(n)
  );

  for (const fname of sectionFiles) {
    const file = zip.files[fname];
    let xml = await file.async("string");
    for (const [key, value] of Object.entries(replacements)) {
      const escapedXml = xmlEscape(value);
      // Only replace inside <hp:t>...</hp:t> text nodes, to avoid touching
      // tag names or attribute values.
      const pattern = new RegExp(
        "(<hp:t(?:\\s[^>]*)?>)([^<]*)(" +
          escapeRegex(key) +
          ")([^<]*)(</hp:t>)",
        "g"
      );
      let didReplace = true;
      while (didReplace) {
        didReplace = false;
        xml = xml.replace(pattern, (_match, open, pre, _hit, post, close) => {
          counts[key] = (counts[key] ?? 0) + 1;
          total += 1;
          didReplace = true;
          return open + pre + escapedXml + post + close;
        });
        // Loop because a single node may contain multiple occurrences;
        // String.replace with /g consumes from current position, so one pass
        // catches all non-overlapping. Set didReplace=false after one pass.
        break;
      }
    }
    zip.file(fname, xml);
  }

  // mimetype must remain stored (uncompressed); JSZip preserves per-file
  // compression options if we re-set them.
  if (zip.files["mimetype"]) {
    const mt = await zip.files["mimetype"].async("string");
    zip.file("mimetype", mt, { compression: "STORE" });
  }

  const out = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  await writeFile(outputPath, out);

  for (const k of Object.keys(replacements)) {
    if (counts[k] === undefined) counts[k] = 0;
  }
  return { total, perKey: counts };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export interface ImageReplaceMap {
  /** Either "image1.bmp" (basename) or "BinData/image1.bmp" (full entry path).
   * Bytes from the new file fully replace the existing entry. */
  [target: string]: string; // value = path to source file on disk
}

export interface ImageReplaceResult {
  total: number;
  replaced: { entry: string; from: string; bytes: number }[];
  skipped: string[];
}

export async function replaceHwpxImages(
  inputPath: string,
  outputPath: string,
  replacements: ImageReplaceMap
): Promise<ImageReplaceResult> {
  const bytes = await readFile(inputPath);
  const zip = await JSZip.loadAsync(bytes);

  const entryNames = Object.keys(zip.files).filter((n) => n.startsWith("BinData/"));
  const result: ImageReplaceResult = { total: 0, replaced: [], skipped: [] };

  for (const [target, sourcePath] of Object.entries(replacements)) {
    const fullEntry = target.includes("/") ? target : `BinData/${target}`;
    const match = entryNames.find(
      (n) => n === fullEntry || n.endsWith("/" + target) || n === target
    );
    if (!match) {
      result.skipped.push(target);
      continue;
    }
    const newBytes = await readFile(sourcePath);
    zip.file(match, newBytes);
    result.replaced.push({ entry: match, from: sourcePath, bytes: newBytes.byteLength });
    result.total += 1;
  }

  if (zip.files["mimetype"]) {
    const mt = await zip.files["mimetype"].async("string");
    zip.file("mimetype", mt, { compression: "STORE" });
  }
  const out = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  await writeFile(outputPath, out);
  return result;
}

export async function listHwpxBinDataEntries(inputPath: string): Promise<string[]> {
  const bytes = await readFile(inputPath);
  const zip = await JSZip.loadAsync(bytes);
  return Object.keys(zip.files)
    .filter((n) => n.startsWith("BinData/"))
    .sort();
}

// ---------- Structured edits via XML clone-and-mutate ----------

const PARA_REGEX = /<hp:p [^>]*>[\s\S]*?<\/hp:p>/g;

async function loadSection(inputPath: string): Promise<{ zip: JSZip; sectionName: string; xml: string }> {
  const bytes = await readFile(inputPath);
  const zip = await JSZip.loadAsync(bytes);
  const sectionName = Object.keys(zip.files).find((n) => /^Contents\/section\d+\.xml$/i.test(n));
  if (!sectionName) throw new Error("No Contents/section*.xml found in .hwpx");
  const xml = await zip.files[sectionName].async("string");
  return { zip, sectionName, xml };
}

async function writeSection(zip: JSZip, sectionName: string, xml: string, outputPath: string): Promise<void> {
  zip.file(sectionName, xml);
  if (zip.files["mimetype"]) {
    const mt = await zip.files["mimetype"].async("string");
    zip.file("mimetype", mt, { compression: "STORE" });
  }
  const out = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  await writeFile(outputPath, out);
}

function freshId(): string {
  return String(Math.floor(Math.random() * 4_000_000_000));
}

export async function appendHwpxParagraph(
  inputPath: string,
  outputPath: string,
  text: string
): Promise<{ inserted: number }> {
  const { zip, sectionName, xml } = await loadSection(inputPath);
  const matches = [...xml.matchAll(PARA_REGEX)];
  if (matches.length === 0) throw new Error("No <hp:p> paragraph found in section to clone");
  const last = matches[matches.length - 1][0];
  // Extract <hp:p> attributes (paraPrIDRef, styleIDRef, etc.) — keep them,
  // but build a minimal body to avoid cloning embedded secPr/linesegarray/etc.
  const openTagMatch = last.match(/^<hp:p ([^>]*)>/);
  if (!openTagMatch) throw new Error("Could not parse <hp:p> opening tag");
  const attrs = openTagMatch[1].replace(/\s*id="\d+"\s*/, ` id="${freshId()}" `);
  // Find a charPrIDRef from any <hp:run ...> inside the cloned para; default 0.
  const charPrMatch = last.match(/<hp:run [^>]*charPrIDRef="(\d+)"/);
  const charPrId = charPrMatch ? charPrMatch[1] : "0";
  const newPara =
    `<hp:p ${attrs}>` +
    `<hp:run charPrIDRef="${charPrId}"><hp:t>${xmlEscape(text)}</hp:t></hp:run>` +
    `</hp:p>`;
  const newXml = xml.replace(/<\/hs:sec>\s*$/, newPara + "</hs:sec>");
  await writeSection(zip, sectionName, newXml, outputPath);
  return { inserted: 1 };
}

export async function deleteHwpxParagraph(
  inputPath: string,
  outputPath: string,
  index: number
): Promise<{ deleted: number; total: number }> {
  const { zip, sectionName, xml } = await loadSection(inputPath);
  const matches = [...xml.matchAll(PARA_REGEX)];
  if (index < 0 || index >= matches.length) {
    return { deleted: 0, total: matches.length };
  }
  const target = matches[index][0];
  const newXml = xml.replace(target, "");
  await writeSection(zip, sectionName, newXml, outputPath);
  return { deleted: 1, total: matches.length };
}

export async function appendHwpxTableRow(
  inputPath: string,
  outputPath: string,
  tableIndex: number,
  cells: string[]
): Promise<{ inserted: number; tableCols: number }> {
  const { zip, sectionName, xml } = await loadSection(inputPath);
  // Find all <hp:tbl ...>...</hp:tbl>
  const tblRegex = /<hp:tbl [^>]*>[\s\S]*?<\/hp:tbl>/g;
  const tables = [...xml.matchAll(tblRegex)];
  if (tableIndex < 0 || tableIndex >= tables.length) {
    throw new Error(`Table index out of range: ${tableIndex} (found ${tables.length})`);
  }
  const tableXml = tables[tableIndex][0];
  // Find the last <hp:tr ...>...</hp:tr>
  const trRegex = /<hp:tr(?:\s[^>]*)?>[\s\S]*?<\/hp:tr>/g;
  const trs = [...tableXml.matchAll(trRegex)];
  if (trs.length === 0) throw new Error("No <hp:tr> found in target table");
  const lastTr = trs[trs.length - 1][0];
  // Count <hp:tc> in last row to know column count
  const tcs = lastTr.match(/<hp:tc(?:\s[^>]*)?>/g) ?? [];
  const tableCols = tcs.length;
  // Clone last row, replace each <hp:t>...</hp:t> with the next cell text
  // (simplification: assume each <hp:tc> contains exactly one <hp:t>)
  let cellIdx = 0;
  const newTr = lastTr.replace(/<hp:t>[^<]*<\/hp:t>/g, () => {
    const txt = cells[cellIdx] ?? "";
    cellIdx++;
    return `<hp:t>${xmlEscape(txt)}</hp:t>`;
  })
    .replace(/id="\d+"/g, () => `id="${freshId()}"`)
    .replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/g, "");
  const newTableXml = tableXml.replace(/<\/hp:tbl>\s*$/, newTr + "</hp:tbl>");
  const newXml = xml.replace(tableXml, newTableXml);
  await writeSection(zip, sectionName, newXml, outputPath);
  return { inserted: 1, tableCols };
}

export async function deleteHwpxTableRow(
  inputPath: string,
  outputPath: string,
  tableIndex: number,
  rowIndex: number
): Promise<{ deleted: number; remaining: number }> {
  const { zip, sectionName, xml } = await loadSection(inputPath);
  const tblRegex = /<hp:tbl [^>]*>[\s\S]*?<\/hp:tbl>/g;
  const tables = [...xml.matchAll(tblRegex)];
  if (tableIndex < 0 || tableIndex >= tables.length) {
    return { deleted: 0, remaining: tables.length };
  }
  const tableXml = tables[tableIndex][0];
  const trRegex = /<hp:tr(?:\s[^>]*)?>[\s\S]*?<\/hp:tr>/g;
  const trs = [...tableXml.matchAll(trRegex)];
  if (rowIndex < 0 || rowIndex >= trs.length) {
    return { deleted: 0, remaining: trs.length };
  }
  const target = trs[rowIndex][0];
  const newTableXml = tableXml.replace(target, "");
  const newXml = xml.replace(tableXml, newTableXml);
  await writeSection(zip, sectionName, newXml, outputPath);
  return { deleted: 1, remaining: trs.length - 1 };
}

export async function setHwpxFieldValue(
  inputPath: string,
  outputPath: string,
  fieldName: string,
  value: string
): Promise<{ replaced: number }> {
  const { zip, sectionName, xml } = await loadSection(inputPath);
  // OWPML field markers: <hp:fldBegin name="..." .../> ... text ... <hp:fldEnd .../>
  // Or as attribute on <hp:run>. Strategy: find each fldBegin/fldEnd pair where name matches,
  // then replace any <hp:t>...</hp:t> between them with new value (in the *first* such pair).
  // This is best-effort; full schema support comes in v0.3.
  const fldBeginRegex = new RegExp(
    `<hp:fldBegin[^/>]*name="${escapeRegex(fieldName)}"[^/>]*/?>`,
    "g"
  );
  const beginMatches = [...xml.matchAll(fldBeginRegex)];
  if (beginMatches.length === 0) {
    return { replaced: 0 };
  }
  // Take the first occurrence; find the next <hp:fldEnd .../> after it
  const begin = beginMatches[0];
  const startIdx = (begin.index ?? 0) + begin[0].length;
  const fldEndRegex = /<hp:fldEnd[^/>]*\/?>/g;
  fldEndRegex.lastIndex = startIdx;
  const endMatch = fldEndRegex.exec(xml);
  if (!endMatch) {
    return { replaced: 0 };
  }
  const before = xml.slice(0, startIdx);
  const between = xml.slice(startIdx, endMatch.index);
  const after = xml.slice(endMatch.index);
  const newBetween = between.replace(
    /<hp:t>[^<]*<\/hp:t>/g,
    `<hp:t>${xmlEscape(value)}</hp:t>`
  );
  const newXml = before + newBetween + after;
  await writeSection(zip, sectionName, newXml, outputPath);
  return { replaced: 1 };
}

export async function setHwpxParagraphText(
  inputPath: string,
  outputPath: string,
  index: number,
  text: string
): Promise<{ replaced: number; total: number }> {
  const { zip, sectionName, xml } = await loadSection(inputPath);
  const matches = [...xml.matchAll(PARA_REGEX)];
  if (index < 0 || index >= matches.length) {
    return { replaced: 0, total: matches.length };
  }
  const para = matches[index][0];
  // Replace every <hp:t>...</hp:t> with one carrying the new text;
  // collapse to a single <hp:run><hp:t>NEW</hp:t></hp:run> body inside the
  // paragraph wrapper to avoid duplicating runs.
  const open = para.match(/^<hp:p [^>]*>/)?.[0] ?? "<hp:p>";
  const close = "</hp:p>";
  const charPrMatch = para.match(/<hp:run [^>]*charPrIDRef="(\d+)"/);
  const charPrId = charPrMatch ? charPrMatch[1] : "0";
  const newPara =
    open +
    `<hp:run charPrIDRef="${charPrId}"><hp:t>${xmlEscape(text)}</hp:t></hp:run>` +
    close;
  const newXml = xml.replace(para, newPara);
  await writeSection(zip, sectionName, newXml, outputPath);
  return { replaced: 1, total: matches.length };
}

export async function setHwpxCellText(
  inputPath: string,
  outputPath: string,
  tableIndex: number,
  rowIndex: number,
  colIndex: number,
  text: string
): Promise<{ replaced: number }> {
  const { zip, sectionName, xml } = await loadSection(inputPath);
  const tblRegex = /<hp:tbl [^>]*>[\s\S]*?<\/hp:tbl>/g;
  const tables = [...xml.matchAll(tblRegex)];
  if (tableIndex < 0 || tableIndex >= tables.length) {
    throw new Error(`Table index out of range: ${tableIndex} (total ${tables.length})`);
  }
  const tableXml = tables[tableIndex][0];
  const trRegex = /<hp:tr(?:\s[^>]*)?>[\s\S]*?<\/hp:tr>/g;
  const trs = [...tableXml.matchAll(trRegex)];
  if (rowIndex < 0 || rowIndex >= trs.length) {
    throw new Error(`Row index out of range: ${rowIndex} (total ${trs.length})`);
  }
  const trXml = trs[rowIndex][0];
  const tcRegex = /<hp:tc(?:\s[^>]*)?>[\s\S]*?<\/hp:tc>/g;
  const tcs = [...trXml.matchAll(tcRegex)];
  if (colIndex < 0 || colIndex >= tcs.length) {
    throw new Error(`Col index out of range: ${colIndex} (total ${tcs.length})`);
  }
  const tcXml = tcs[colIndex][0];
  const newTcXml = tcXml.replace(/<hp:t>[^<]*<\/hp:t>/, `<hp:t>${xmlEscape(text)}</hp:t>`);
  const newTrXml = trXml.replace(tcXml, newTcXml);
  const newTableXml = tableXml.replace(trXml, newTrXml);
  const newXml = xml.replace(tableXml, newTableXml);
  await writeSection(zip, sectionName, newXml, outputPath);
  return { replaced: 1 };
}

export async function appendHwpxTableColumn(
  inputPath: string,
  outputPath: string,
  tableIndex: number,
  cellsTopToBottom: string[]
): Promise<{ inserted: number; rows: number }> {
  const { zip, sectionName, xml } = await loadSection(inputPath);
  const tblRegex = /<hp:tbl [^>]*>[\s\S]*?<\/hp:tbl>/g;
  const tables = [...xml.matchAll(tblRegex)];
  if (tableIndex < 0 || tableIndex >= tables.length) {
    throw new Error(`Table index out of range: ${tableIndex} (total ${tables.length})`);
  }
  const tableXml = tables[tableIndex][0];
  const trRegex = /<hp:tr(?:\s[^>]*)?>[\s\S]*?<\/hp:tr>/g;
  const trs = [...tableXml.matchAll(trRegex)];
  let newTableXml = tableXml;
  for (let r = 0; r < trs.length; r++) {
    const trXml = trs[r][0];
    const tcMatches = [...trXml.matchAll(/<hp:tc(?:\s[^>]*)?>[\s\S]*?<\/hp:tc>/g)];
    if (tcMatches.length === 0) continue;
    const lastTc = tcMatches[tcMatches.length - 1][0];
    const cellText = cellsTopToBottom[r] ?? "";
    const newTc = lastTc
      .replace(/<hp:t>[^<]*<\/hp:t>/g, `<hp:t>${xmlEscape(cellText)}</hp:t>`)
      .replace(/id="\d+"/g, () => `id="${freshId()}"`)
      .replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/g, "");
    const newTrXml = trXml.replace(/<\/hp:tr>\s*$/, newTc + "</hp:tr>");
    newTableXml = newTableXml.replace(trXml, newTrXml);
  }
  const newXml = xml.replace(tableXml, newTableXml);
  await writeSection(zip, sectionName, newXml, outputPath);
  return { inserted: trs.length, rows: trs.length };
}

export async function deleteHwpxTableColumn(
  inputPath: string,
  outputPath: string,
  tableIndex: number,
  colIndex: number
): Promise<{ removed: number; rowsAffected: number }> {
  const { zip, sectionName, xml } = await loadSection(inputPath);
  const tblRegex = /<hp:tbl [^>]*>[\s\S]*?<\/hp:tbl>/g;
  const tables = [...xml.matchAll(tblRegex)];
  if (tableIndex < 0 || tableIndex >= tables.length) {
    throw new Error(`Table index out of range: ${tableIndex}`);
  }
  const tableXml = tables[tableIndex][0];
  const trRegex = /<hp:tr(?:\s[^>]*)?>[\s\S]*?<\/hp:tr>/g;
  const trs = [...tableXml.matchAll(trRegex)];
  let newTableXml = tableXml;
  let affected = 0;
  for (let r = 0; r < trs.length; r++) {
    const trXml = trs[r][0];
    const tcMatches = [...trXml.matchAll(/<hp:tc(?:\s[^>]*)?>[\s\S]*?<\/hp:tc>/g)];
    if (colIndex < 0 || colIndex >= tcMatches.length) continue;
    const target = tcMatches[colIndex][0];
    const newTrXml = trXml.replace(target, "");
    newTableXml = newTableXml.replace(trXml, newTrXml);
    affected++;
  }
  const newXml = xml.replace(tableXml, newTableXml);
  await writeSection(zip, sectionName, newXml, outputPath);
  return { removed: 1, rowsAffected: affected };
}

/**
 * Insert a new image into an .hwpx by:
 *  1) adding the bytes as BinData/imgN.{ext}
 *  2) registering the entry in Contents/content.hpf manifest
 *  3) appending a new paragraph to section that contains an inline `<hp:pic>`
 *     referencing the new binary item
 */
export async function insertHwpxImage(
  inputPath: string,
  outputPath: string,
  imageSourcePath: string,
  ext: "png" | "jpg" | "bmp" | "gif" = "png"
): Promise<{ inserted: number; entry: string; itemId: string }> {
  const bytes = await readFile(inputPath);
  const zip = await JSZip.loadAsync(bytes);
  const imgBytes = await readFile(imageSourcePath);

  const existing = Object.keys(zip.files).filter((n) => n.startsWith("BinData/"));
  let n = 1;
  while (existing.some((p) => p.endsWith(`/image${n}.${ext}`) || p.endsWith(`/img${n}.${ext}`))) n++;
  const entry = `BinData/image${n}.${ext}`;
  const itemId = `image${n}`;
  zip.file(entry, imgBytes);

  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    bmp: "image/bmp",
    gif: "image/gif",
  };
  const mime = mimeMap[ext];

  // Update manifest if present
  const hpfFile = zip.files["Contents/content.hpf"];
  if (hpfFile) {
    let hpf = await hpfFile.async("string");
    const itemTag = `<opf:item id="${itemId}" href="${entry}" media-type="${mime}" isEmbeded="1"/>`;
    if (!hpf.includes(`href="${entry}"`)) {
      hpf = hpf.replace(/<\/opf:manifest>/, `${itemTag}</opf:manifest>`);
      zip.file("Contents/content.hpf", hpf);
    }
  }

  // Build a paragraph that contains a minimal <hp:pic> referencing the new item.
  // Use 100x100 mm (about 28350x28350 hwpunit, 1mm = 283.5).
  const sectionName = Object.keys(zip.files).find((s) => /^Contents\/section\d+\.xml$/i.test(s))!;
  const xml = await zip.files[sectionName].async("string");
  const matches = [...xml.matchAll(PARA_REGEX)];
  const last = matches[matches.length - 1][0];
  const charPrId = last.match(/charPrIDRef="(\d+)"/)?.[1] ?? "0";
  const paraAttrs = (last.match(/^<hp:p ([^>]*)>/)?.[1] ?? "").replace(/\s*id="\d+"\s*/, ` id="${freshId()}" `);
  const w = 28350, h = 28350; // ~100mm × 100mm
  const pic =
    `<hp:pic id="${freshId()}" zOrder="0" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${freshId()}" reverse="0">` +
    `<hp:offset x="0" y="0"/>` +
    `<hp:orgSz width="${w}" height="${h}"/>` +
    `<hp:curSz width="${w}" height="${h}"/>` +
    `<hp:flip horizontal="0" vertical="0"/>` +
    `<hp:rotationInfo angle="0" centerX="0" centerY="0" rotateimage="1"/>` +
    `<hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${w}" y="0"/><hc:pt2 x="${w}" y="${h}"/><hc:pt3 x="0" y="${h}"/></hp:imgRect>` +
    `<hp:imgClip left="0" right="${w}" top="0" bottom="${h}"/>` +
    `<hp:inMargin left="0" right="0" top="0" bottom="0"/>` +
    `<hp:imgDim dimwidth="${w}" dimheight="${h}"/>` +
    `<hc:img binaryItemIDRef="${itemId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>` +
    `<hp:effects/>` +
    `<hp:sz width="${w}" widthRelTo="ABSOLUTE" height="${h}" heightRelTo="ABSOLUTE" protect="0"/>` +
    `<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
    `<hp:outMargin left="0" right="0" top="0" bottom="0"/>` +
    `<hp:caption side="LEFT" fullSz="0" width="0" gap="0" lastWidth="${w}"/>` +
    `</hp:pic>`;
  const newPara =
    `<hp:p ${paraAttrs}>` +
    `<hp:run charPrIDRef="${charPrId}">${pic}</hp:run>` +
    `</hp:p>`;
  const newXml = xml.replace(/<\/hs:sec>\s*$/, newPara + "</hs:sec>");
  zip.file(sectionName, newXml);

  if (zip.files["mimetype"]) {
    const mt = await zip.files["mimetype"].async("string");
    zip.file("mimetype", mt, { compression: "STORE" });
  }
  const out = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  await writeFile(outputPath, out);
  return { inserted: 1, entry, itemId };
}

/**
 * Apply a charPr-style change to a text occurrence. Strategy:
 *  1) Inspect Contents/header.xml to count existing charPr definitions.
 *  2) Append a new <hh:charPr id="N">…</hh:charPr> with the desired props
 *     (color, bold, italic, fontSize) as a copy of charPr id=0 mutated.
 *  3) Replace the first <hp:run charPrIDRef="…"><hp:t>TARGET</hp:t></hp:run>
 *     with <hp:run charPrIDRef="N"><hp:t>TARGET</hp:t></hp:run>.
 *
 * Returns the number of runs successfully retargeted (0 or 1) — best-effort
 * since OWPML charPr structure varies.
 */
export interface TextStyle {
  color?: string;          // 6-digit hex e.g. "FF0000"
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSize?: number;       // HWP units; 1300 ≈ 13pt
}

export async function applyHwpxTextStyle(
  inputPath: string,
  outputPath: string,
  targetText: string,
  style: TextStyle
): Promise<{ retargeted: number; charPrId: string }> {
  const bytes = await readFile(inputPath);
  const zip = await JSZip.loadAsync(bytes);
  const headerName = Object.keys(zip.files).find((n) => /^Contents\/header\.xml$/i.test(n));
  if (!headerName) throw new Error("Contents/header.xml missing — cannot edit charPr");
  let header = await zip.files[headerName].async("string");

  // Find the existing <hh:charPrList> ... </hh:charPrList> if present, else the
  // last <hh:charPr id="..."> element block.
  const listMatch = /<hh:charPrList>([\s\S]*?)<\/hh:charPrList>/.exec(header);
  const charPrRegex = /<hh:charPr [^>]*>[\s\S]*?<\/hh:charPr>/g;
  const list = listMatch ? listMatch[1] : header;
  const all = [...list.matchAll(charPrRegex)];
  if (all.length === 0) throw new Error("No <hh:charPr> found in header.xml");
  const baseCharPr = all[0][0];
  const baseId = baseCharPr.match(/id="(\d+)"/)?.[1] ?? "0";
  const maxId = Math.max(
    ...all.map((m) => Number(m[0].match(/id="(\d+)"/)?.[1] ?? 0))
  );
  const newId = String(maxId + 1);

  // Mutate baseCharPr to a new charPr with the requested style
  let mutated = baseCharPr.replace(/id="\d+"/, `id="${newId}"`);
  if (style.color) {
    if (/<hc:color [^>]*>/.test(mutated)) {
      mutated = mutated.replace(/<hc:color [^>]*\/>/, `<hc:color val="#${style.color}"/>`);
    } else {
      mutated = mutated.replace(
        /<\/hh:charPr>/,
        `<hc:color val="#${style.color}"/></hh:charPr>`
      );
    }
  }
  // bold / italic / underline are usually attributes, not children
  if (style.bold !== undefined) {
    if (/bold="[^"]*"/.test(mutated)) {
      mutated = mutated.replace(/bold="[^"]*"/, `bold="${style.bold ? "1" : "0"}"`);
    } else {
      mutated = mutated.replace(/<hh:charPr /, `<hh:charPr bold="${style.bold ? "1" : "0"}" `);
    }
  }
  if (style.italic !== undefined) {
    if (/italic="[^"]*"/.test(mutated)) {
      mutated = mutated.replace(/italic="[^"]*"/, `italic="${style.italic ? "1" : "0"}"`);
    } else {
      mutated = mutated.replace(/<hh:charPr /, `<hh:charPr italic="${style.italic ? "1" : "0"}" `);
    }
  }
  if (style.fontSize) {
    if (/height="\d+"/.test(mutated)) {
      mutated = mutated.replace(/height="\d+"/, `height="${style.fontSize}"`);
    }
  }

  const newHeader = header.replace(baseCharPr, baseCharPr + mutated);
  zip.file(headerName, newHeader);

  // Now retarget the first run carrying targetText
  const sectionName = Object.keys(zip.files).find((n) => /^Contents\/section\d+\.xml$/i.test(n))!;
  const xml = await zip.files[sectionName].async("string");
  const runRegex = new RegExp(
    `(<hp:run )(charPrIDRef="\\d+")(>[^<]*<hp:t>[^<]*${escapeRegex(
      targetText
    )}[^<]*</hp:t>)`,
    "g"
  );
  let retargeted = 0;
  const newXml = xml.replace(runRegex, (_m, openPart, _ref, rest) => {
    if (retargeted > 0) return _m;
    retargeted = 1;
    return `${openPart}charPrIDRef="${newId}"${rest}`;
  });

  if (retargeted === 0) {
    return { retargeted: 0, charPrId: newId };
  }

  zip.file(sectionName, newXml);
  if (zip.files["mimetype"]) {
    const mt = await zip.files["mimetype"].async("string");
    zip.file("mimetype", mt, { compression: "STORE" });
  }
  const out = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  await writeFile(outputPath, out);
  return { retargeted, charPrId: newId };
}

export async function deleteHwpxImage(
  inputPath: string,
  outputPath: string,
  target: string
): Promise<{ deleted: string | null }> {
  const bytes = await readFile(inputPath);
  const zip = await JSZip.loadAsync(bytes);
  const fullEntry = target.includes("/") ? target : `BinData/${target}`;
  const entryNames = Object.keys(zip.files).filter((n) => n.startsWith("BinData/"));
  const match = entryNames.find(
    (n) => n === fullEntry || n.endsWith("/" + target) || n === target
  );
  if (!match) {
    if (zip.files["mimetype"]) {
      const mt = await zip.files["mimetype"].async("string");
      zip.file("mimetype", mt, { compression: "STORE" });
    }
    const out = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    await writeFile(outputPath, out);
    return { deleted: null };
  }
  zip.remove(match);
  if (zip.files["mimetype"]) {
    const mt = await zip.files["mimetype"].async("string");
    zip.file("mimetype", mt, { compression: "STORE" });
  }
  const out = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  await writeFile(outputPath, out);
  return { deleted: match };
}
