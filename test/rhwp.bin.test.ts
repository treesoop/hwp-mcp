import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assetName, cacheDir, findBin, RHWP_VERSION } from "../src/rhwp/bin.js";

describe("findBin", () => {
  /**
   * 회귀: 릴리스 압축은 `rhwp/rhwp` 구조라 루트의 `rhwp` 가 **디렉터리**다.
   * existsSync 로 고르면 그 디렉터리를 집어 `EISDIR` 로 깨진다 (2026-11-19).
   */
  it("같은 이름의 디렉터리가 있어도 실행 파일을 고른다", () => {
    const root = mkdtempSync(join(tmpdir(), "findbin-"));
    mkdirSync(join(root, "rhwp"));            // 디렉터리 — 함정
    const real = join(root, "rhwp", "rhwp");  // 실제 실행 파일
    writeFileSync(real, "#!/bin/sh\n");
    expect(findBin(root)).toBe(real);
  });

  it("루트에 바로 있으면 그걸 고른다", () => {
    const root = mkdtempSync(join(tmpdir(), "findbin-"));
    const real = join(root, "rhwp");
    writeFileSync(real, "#!/bin/sh\n");
    expect(findBin(root)).toBe(real);
  });

  it("없으면 조용히 넘기지 않고 던진다", () => {
    const root = mkdtempSync(join(tmpdir(), "findbin-"));
    expect(() => findBin(root)).toThrow();
  });
});

describe("assetName", () => {
  it("이 플랫폼의 자산 이름이 릴리스 규칙과 같다", () => {
    const n = assetName();
    expect(n).toContain(`rhwp-v${RHWP_VERSION}-`);
    expect(n).toMatch(/\.(tar\.gz|zip)$/);
    expect(n).toMatch(/(aarch64|x86_64)/);
  });
});

describe("cacheDir", () => {
  it("버전이 경로에 들어간다 — 올려도 옛 바이너리를 쓰지 않는다", () => {
    expect(cacheDir()).toContain(`rhwp-${RHWP_VERSION}`);
  });
  it("HWP_MCP_CACHE_DIR 를 존중한다", () => {
    const prev = process.env.HWP_MCP_CACHE_DIR;
    process.env.HWP_MCP_CACHE_DIR = "/tmp/hwp-mcp-test-cache";
    try {
      expect(cacheDir()).toBe(`/tmp/hwp-mcp-test-cache/rhwp-${RHWP_VERSION}`);
    } finally {
      if (prev === undefined) delete process.env.HWP_MCP_CACHE_DIR;
      else process.env.HWP_MCP_CACHE_DIR = prev;
    }
  });
});
