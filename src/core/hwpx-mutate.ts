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
  const trRegex = /<hp:tr>[\s\S]*?<\/hp:tr>/g;
  const trs = [...tableXml.matchAll(trRegex)];
  if (trs.length === 0) throw new Error("No <hp:tr> found in target table");
  const lastTr = trs[trs.length - 1][0];
  // Count <hp:tc> in last row to know column count
  const tcs = lastTr.match(/<hp:tc>/g) ?? [];
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
