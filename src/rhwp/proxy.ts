/**
 * rhwp 의 MCP 서버(`rhwp mcp-serve`)에 자식으로 붙어 도구를 그대로 흘려보낸다.
 *
 * 왜 프록시인가: rhwp 는 이미 표준 MCP 서버다(2026-11-19 확인 — initialize 가
 * protocolVersion 2025-06-18 · serverInfo rhwp 0.9.1 을 돌려주고 tools/list 가
 * 184개를 준다). 184개를 손으로 매핑하면 rhwp 가 올라갈 때마다 낡는다.
 * 목록과 호출을 그대로 중계하면 **파리티가 구조적으로 보장**된다.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { resolveRhwp, type Resolved } from "./bin.js";

export type ProxyState = "idle" | "starting" | "ready" | "failed";

export class RhwpProxy {
  private client: Client | null = null;
  private tools: Tool[] = [];
  private starting: Promise<void> | null = null;
  private resolvedBin: Resolved | null = null;
  state: ProxyState = "idle";
  lastError: string | null = null;

  constructor(private readonly log: (s: string) => void = () => {}) {}

  /** 한 번만 띄운다. 동시에 여러 요청이 들어와도 같은 약속을 기다린다. */
  async start(): Promise<void> {
    if (this.state === "ready") return;
    if (this.starting) return this.starting;
    this.state = "starting";
    this.starting = (async () => {
      try {
        const r = await resolveRhwp(this.log);
        this.resolvedBin = r;
        const transport = new StdioClientTransport({
          command: r.bin,
          args: ["mcp-serve"],
          // 자식의 stderr 를 우리 stderr 로 흘린다 — 조용한 실패를 막는다.
          stderr: "pipe",
        });
        const client = new Client({ name: "hwp-mcp-proxy", version: "0.4.0" }, { capabilities: {} });
        await client.connect(transport);
        transport.stderr?.on("data", (d: Buffer) => {
          const s = d.toString().trim();
          if (s) this.log(`[rhwp] ${s.slice(0, 400)}`);
        });
        const listed = await client.listTools();
        this.client = client;
        this.tools = listed.tools ?? [];
        this.state = "ready";
        this.log(`rhwp v${r.version} (${r.source}) 연결 — 도구 ${this.tools.length}개`);
      } catch (e) {
        this.state = "failed";
        this.lastError = (e as Error).message;
        this.log(`rhwp 연결 실패: ${this.lastError}`);
        throw e;
      } finally {
        this.starting = null;
      }
    })();
    return this.starting;
  }

  /** 아직 안 떴으면 빈 배열 — 서버 기동을 막지 않는다. */
  listedTools(): Tool[] {
    return this.state === "ready" ? this.tools : [];
  }

  has(name: string): boolean {
    return this.tools.some((t) => t.name === name);
  }

  info(): { version: string; source: string; bin: string } | null {
    return this.resolvedBin
      ? { version: this.resolvedBin.version, source: this.resolvedBin.source, bin: this.resolvedBin.bin }
      : null;
  }

  async call(name: string, args: Record<string, unknown>): Promise<string> {
    if (this.state !== "ready") await this.start();
    if (!this.client) throw new Error(`rhwp 가 준비되지 않았습니다: ${this.lastError ?? "원인 미확인"}`);
    const res = await this.client.callTool({ name, arguments: args });
    const content = (res.content ?? []) as Array<{ type: string; text?: string }>;
    const text = content.map((c) => (c.type === "text" ? c.text ?? "" : `[${c.type}]`)).join("\n");
    if (res.isError) throw new Error(text || `${name} 실패`);
    return text;
  }

  async close(): Promise<void> {
    await this.client?.close().catch(() => {});
    this.client = null;
    this.state = "idle";
  }
}
