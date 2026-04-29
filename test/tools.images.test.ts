import { describe, it, expect, afterEach } from "vitest";
import { rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listHwpImages, extractHwpImages } from "../src/tools/images.js";

const tmp = join(tmpdir(), `hwp-mcp-test-${process.pid}`);

afterEach(() => {
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
});

describe("listHwpImages / extractHwpImages", () => {
  it("lists images with mime info", async () => {
    const out = await listHwpImages({ file_path: "test/fixtures/simple.hwp" });
    expect(out).toMatch(/png|image/i);
  });

  it("returns 'no images' for empty.hwp", async () => {
    const out = await listHwpImages({ file_path: "test/fixtures/empty.hwp" });
    expect(out).toMatch(/이미지가 없습니다|no images/);
  });

  it("extracts image files to a directory", async () => {
    const out = await extractHwpImages({
      file_path: "test/fixtures/simple.hwp",
      output_dir: tmp,
    });
    expect(out).toMatch(/이미지|extracted/);
    const files = readdirSync(tmp);
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(files.some((f) => f.endsWith(".png"))).toBe(true);
  });
});
