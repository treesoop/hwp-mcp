/**
 * rhwp 바이너리 확보 — PATH → 캐시 → GitHub 릴리스 다운로드(SHA256 대조).
 *
 * 왜 번들하지 않는가: 번들하면 우리가 **재배포자**가 된다. rhwp 는 MIT 지만
 * 그 안에 pdfium(BSD-3)·OFL 폰트 39종 등 제3자 고지가 함께 들어 있어,
 * 번들하는 순간 그 고지를 우리가 싣고 유지해야 한다. 다운로드로 두면
 * 사용자가 상류 릴리스에서 직접 받고 `notices/` 가 그 압축 안에 같이 온다.
 * (2026-11-19 확인: GPL·AGPL·LGPL·SSPL 0건, 폰트 38/39 가 OFL-1.1)
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { chmod, rename } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

/** 이 버전의 rhwp 를 기대한다. 올릴 때 README 의 표도 같이 올려라. */
export const RHWP_VERSION = "0.9.1";
const REPO = "edwardkim/rhwp";

export type Resolved = { bin: string; version: string; source: "env" | "path" | "cache" | "download" };

function versionOf(bin: string): string | null {
  try {
    const r = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 10_000 });
    const m = /(\d+\.\d+\.\d+)/.exec(`${r.stdout ?? ""}${r.stderr ?? ""}`);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** mcp-serve 를 가진 빌드인지. 구버전 rhwp 가 PATH 에 있을 때 조용히 실패하지 않게 한다. */
function speaksMcp(bin: string): boolean {
  try {
    const r = spawnSync(bin, ["--help"], { encoding: "utf8", timeout: 10_000 });
    return `${r.stdout ?? ""}${r.stderr ?? ""}`.includes("mcp-serve");
  } catch {
    return false;
  }
}

export function assetName(): string {
  const p = process.platform;
  const a = process.arch;
  const arch = a === "arm64" ? "aarch64" : a === "x64" ? "x86_64" : null;
  if (!arch) throw new Error(`지원하지 않는 CPU 입니다: ${a} (지원: arm64 · x64)`);
  if (p === "darwin") return `rhwp-v${RHWP_VERSION}-macos-${arch}.tar.gz`;
  if (p === "linux") return `rhwp-v${RHWP_VERSION}-linux-${arch}.tar.gz`;
  if (p === "win32") {
    if (arch !== "x86_64") throw new Error("Windows 는 x64 빌드만 배포됩니다");
    return `rhwp-v${RHWP_VERSION}-windows-x86_64.zip`;
  }
  throw new Error(`지원하지 않는 OS 입니다: ${p} (지원: macOS · Linux · Windows)`);
}

export function cacheDir(): string {
  const base =
    process.env.HWP_MCP_CACHE_DIR ??
    (process.platform === "win32"
      ? join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "hwp-mcp")
      : join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "hwp-mcp"));
  return join(base, `rhwp-${RHWP_VERSION}`);
}

function cachedBin(): string {
  return join(cacheDir(), process.platform === "win32" ? "rhwp.exe" : "rhwp");
}

async function fetchBuf(url: string): Promise<Buffer> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** SHA256SUMS.txt 에서 이 자산의 기대 해시를 읽는다. 없으면 검증 없이 쓰지 않는다. */
async function expectedSha(asset: string): Promise<string> {
  const txt = (
    await fetchBuf(`https://github.com/${REPO}/releases/download/v${RHWP_VERSION}/SHA256SUMS.txt`)
  ).toString("utf8");
  for (const line of txt.split("\n")) {
    const [hash, name] = line.trim().split(/\s+/);
    if (name === asset && /^[0-9a-f]{64}$/.test(hash ?? "")) return hash;
  }
  throw new Error(`SHA256SUMS.txt 에 ${asset} 항목이 없습니다 — 검증 없이 설치하지 않습니다`);
}

function extract(archive: string, into: string): void {
  mkdirSync(into, { recursive: true });
  const r = archive.endsWith(".zip")
    ? spawnSync("tar", ["-xf", archive, "-C", into], { encoding: "utf8" })
    : spawnSync("tar", ["-xzf", archive, "-C", into], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`압축 해제 실패: ${r.stderr || r.status}`);
}

