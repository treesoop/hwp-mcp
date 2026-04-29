import { describe, it, expect, afterEach } from "vitest";
import { existsSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderHwpPage, renderHwpAllPages } from "../src/tools/render.js";

const tmpFile = join(tmpdir(), `hwp-mcp-render-${process.pid}.svg`);
const tmpDir = join(tmpdir(), `hwp-mcp-render-dir-${process.pid}`);

afterEach(() => {
  if (existsSync(tmpFile)) rmSync(tmpFile);
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

describe("renderHwpPage", () => {
  it("returns inline SVG when no output_path is given", async () => {
    const out = await renderHwpPage({ file_path: "test/fixtures/simple.hwp", page: 0 });
    expect(out.startsWith("<svg")).toBe(true);
    expect(out.length).toBeGreaterThan(100);
  });

  it("saves SVG to disk when output_path is given", async () => {
    const out = await renderHwpPage({
      file_path: "test/fixtures/simple.hwp",
      page: 0,
      output_path: tmpFile,
    });
    expect(out).toMatch(/저장 완료|saved/);
    expect(existsSync(tmpFile)).toBe(true);
  });

  it("rejects out-of-range page", async () => {
    const out = await renderHwpPage({
      file_path: "test/fixtures/simple.hwp",
      page: 999,
    });
    expect(out).toMatch(/범위 오류|out of range/);
  });
});

describe("renderHwpAllPages", () => {
  it("renders every page to a directory", async () => {
    const out = await renderHwpAllPages({
      file_path: "test/fixtures/simple.hwp",
      output_dir: tmpDir,
    });
    expect(out).toMatch(/페이지|pages/);
    const files = readdirSync(tmpDir);
    expect(files.some((f) => f.endsWith(".svg"))).toBe(true);
  });
});
