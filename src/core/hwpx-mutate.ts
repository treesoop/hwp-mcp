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
