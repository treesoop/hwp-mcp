import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.js";
import { CURATED } from "../src/rhwp/profile.js";
import type { RhwpProxy } from "../src/rhwp/proxy.js";

/**
 * README 가 적어 둔 도구 수가 실제 노출 수와 어긋나지 않게 못 박는다.
 * 🔴 v0.4 에서 `hwp_engine_status` 를 더했는데 README 는 계속 「35개」라고 적고 있었다
 * (2026-11-19 발견). 노출 수는 설치 안내·프로필 설명·업데이트 노트 **세 곳**에 복사돼
 * 있어서 손으로 맞추면 또 틀어진다. 사람이 읽는 숫자를 코드가 세게 한다.
 */
const README = readFileSync(join(import.meta.dirname, "..", "README.md"), "utf8");

/** rhwp 가 아직 안 뜬 상태 = 로컬 도구만 */
const notReady = { state: "starting", lastError: null, listedTools: () => [], has: () => false, info: () => null, start: async () => {}, close: async () => {}, call: async () => "" } as unknown as RhwpProxy;

async function localToolCount(): Promise<number> {
  delete process.env.HWP_MCP_PROFILE;
  const server = buildServer(notReady);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "t", version: "0" }, { capabilities: {} });
  await Promise.all([server.connect(b), client.connect(a)]);
  const n = (await client.listTools()).tools.length;
  await client.close();
  return n;
}

describe("README 의 도구 수는 실제와 같아야 한다", () => {
  it("로컬 도구 수를 README 가 맞게 적고 있다", async () => {
    const local = await localToolCount();
    expect(local).toBeGreaterThan(0);
    // 「로컬 36」·「로컬 도구 36개」 형태로 적힌 모든 자리
    const stated = [...README.matchAll(/로컬(?:\s*도구)?\s*\*{0,2}(\d+)/g)].map((m) => Number(m[1]));
    expect(stated.length, "README 에 로컬 도구 수가 안 적혀 있다").toBeGreaterThan(2);
    for (const n of stated) expect(n, `README 가 로컬 ${n} 개라고 적었다`).toBe(local);
  });

  it("curated 합계를 README 가 맞게 적고 있다", async () => {
    const expected = (await localToolCount()) + CURATED.size;
    expect(README).toContain(`= ${expected}개`);
  });

  it("full 합계가 로컬 + rhwp 와 맞는다", async () => {
    const local = await localToolCount();
    // 「전부(로컬 36 + rhwp 184 = 220개) 열기」 한 줄만 본다 —
    // curated 줄(「로컬 36 + 엄선한 rhwp 15 = 51개」) 을 물면 안 된다
    const m = /로컬\s*(\d+)\s*\+\s*rhwp\s*(\d+)\s*=\s*(\d+)개\)\s*열기/.exec(README);
    expect(m, "README 에 full 합계 식이 없다").not.toBeNull();
    const [, statedLocal, rhwp, full] = m!.map(Number);
    expect(statedLocal).toBe(local);
    expect(full).toBe(local + rhwp);
  });

  it("지나간 버전을 「예정」으로 적어 두지 않는다", () => {
    // v0.4 를 배포하면서 「v0.3에서」·「v0.3 예정」 같은 약속이 남아 있으면 거짓이 된다.
    // 「업데이트 노트」 아래는 이력이라 과거 서술이 정상이므로 그 앞만 본다.
    const body = README.split("## 업데이트 노트")[0];
    expect(body).not.toMatch(/v0\.[123]\s*(에서|예정|이후)\b/);
    expect(body).not.toMatch(/v0\.[123]\s*릴리스를 기다/);
  });
});
