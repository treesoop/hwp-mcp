import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.js";
import type { RhwpProxy } from "../src/rhwp/proxy.js";

/** 네트워크·바이너리 없이 합치기와 중계만 본다. */
function stubProxy(over: Partial<RhwpProxy> = {}): RhwpProxy {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const base = {
    state: "ready",
    lastError: null,
    listedTools: () => [
      { name: "hwp_redact", description: "d", inputSchema: { type: "object", properties: {} } },
      { name: "hwp_split_cell", description: "d", inputSchema: { type: "object", properties: {} } },
    ],
    has: (n: string) => n === "hwp_redact" || n === "hwp_split_cell",
    info: () => ({ version: "0.9.1", source: "stub", bin: "/stub/rhwp" }),
    start: async () => {},
    close: async () => {},
    call: async (n: string, a: Record<string, unknown>) => {
      calls.push([n, a]);
      return `called:${n}:${JSON.stringify(a)}`;
    },
    calls,
  };
  return { ...base, ...over } as unknown as RhwpProxy;
}

async function connect(proxy: RhwpProxy) {
  const server = buildServer(proxy);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "t", version: "0" }, { capabilities: {} });
  await Promise.all([server.connect(b), client.connect(a)]);
  return client;
}

describe("로컬 + rhwp 도구 합치기", () => {
  it("curated 는 큐레이션된 rhwp 도구만 더한다", async () => {
    delete process.env.HWP_MCP_PROFILE;
    const c = await connect(stubProxy());
    const names = (await c.listTools()).tools.map((t) => t.name);
    expect(names).toContain("read_hwp");          // 로컬
    expect(names).toContain("hwp_engine_status"); // 상태 창구
    expect(names).toContain("hwp_redact");        // 큐레이션됨
    expect(names).not.toContain("hwp_split_cell");// 큐레이션 밖
    await c.close();
  });

  it("rhwp 가 아직 안 떴으면 로컬 도구만 — 기동을 막지 않는다", async () => {
    delete process.env.HWP_MCP_PROFILE;
    const c = await connect(stubProxy({ listedTools: () => [] } as Partial<RhwpProxy>));
    const names = (await c.listTools()).tools.map((t) => t.name);
    expect(names).toContain("read_hwp");
    expect(names).not.toContain("hwp_redact");
    await c.close();
  });

  it("로컬에 없는 이름은 rhwp 로 중계한다", async () => {
    delete process.env.HWP_MCP_PROFILE;
    const p = stubProxy();
    const c = await connect(p);
    const r = await c.callTool({ name: "hwp_redact", arguments: { path: "/x.hwp", dryRun: true } });
    expect(r.isError ?? false).toBe(false);
    expect(String((r.content as Array<{ text: string }>)[0].text)).toContain("called:hwp_redact");
    await c.close();
  });

  it("rhwp 가 실패하면 사유를 돌려준다 — 조용한 Unknown tool 금지", async () => {
    const c = await connect(
      stubProxy({
        state: "failed",
        lastError: "다운로드 차단됨",
        has: () => false,
        start: async () => {
          throw new Error("다운로드 차단됨");
        },
      } as Partial<RhwpProxy>)
    );
    const r = await c.callTool({ name: "hwp_redact", arguments: {} });
    expect(r.isError).toBe(true);
    expect(String((r.content as Array<{ text: string }>)[0].text)).toContain("다운로드 차단됨");
    await c.close();
  });

  it("hwp_engine_status 가 상태를 보고한다", async () => {
    delete process.env.HWP_MCP_PROFILE;
    const c = await connect(stubProxy());
    const r = await c.callTool({ name: "hwp_engine_status", arguments: {} });
    const s = JSON.parse(String((r.content as Array<{ text: string }>)[0].text));
    expect(s.profile).toBe("curated");
    expect(s.rhwp.toolsAvailable).toBe(2);
    expect(s.rhwp.toolsExposed).toBe(1);
    expect(s.localTools).toBeGreaterThan(20);
    await c.close();
  });
});
