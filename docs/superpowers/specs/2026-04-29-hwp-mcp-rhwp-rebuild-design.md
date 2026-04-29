# hwp-mcp v0.2 — rhwp 기반 재구축 설계

**Date:** 2026-04-29
**Status:** Approved (initial design)
**Authors:** Dion (Treesoop) + Claude
**Replaces:** Python implementation (v0.1.x)

## 배경

현재 `hwp-mcp`는 Python으로 작성된 MCP 서버로, 자체 HWP/HWPX 파서·라이터를 갖고 있다 (`hwp_parser.py`, `hwpx_parser.py`, `hwp_writer.py`, `ole_writer.py` ≈ 1,700 lines). 자체 파서는 한컴 호환성에서 한계가 있다.

[rhwp](https://github.com/edwardkim/rhwp) (Edward Kim 작) 는 Rust + WebAssembly 기반의 HWP/HWPX 파서/렌더러로, 891+ 테스트와 한컴 호환 Field API까지 갖춘 성숙한 라이브러리다. `@rhwp/core@0.7.7`이 npm에 publish 되어 있으며 MIT 라이선스다.

이 설계는 hwp-mcp의 런타임을 Python에서 Node.js로 옮기고, 파서를 자체 구현 대신 `@rhwp/core` WASM 바인딩 위에서 동작하도록 재구축하는 것을 다룬다.

## 목표

1. **품질 향상** — rhwp의 검증된 파서/Field API로 한컴 호환성 확보
2. **유입 (SEO)** — npm `hwp-mcp` 패키지명 점유, 영어 README + 한국어 섹션, GitHub topics 키워드 최적화
3. **사용 친화성** — `npx hwp-mcp` 한 줄 설치, 기존 도구 시그니처 호환으로 마이그레이션 충격 최소화

## Non-goals

- 자체 HWP 파서 유지·개선
- HWP ↔ HWPX 크로스 포맷 변환 저장 (rhwp 0.7.x 공개 API에 없음, 향후 cycle)
- 헤더/푸터/풋노트 추출 (0.2 본문 우선; "Known limitations"에 명시)
- 새로운 도구 추가 — 기존 8개 도구 시그니처 그대로 유지 (YAGNI)

## 결정 사항

### 1. 패키징

- **npm 패키지명**: `hwp-mcp` (점유). 분기 이름(`hwp-mcp-rs`, `@scope/hwp-mcp` 등) 쓰지 않음 — SEO 검색 분산 손실 회피.
- **진입점**: `npx hwp-mcp`. Claude Desktop / Cursor / VS Code 등 MCP 클라이언트의 표준 패턴.
- **버전**: `0.2.0` (런타임 교체 = major-feel). semver 0.x이므로 breaking 허용.
- **PyPI**: 0.1.x 패키지는 README에 "Deprecated, see npm hwp-mcp" 고지. 신규 publish 없음.
- **레포 정리**: 기존 Python 소스(`*.py`, `src/hangul_mcp/`, `pyproject.toml`)는 `legacy-python` 브랜치로 보존 후 main에서 제거.

### 2. 도구 셋 (호환 우선)

기존 8개 도구를 이름·인자·반환 형식 모두 동일하게 유지한다.

| 도구 | 인자 | rhwp 매핑 |
|---|---|---|
| `read_hwp` | `file_path` | traversal walker (text + tables + image list) |
| `read_hwp_text` | `file_path` | section × paragraph × `getTextRange` 순회 |
| `read_hwp_tables` | `file_path` | control 워커 + `getTableDimensions`/`getTextInCell` 매트릭스 재조합 |
| `list_hwp_images` | `file_path` | control 순회 + `getControlImageMime` |
| `extract_hwp_images` | `file_path`, `output_dir?` | `getControlImageData` → fs write |
| `replace_hwp_text` | `file_path`, `old_text`, `new_text`, `output_path?` | `replaceAll` |
| `fill_hwp_template` | `file_path`, `replacements` (JSON), `output_path?` | 한컴 필드명 매칭 시 `setFieldValueByName`, 그 외 `replaceAll` |
| `create_hwpx_document` | `output_path`, `content` (JSON) | `HwpDocument.createEmpty` + `insertText` + `createTable` + `exportHwpx` |

**새 도구 추가 안 함.** 0.3+에서 사용 데이터 보고 검토.

### 3. 저장 정책

| 입력 | 출력 | 동작 |
|---|---|---|
| `.hwp` | `.hwp` | `exportHwp()` |
| `.hwpx` | `.hwpx` | `exportHwpx()` |
| `.hwp` | `.hwpx` | 명시적 에러 ("크로스 포맷 저장은 지원되지 않습니다. 입력과 동일한 확장자로 저장하세요.") |
| `.hwpx` | `.hwp` | 동일 에러 |

`create_hwpx_document`는 항상 `.hwpx`만 생성 (기존 동작 유지).

### 4. 코드 구조

```
hwp-mcp/
  package.json
  tsconfig.json
  src/
    server.ts             # MCP entry (StdioServerTransport)
    core/
      wasm-init.ts        # Node WASM bootstrap (격리 모듈)
      document.ts         # HwpDocument traversal walker
    tools/
      read.ts             # read_hwp, read_hwp_text, read_hwp_tables
      images.ts           # list_hwp_images, extract_hwp_images
      write.ts            # replace_hwp_text, fill_hwp_template, create_hwpx_document
  test/
    fixtures/             # 샘플 .hwp/.hwpx
    *.test.ts
  README.md
  LICENSE
```

**`core/wasm-init.ts`** — k-skill-rhwp 패턴 차용:
- `globalThis.measureTextWidth(font, text)` shim 설치 (CJK = font size, Latin = 0.55 × font size 근사)
- `fs.readFileSync(require.resolve('@rhwp/core/rhwp_bg.wasm'))`로 wasm 바이트 로딩 후 `core.default({ module_or_path: bytes })` 명시 주입
- 비공식 패턴이므로 한 곳에 격리; rhwp 본진 공식 Node init API가 나오면 이 모듈만 교체

**`core/document.ts`** — `HwpDocument` 위에 동작하는 traversal helper:
- `walkText(doc) → string` — 모든 section × paragraph 순회하며 본문 텍스트 dump
- `walkTables(doc) → Table[]` — control 순회 + cell 매트릭스 재조합 + markdown 변환
- `walkImages(doc) → ImageRef[]` — control 순회로 이미지 메타 listing
- `getImageBytes(doc, ref) → { bytes, mime }` — 추출

### 5. SDK

`@modelcontextprotocol/sdk` (공식 TypeScript SDK). FastMCP 같은 wrapper 사용하지 않음 — 의존성 표면 최소화.

### 5a. 언어 정책 (사용자 노출 텍스트)

- **도구 description / 인자 docstring**: 영어. LLM tool selection 정확도가 영어에서 더 안정적.
- **도구 반환 메시지·에러**: 한국어 우선 + 핵심 키워드 영어 (예: `"파일을 찾을 수 없습니다 (file not found): /path"`). 한국 사용자 + LLM 둘 다 인식.
- **README**: 영어 본문 + 한국어 별도 섹션 (앵커 `## 한국어` 또는 `README.ko.md` 분리는 작성 시 결정).

### 6. README / SEO 전략

- **언어**: 영어 우선 + 한국어 섹션. 영어가 globally indexed, 한국어가 국내 검색·LLM 인덱스 둘 다 잡음.
- **상단 1줄**: "Read & write HWP/HWPX (Korean Hangul) documents from Claude/Cursor/ChatGPT via MCP."
- **첫 화면**: 1-line install (`claude mcp add hwp-mcp -- npx -y hwp-mcp`) + 짧은 GIF/스크린샷.
- **키워드 명시**: `hwp`, `hwpx`, `hangul`, `한글`, `MCP`, `Korean word processor`, `Claude`, `Cursor`, `Hancom Office`.
- **크레딧**: "**Built on [rhwp](https://github.com/edwardkim/rhwp)**" 배지 + 한 단락 호혜 크레딧 (rhwp 저자 멘션, 라이선스 표기).
- **Tools 표 + 자연어 대화 예시** — 현재 README 형식 유지 (잘 돼있음).
- **"Limitations" 섹션** — 크로스 포맷 저장 미지원, 헤더/푸터/풋노트 미추출, 표 셀 병합 표시 한계 (검증 후 명시).
- **GitHub topics**: `mcp-server`, `hwp`, `hwpx`, `hangul`, `claude`, `cursor`, `korean`, `hancom`.

### 7. 테스트

- **프레임워크**: vitest
- **fixture**: `test/fixtures/`에 `.hwp`/`.hwpx` 샘플 2-3개 (rhwp `samples/` 라이선스 호환분 또는 직접 생성)
- **케이스**:
  - 8개 도구 각각 happy-path snapshot
  - `replace_hwp_text` round-trip: 입력 → 치환 → 다시 파싱 → 변경 확인
  - `create_hwpx_document` → 다시 파싱 → 구조 일치 확인
  - 크로스 포맷 저장 시 명시적 에러 발생 확인
  - 존재하지 않는 파일·잘못된 JSON 등 실패 케이스

### 8. 위험 + 완화

| 위험 | 완화 |
|---|---|
| rhwp Node init이 비공식 패턴 | `core/wasm-init.ts` 격리, k-skill-rhwp 동일 패턴 차용, `@rhwp/core` 의존성을 `0.7.x`로 명시 (package.json `"@rhwp/core": "0.7.x"`), 0.8/0.9 자동 수신 안 함, CI에서 정기 검증 |
| traversal walker 불완전 (헤더/푸터/풋노트 누락) | 0.2.0은 본문 우선, README "Known limitations"에 명시, 이슈로 등록 후 0.3 cycle |
| `@rhwp/core` 0.7 → 1.0 breaking | dependency tilde 핀, 1.0 release 시 별도 마이그레이션 cycle (0.3 또는 1.0) |
| 표 셀 병합·복잡 레이아웃의 markdown 변환 손실 | 단순 표는 정확히, 병합·중첩은 best-effort 표시 + warning. 0.2 fixture로 케이스 커버 |
| 기존 Python 사용자 마이그레이션 충격 | 도구 시그니처 동일 + PyPI 패키지에 deprecation 고지 + README에 마이그레이션 경로 한 단락 |

## 마이그레이션 / 출시 단계

1. `legacy-python` 브랜치 생성 → 현재 main 상태 보존
2. main에서 Python 자산 제거, Node 스캐폴드 (`package.json`, `tsconfig.json`, `src/`)
3. `core/wasm-init.ts` + `core/document.ts` 구현, 단위 테스트
4. 도구 8개 차례로 구현 + 도구별 테스트
5. README 재작성 (영어 + 한국어, 크레딧, 키워드)
6. fixture 테스트 통과 + 로컬 Claude Desktop에서 수동 검증
7. npm publish v0.2.0
8. PyPI 0.1.x README 업데이트로 deprecation 고지
9. GitHub topics 갱신, release notes 작성

## 미해결 / 후속 사이클 (0.3+)

- 헤더/푸터/풋노트/텍스트박스 추출
- 표 셀 병합 정확한 markdown 표현
- HWP ↔ HWPX 크로스 포맷 저장 (rhwp `export_hwp_with_adapter` 안정화 시)
- 새 도구 후보: `render_hwp_svg` (rhwp 렌더링 노출), `insert_hwp_image`, `create_hwp_document` (.hwp 생성)

## 참고

- rhwp: <https://github.com/edwardkim/rhwp>
- `@rhwp/core` on npm: <https://www.npmjs.com/package/@rhwp/core>
- k-skill-rhwp (Node init reference): npm `k-skill-rhwp`
- MCP 공식 SDK (TypeScript): <https://github.com/modelcontextprotocol/typescript-sdk>
