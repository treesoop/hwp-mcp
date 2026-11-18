/**
 * 어떤 rhwp 도구를 기본으로 노출할지.
 *
 * rhwp 0.9.1 은 MCP 도구 **184개**를 준다. 전부 기본 노출하면 에이전트의
 * 도구 목록이 매 요청마다 컨텍스트를 먹고, 고를 확률도 떨어진다. 그래서
 * 기본은 큐레이션이고 `HWP_MCP_PROFILE=full` 이면 전부 연다.
 *
 * 목록을 코드에 적어 두는 것은 **이 파일뿐**이다 — 나머지(full)는
 * 바이너리의 tools/list 에서 런타임에 받으므로 rhwp 가 올라가도 낡지 않는다.
 */
export type Profile = "curated" | "full";

export function profileFromEnv(): Profile {
  const v = (process.env.HWP_MCP_PROFILE ?? "").trim().toLowerCase();
  return v === "full" || v === "all" ? "full" : "curated";
}

/**
 * 로컬 WASM 도구 24개가 못 하는 것만 고른다 — 겹치는 것을 또 올리면
 * 에이전트가 같은 일에 두 도구를 두고 고민한다.
 */
export const CURATED = new Set([
  // 개인정보·보안 — 에이전트가 문서를 외부로 넘기기 전에 거치는 자리
  "hwp_redact",
  "hwp_sanitize",
  "hwp_inspect_injection",
  "hwp_inspect_hidden_text",
  // 원자적 편집 — 여러 수정을 한 번에, 단언 통과 시에만 저장
  "hwp_run_plan",
  "hwp_verify",
  // 서식 대량 처리
  "hwp_batch_fill",
  "hwp_scan",
  // 위치까지 돌려주는 조회
  "hwp_search",
  "hwp_extract_data",
  // 표 ↔ CSV
  "hwp_table_to_csv",
  "hwp_csv_to_table",
  // 변환·요약
  "hwp_export_pdf",
  "hwp_explain",
  "hwp_digest",
]);

export function selectTools<T extends { name: string }>(tools: T[], profile: Profile): T[] {
  return profile === "full" ? tools : tools.filter((t) => CURATED.has(t.name));
}