/**
 * 압축 안에서 실행 파일을 찾는다 (릴리스는 `rhwp/rhwp` 처럼 한 겹 더 들어 있다).
 *
 * 🔴 `existsSync` 만으로 고르면 안 된다 — 압축 루트의 `rhwp` 는 **디렉터리**이고
 * 실행 파일 이름도 `rhwp` 다. 2026-11-19 에 이걸로 첫 설치가 전부
 * `EISDIR: illegal operation on a directory, read` 로 깨졌다. 파일인지 본다.
 */
function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

export function findBin(root: string): string {
  const name = process.platform === "win32" ? "rhwp.exe" : "rhwp";
  for (const c of [join(root, name), join(root, "rhwp", name)]) if (isFile(c)) return c;
  const r = spawnSync("find", [root, "-name", name, "-type", "f"], { encoding: "utf8" });
  const hit = (r.stdout ?? "").split("\n").map((s) => s.trim()).filter(isFile)[0];
  if (!hit) throw new Error(`압축 안에서 ${name} 을 찾지 못했습니다`);
  return hit;
}

async function download(log: (s: string) => void): Promise<string> {
  const asset = assetName();
  const url = `https://github.com/${REPO}/releases/download/v${RHWP_VERSION}/${asset}`;
  log(`rhwp v${RHWP_VERSION} 를 받습니다 (약 30MB, 처음 한 번만) — ${asset}`);
  const want = await expectedSha(asset);
  const buf = await fetchBuf(url);
  const got = createHash("sha256").update(buf).digest("hex");
  if (got !== want) throw new Error(`SHA256 불일치 — 기대 ${want}, 실제 ${got}. 설치를 중단합니다`);
  log(`SHA256 대조 통과 (${got.slice(0, 16)}…)`);

  const work = join(tmpdir(), `hwp-mcp-${process.pid}-${Date.now()}`);
  mkdirSync(work, { recursive: true });
  try {
    const ar = join(work, asset);
    await pipeline(Readable.from(buf), createWriteStream(ar));
    extract(ar, work);
    const src = findBin(work);
    await chmod(src, 0o755);
    mkdirSync(cacheDir(), { recursive: true });
    const dest = cachedBin();
    // 같은 캐시로 두 프로세스가 동시에 들어올 수 있다 — 임시 이름으로 받고 rename 으로 원자 교체.
    const staged = `${dest}.${process.pid}.part`;
    await pipeline(Readable.from(readFileSync(src)), createWriteStream(staged));
    await chmod(staged, 0o755);
    await rename(staged, dest);
    log(`설치 완료 — ${dest}`);
    return dest;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/**
 * 쓸 수 있는 rhwp 를 돌려준다. 순서를 바꾸지 말 것 — 사용자가 이미 깐
 * rhwp 를 무시하고 30MB 를 또 받으면 안 된다.
 */
export async function resolveRhwp(log: (s: string) => void = () => {}): Promise<Resolved> {
  const env = process.env.HWP_MCP_RHWP_BIN;
  if (env) {
    const v = versionOf(env);
    if (!v) throw new Error(`HWP_MCP_RHWP_BIN 이 실행되지 않습니다: ${env}`);
    if (!speaksMcp(env)) throw new Error(`${env} 에 mcp-serve 가 없습니다 (rhwp ${v})`);
    return { bin: env, version: v, source: "env" };
  }
  const cached = cachedBin();
  if (existsSync(cached) && speaksMcp(cached)) {
    return { bin: cached, version: versionOf(cached) ?? RHWP_VERSION, source: "cache" };
  }
  const onPath = process.platform === "win32" ? "rhwp.exe" : "rhwp";
  const pv = versionOf(onPath);
  if (pv && speaksMcp(onPath)) {
    log(`PATH 의 rhwp v${pv} 를 씁니다 (다운로드 생략)`);
    return { bin: onPath, version: pv, source: "path" };
  }
  if (process.env.HWP_MCP_NO_DOWNLOAD === "1") {
    throw new Error(
      "rhwp 를 찾지 못했고 HWP_MCP_NO_DOWNLOAD=1 이라 받지 않습니다. " +
        "rhwp 를 설치하고 HWP_MCP_RHWP_BIN 으로 경로를 지정하세요."
    );
  }
  const bin = await download(log);
  return { bin, version: RHWP_VERSION, source: "download" };
}
