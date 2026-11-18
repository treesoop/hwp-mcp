# hwp-mcp

> Claude · Cursor · ChatGPT 등 MCP 호환 AI에서 **한글 문서(.hwp / .hwpx)** 를 읽고 수정하고 새로 만들 수 있게 해주는 서버입니다.

[![npm version](https://img.shields.io/npm/v/hwp-mcp.svg)](https://www.npmjs.com/package/hwp-mcp)
[![npm downloads](https://img.shields.io/npm/dm/hwp-mcp.svg)](https://www.npmjs.com/package/hwp-mcp)
[![Built on rhwp](https://img.shields.io/badge/built%20on-rhwp-blue)](https://github.com/edwardkim/rhwp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub release](https://img.shields.io/github/v/release/treesoop/hwp-mcp)](https://github.com/treesoop/hwp-mcp/releases/latest)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-brightgreen)](#설치)

`hwp-mcp`은 한컴오피스 문서를 AI 에이전트가 직접 다루도록 해주는 MCP(Model Context Protocol) 서버입니다. **읽기뿐 아니라 텍스트 수정, 템플릿 채우기, 새 문서 생성까지 가능합니다.** v0.4부터 [rhwp](https://github.com/edwardkim/rhwp) 가 주는 기능을 **전부**(도구 184개) 쓸 수 있고, `.hwp` 를 `.hwpx` 로 바꾸지 않고 **직접 수정**할 수 있습니다.

🍎 **맥에서도 됩니다.** 기존 HWP 자동화 도구 대부분은 한컴오피스 COM API 기반이라 Windows 전용이지만, `hwp-mcp`는 WebAssembly 엔진이라 **macOS(Apple Silicon 포함) · Windows · Linux 어디서든 한컴오피스 설치 없이** 동작합니다.

🏢 **회사 전체가 같이 쓰려면:** 같은 팀이 만든 [**Trina AX**](https://github.com/trina-app/trina-ax)는 회사 서버에서 Claude Code를 돌리는 오픈소스 업무 공간입니다. 팀 폴더의 HWP/HWPX·PDF·Office 문서와 팀 스킬, MCP 서버를 직원 모두가 각자 폴더 권한 안에서 함께 씁니다.

## 어떤 프로젝트인가요?

이 프로젝트는 두 부분으로 나뉩니다.

- 🔧 **핵심 엔진: rhwp** — [Edward Kim](https://github.com/edwardkim) 님의 [**rhwp**](https://github.com/edwardkim/rhwp)는 한글 포맷(HWP 5.0 binary, HWPX/OWPML)을 Rust + WebAssembly로 구현한 오픈소스 엔진입니다. 파싱, 표·이미지·수식·머리말 추출, SVG 렌더링, 한컴 호환 Field API 등 포맷 처리 능력을 제공합니다.

- 🤝 **`hwp-mcp` 가 한 일 (에이전트 어댑터)** — `@rhwp/core` 위에 얹은 MCP 서버 layer. 우리가 추가한 것은:
  - `read_hwp`, `fill_hwp_template`, `replace_hwp_text` 같은 **에이전트 친화적 도구 시그니처** — Claude/Cursor 같은 LLM이 자연어로 호출할 수 있게
  - 본문·표·이미지·머리말·꼬리말·각주·수식을 한 번에 dump 하는 **시나리오 중심 traversal walker**
  - 표 셀 병합 자동 처리, footnote/equation 자동 합본 같은 **사용 편의 layer**
  - rhwp 0.7.7 의 `exportHwpx` 라운드트립 한계를 우회하기 위한 **`.hwpx` ZIP-level mutation layer** (실제 쓰기를 가능하게 하는 핵심)
  - npm `hwp-mcp` 패키지 (한 줄 설치) + Node.js WASM 부트스트랩

요약: **AI 에이전트가 한글 문서를 읽고 쓸 수 있게 해주는 어댑터**입니다. 포맷 처리는 rhwp, 에이전트 연동은 hwp-mcp 가 담당합니다.

---

## 설치

### 가장 쉬운 방법 — 이 프롬프트를 복붙하세요

AI에게 그대로 붙여넣으면 설치부터 확인까지 알아서 합니다. **터미널 명령을 몰라도 됩니다.**

```text
hwp-mcp 를 설치해 줘. 한글(.hwp/.hwpx) 문서를 읽고 쓰는 MCP 서버야.

1. 아래 명령으로 설치해:
   claude mcp add hwp-mcp -- npx -y hwp-mcp@latest
   (Claude Desktop·Cursor·VS Code 를 쓰면 설정 JSON 의 mcpServers 에
    "hwp-mcp": { "command": "npx", "args": ["-y", "hwp-mcp@latest"] } 를 넣어 줘)

2. 설치되면 세션을 재시작하고 `claude mcp list` 로 ✓ Connected 를 확인해.

3. 엔진 상태를 hwp_engine_status 도구로 확인해 줘.
   rhwp 바이너리를 처음 한 번 받는다(약 30MB). state 가 ready 가 되면 끝이야.
   받는 동안에는 로컬 도구 35개만 보이고, 끝나면 도구 목록이 자동으로 늘어나.

4. 마지막으로 아무 .hwp 나 .hwpx 파일 하나를 read_hwp 로 읽어서
   첫 두 줄만 보여 줘. 파일이 없으면 "파일 경로를 알려 달라"고만 말해.

참고: Node.js 20 이상이 필요하고 macOS·Windows·Linux 모두 된다.
한컴오피스는 설치하지 않아도 돼. 도구를 전부(184개) 열고 싶으면
환경변수 HWP_MCP_PROFILE=full 을 설정하면 돼.
```

### Claude Code (명령으로 직접)

```bash
claude mcp add hwp-mcp -- npx -y hwp-mcp
```

### Claude Desktop / Cursor / VS Code (settings JSON)

```json
{
  "mcpServers": {
    "hwp-mcp": {
      "command": "npx",
      "args": ["-y", "hwp-mcp"]
    }
  }
}
```

Node.js 20 이상 필요. **macOS · Windows · Linux 모두 지원** — 엔진이 WebAssembly 기반이라 한컴오피스 설치 없이 OS 무관하게 동작합니다. pywin32·COM 자동화처럼 Windows에 묶이지 않아 **맥북에서도 위 한 줄로 끝**입니다.

### 설치 확인

```bash
claude mcp list | grep hwp-mcp
# hwp-mcp: npx -y hwp-mcp  - ✓ Connected
```

`✓ Connected` 가 뜨면 끝.

### 처음 써보기 (60초)

설치 직후 동작 확인용 가장 짧은 검증:

```
나: 새 hwpx 문서 만들어줘. 파일 이름은 hello.hwpx 이고 "안녕 한글" 한 줄만 들어가게.
AI: HWPX 문서 생성 완료 (created): hello.hwpx

나: hello.hwpx 읽어줘.
AI: # hello.hwpx
    안녕 한글
```

위 두 단계가 되면 읽기·쓰기 양쪽 다 동작합니다. 이제 실제 문서로:

- `~/Downloads/공고문.hwp 읽어줘`
- `report.hwpx 의 {{이름}}을 남대현으로, {{날짜}}를 2026-05-26으로 채워줘`
- `document.hwpx 의 첫 페이지를 SVG로 보여줘`

### 안 되면?

| 증상 | 원인 / 해결 |
|---|---|
| `✗ Failed to connect` | `v0.2.0` bin symlink 버그 — [v0.2.1](https://github.com/treesoop/hwp-mcp/releases/tag/v0.2.1) 이상으로 업그레이드 (아래) |
| 설치는 됐는데 `mcp__hwp-mcp__*` 도구가 안 보임 | Claude Code / Cursor 세션 **재시작** 필요 (MCP 도구는 세션 시작 시점에 로드됨) |
| `npx: command not found` 또는 ESM 에러 | Node 20+ 인지 확인: `node --version`. Node 18 은 EOL — `nvm install 20` 또는 [공식 설치](https://nodejs.org) |
| `npx` 가 옛 버전을 캐시 | `claude mcp add hwp-mcp -- npx -y hwp-mcp@latest` (`@latest` 명시) 또는 `npm cache clean --force` |
| Claude Desktop / Cursor 에서 안 보임 | 설정 JSON 저장 후 앱 **완전 종료 + 재실행** (백그라운드 트레이도 종료) |

**v0.2.0 → v0.2.1 업그레이드:**

```bash
claude mcp remove hwp-mcp
claude mcp add hwp-mcp -- npx -y hwp-mcp@latest
claude mcp list | grep hwp-mcp   # ✓ Connected
```

설정 파일 방식(Claude Desktop/Cursor)이면 `args` 를 `["-y", "hwp-mcp@latest"]` 로:

```json
{
  "mcpServers": {
    "hwp-mcp": {
      "command": "npx",
      "args": ["-y", "hwp-mcp@latest"]
    }
  }
}
```

여전히 안 되면: [Issues](https://github.com/treesoop/hwp-mcp/issues) 에 `node --version`, `claude mcp list` 출력, 실행 OS 적어서 알려주세요.

---

## 엔진과 도구 범위 (v0.4 신규)

v0.4부터 `hwp-mcp` 는 **rhwp 가 주는 기능을 전부** 쓸 수 있습니다. 두 층이 있습니다.

| 층 | 무엇 | 개수 | 엔진 |
|---|---|---|---|
| 로컬 도구 | `read_hwp` · `fill_hwp_template` 처럼 에이전트가 부르기 쉬운 이름 | **35** | `@rhwp/core` (WASM) |
| rhwp 도구 | rhwp 가 자체 MCP 서버로 노출하는 전부 | **184** | rhwp 바이너리 |

**도구 목록을 코드에 적어 두지 않습니다.** 서버가 켜질 때 rhwp 에게 `tools/list` 를
물어 그대로 받아 옵니다 — rhwp 가 올라가면 새 도구도 코드 수정 없이 따라옵니다.

### 프로필 — 기본은 큐레이션입니다

184개를 한꺼번에 열면 AI 의 도구 목록이 매 요청마다 컨텍스트를 먹고, 엉뚱한 도구를
고를 확률도 올라갑니다. 그래서 기본값은 **로컬 35 + 엄선한 rhwp 15 = 50개**입니다.

```bash
# 전부(로컬 35 + rhwp 184 = 219개) 열기
HWP_MCP_PROFILE=full
```

기본에 포함된 rhwp 도구 15개:

| 도구 | 하는 일 |
|---|---|
| `hwp_redact` | 주민등록번호·전화·이메일·카드번호 마스킹 (`--dry-run` 먼저) |
| `hwp_sanitize` | 작성자·제목·최종수정자·미리보기 등 메타데이터 제거 |
| `hwp_inspect_injection` | 문서가 AI 에게 지시를 내리는 형태인지 탐지 (간접 프롬프트 주입) |
| `hwp_inspect_hidden_text` | 흰 글씨·0pt 처럼 사람 눈에 안 보이는데 추출되는 텍스트 |
| `hwp_run_plan` | 여러 수정을 한 번에, **단언 통과 시에만** 저장 (실패하면 디스크 무변경) |
| `hwp_verify` | 쪽수·표 수·포함 문자열 등을 단언 |
| `hwp_batch_fill` | 서식 1개 + 데이터 N행 → 산출 N개 (메일머지) |
| `hwp_scan` | 디렉터리를 훑어 HWP 계열 파일 발견·분류 |
| `hwp_search` | 구역·문단·쪽·문자 오프셋까지 돌려주는 검색 |
| `hwp_extract_data` | 날짜·금액·수량 추출 (위치 포함) |
| `hwp_table_to_csv` · `hwp_csv_to_table` | 표 ↔ CSV (병합 격자 보존) |
| `hwp_export_pdf` | PDF 내보내기 |
| `hwp_explain` · `hwp_digest` | 처음 보는 문서의 결정론적 요약 |

### 엔진이 어떻게 준비되나요

1. `HWP_MCP_RHWP_BIN` 이 있으면 그 경로를 씁니다.
2. 캐시(`~/.cache/hwp-mcp/rhwp-<버전>/`)에 있으면 그걸 씁니다.
3. `PATH` 에 `rhwp` 가 있으면 **그걸 씁니다** (받지 않습니다).
4. 없으면 GitHub 릴리스에서 플랫폼 빌드를 받아 **`SHA256SUMS.txt` 와 대조**하고 캐시합니다.

받는 동안에도 서버는 즉시 뜨고 로컬 도구 35개를 씁니다. 준비가 끝나면
`notifications/tools/list_changed` 를 보내 도구 목록이 자동으로 늘어납니다.
현재 상태는 `hwp_engine_status` 로 언제든 볼 수 있습니다.

```bash
HWP_MCP_PROFILE=full       # rhwp 도구 전부 노출 (기본: curated)
HWP_MCP_RHWP_BIN=/path/rhwp # 쓸 바이너리를 직접 지정
HWP_MCP_NO_DOWNLOAD=1      # 받지 않는다 (없으면 로컬 35개만)
HWP_MCP_CACHE_DIR=/path     # 캐시 위치
```

---

## 도구 목록

아래는 **로컬 도구 35개**입니다. rhwp 쪽 184개는 위 프로필 절을 보세요.
읽기·렌더는 `.hwp`/`.hwpx` 모두, 로컬 쓰기 도구는 `.hwpx` 전용입니다
(**`.hwp` 쓰기는 rhwp 도구로 됩니다** — 아래 한계 절 참고).

### 읽기 / 변환 (6)

| 도구 | `.hwp` | `.hwpx` | 설명 |
|------|:---:|:---:|------|
| `read_hwp` | ✅ | ✅ | 본문 + 표(마크다운) + 이미지 목록 한 번에 |
| `read_hwp_text` | ✅ | ✅ | 본문 + 머리말 + 꼬리말 + 각주 + 수식 통합 텍스트 |
| `read_hwp_tables` | ✅ | ✅ | 표를 GitHub 마크다운으로 (셀 병합 처리) |
| `convert_hwp_markdown` | ✅ | ✅ | 문서 → Markdown 변환 (문서 순서 유지, 표 GFM 제자리, 이미지 추출+상대링크, 수식 `$…$`, 각주 문서 끝) |
| `list_hwp_images` | ✅ | ✅ | 임베디드 이미지 목록 (mime, 바이트) |
| `extract_hwp_images` | ✅ | ✅ | 이미지를 디스크로 추출 |

### 메타 / 조회 (5)

| 도구 | `.hwp` | `.hwpx` | 설명 |
|------|:---:|:---:|------|
| `get_hwp_info` | ✅ | ✅ | 버전·페이지·글꼴·표/이미지/각주/수식 통계 |
| `get_hwp_page_def` | ✅ | ✅ | 섹션별 용지 크기·여백·단·헤더/푸터 마진 |
| `list_hwp_fields` | ✅ | ✅ | 한컴 필드 목록 |
| `get_hwp_field_value` | ✅ | ✅ | 필드 값 조회 |
| `list_hwp_bindata` | – | ✅ | `.hwpx` BinData/ 엔트리 목록 |

### 시각 렌더 (4)

| 도구 | `.hwp` | `.hwpx` | 설명 |
|------|:---:|:---:|------|
| `render_hwp_page` | ✅ | ✅ | 특정 페이지 → SVG (인라인/파일) |
| `render_hwp_all_pages` | ✅ | ✅ | 전체 페이지 SVG 일괄 |
| `render_hwp_html` | ✅ | ✅ | 페이지 → HTML |
| `render_hwp_equation_svg` | – | – | OWPML 수식 script → SVG |

### 쓰기 — 텍스트 (5)

| 도구 | `.hwpx` | 설명 |
|------|:---:|------|
| `replace_hwp_text` | ✅ | 특정 문자열 찾아 바꾸기 |
| `fill_hwp_template` | ✅ | `{{이름}}` 등 다중 자리표시자 |
| `set_hwp_paragraph_text` | ✅ | N번째 문단 텍스트 통째 교체 |
| `set_hwp_cell_text` | ✅ | 표 셀 (행, 열) 텍스트 직접 설정 |
| `set_hwp_field_value` | ✅ | 필드 값 설정 |

### 쓰기 — 구조 (9)

| 도구 | `.hwpx` | 설명 |
|------|:---:|------|
| `append_hwp_paragraph` | ✅ | 본문 끝에 새 문단 |
| `delete_hwp_paragraph` | ✅ | N번째 문단 삭제 |
| `append_hwp_table_row` | ✅ | 표 마지막에 새 행 |
| `delete_hwp_table_row` | ✅ | 표 행 삭제 |
| `append_hwp_table_column` | ✅ | 표 끝에 새 열 (모든 행에) |
| `delete_hwp_table_column` | ✅ | 표 열 삭제 |
| `merge_hwp_cells_horizontal` | ✅ | 가로 셀 병합 (colSpan) |
| `merge_hwp_cells_vertical` | ✅ | 세로 셀 병합 (rowSpan) |
| `replace_hwp_image` | ✅ | 임베디드 이미지 교체 |

### 쓰기 — 서식 (2)

| 도구 | `.hwpx` | 설명 |
|------|:---:|------|
| `apply_hwp_text_style` | ✅ | 글자 색·볼드·이탤릭·밑줄·크기 (charPr 추가) |
| `apply_hwp_paragraph_style` | ✅ | 문단 정렬·들여쓰기·줄간격 (paraPr 추가) |

### 쓰기 — 이미지 / 표 / 신규 (4)

| 도구 | `.hwpx` | 설명 |
|------|:---:|------|
| `insert_hwp_image` | ✅ | 새 이미지 추가 (BinData + manifest + `<hp:pic>`) |
| `delete_hwp_image` | ✅ | BinData/ 엔트리 삭제 |
| `insert_hwp_table` | ⚠️ | 새 OWPML 표 삽입 (실험적 — 파일 valid, rhwp 인식 비완전) |
| `create_hwpx_document` | ✅ | 텍스트로 새 `.hwpx` 만들기 |

## 컨텐츠 추출 매트릭스

| 컨텐츠 | 추출 | 비고 |
|---|:---:|---|
| 본문 문단 텍스트 | ✅ | `read_hwp_text`, `read_hwp` |
| 표 (셀 병합 포함) | ✅ | `read_hwp_tables` 가 markdown 으로 |
| 임베디드 이미지 | ✅ | PNG/JPG/BMP 등 추출 |
| **머리말 / 꼬리말** | ✅ | `read_hwp_text` 결과에 `--- headers ---` / `--- footers ---` 블록 |
| **각주(footnote)** | ✅ | 결과 끝에 `--- footnotes ---` 블록, `[1] 본문…` 형태 |
| **수식(equation)** | ✅ | OWPML script 형태 (예: `TIMES LEFT ( {a} over {b} RIGHT )`), `--- equations ---` 블록 |
| 페이지 SVG 렌더 | ✅ | `render_hwp_page` |
| 텍스트박스 본문 | ❌ | rhwp의 `createShapeControl`은 만들지만 `getTextBoxControlIndex` 반환 패턴이 비명시적 — v0.3에서 trace |
| 미주(endnote) | – | rhwp 자체 미지원 (footnote만) |
| 차트(chart) | ❌ | v0.3 이후 |

## 작성 매트릭스

| 작업 | `.hwp` | `.hwpx` | 비고 |
|---|:---:|:---:|---|
| 텍스트 단일 치환 | ❌ | ✅ | `replace_hwp_text` |
| 다중 자리표시자 채우기 | ❌ | ✅ | `fill_hwp_template` |
| 문단 텍스트 통째 교체 | ❌ | ✅ | `set_hwp_paragraph_text` |
| 표 셀 직접 수정 | ❌ | ✅ | `set_hwp_cell_text` (행·열 지정) |
| 필드 값 설정 | ❌ | ✅ | `set_hwp_field_value` |
| 새 문단 추가 / 삭제 | ❌ | ✅ | `append_hwp_paragraph` / `delete_hwp_paragraph` |
| 표 행 추가 / 삭제 | ❌ | ✅ | `append_hwp_table_row` / `delete_hwp_table_row` |
| 이미지 교체 / 삭제 | ❌ | ✅ | `replace_hwp_image` / `delete_hwp_image` |
| 새 문서 생성 (텍스트) | – | ✅ | `create_hwpx_document` |
| 새 문서 생성 (표) | – | ⚠️ | 텍스트 행으로 평탄화 (v0.3에서 진짜 OWPML 표) |
| 새 이미지 삽입 | ❌ | ✅ | `insert_hwp_image` |
| 표 열 추가 / 삭제 | ❌ | ✅ | `append_hwp_table_column` / `delete_hwp_table_column` |
| 셀 병합 (가로·세로) | ❌ | ✅ | `merge_hwp_cells_horizontal` / `merge_hwp_cells_vertical` |
| 글자 서식 (색·볼드·이탤릭·밑줄·크기) | ❌ | ✅ | `apply_hwp_text_style` |
| 문단 서식 (정렬·들여쓰기·줄간격) | ❌ | ✅ | `apply_hwp_paragraph_style` |
| 새 표 삽입 (진짜 OWPML) | ❌ | ⚠️ | `insert_hwp_table` (실험적) |
| 머리말/꼬리말 신규 삽입 | ❌ | ❌ | v0.3 |
| 차트·북마크·스타일 정의 | ❌ | ❌ | v0.3 |

> `.hwp` 바이너리 쓰기는 rhwp 0.7.7 의 `exportHwp` 라운드트립 한계로 v0.2에서 미지원. 한컴오피스에서 `.hwpx`로 다른 이름 저장 후 쓰기 도구를 사용하시거나, v0.3 릴리스를 기다려주세요.

---

## 사용 예시

### 정부 한글 문서 읽기

```
나: /Users/me/2026년_시행계획.hwpx 읽어줘

AI: # 2026년_시행계획.hwpx
    형식: .HWPX | 문단: 153개 | 표: 15개 | 이미지: 2개

    Ⅰ. 추진 배경
    □ (글로벌 현황) 전세계 AI 솔루션 시장 규모는 ...

    ### 표 9 (7행 x 4열)
    | 도메인 | 입력 데이터 | 학습 내용 | 산업AI 솔루션 적용 기능 예시 |
    | --- | --- | --- | --- |
    | 기계 | · 센서 데이터 로그 ... | ... | ... |
```

### 템플릿 채우기

```
나: /path/to/form.hwpx 에서 {{이름}}=남대현, {{회사}}=포텐랩 으로 채워줘

AI: 저장 완료 (saved): form_filled.hwpx
    총 2건 치환 (2 replacements)
      '{{이름}}' → 1건
      '{{회사}}' → 1건
```

### 텍스트 치환

```
나: /path/to/doc.hwpx 의 "산업AI" 를 "산업-AI" 로 바꿔줘

AI: '산업AI' → '산업-AI': 18건 교체 (replaced 18)
    저장 (saved): doc_modified.hwpx
```

### 새 .hwpx 만들기

```
나: employees.hwpx 에 "사원 명부" 와 "두 번째 줄" 두 줄을 가진 문서 만들어줘

AI: HWPX 문서 생성 완료 (created): employees.hwpx
```

### 이미지 추출

```
나: /path/to/document.hwpx 에서 이미지 빼줘

AI: 이미지 2개를 추출했습니다 (extracted 2 images):
    저장 위치: /path/to/document_images
      - image_001.bmp
      - image_002.bmp
```

### 페이지를 SVG로 렌더 (시각 분석용)

```
나: /path/to/document.hwpx 의 첫 페이지를 SVG로 보여줘

AI: <svg xmlns="..." width="793" height="1122" viewBox="...">
    <defs>...</defs>
    ...
    </svg>
```

또는 디스크로 저장:
```
나: /path/to/document.hwpx 모든 페이지 SVG로 저장해줘

AI: 9/9 페이지 SVG 저장 (rendered 9/9 pages):
    저장 위치: /path/to/document_pages
      - page_001.svg
      - page_002.svg ...
```

---

## 한계

- **`.hwp` 쓰기 — 로컬 도구는 안 되고, rhwp 도구로는 됩니다.** `set_hwp_cell_text` 같은
  로컬 쓰기 도구는 여전히 `.hwpx` 전용입니다. 대신 `hwp_replace_text` · `hwp_set_cell` ·
  `hwp_fill_fields` 같은 **rhwp 편집 도구는 입력 형식을 보존**하므로 `.hwp` 를 그대로
  고쳐 저장합니다 (2026-11-19 실측: `.hwp` 치환 1건 → 산출 형식 `hwp5` · IR 자기검증
  `--verify` 통과 · 다시 읽어 확인). 한컴오피스에서 `.hwpx` 로 바꿔 저장할 필요가 없습니다.
- **크로스 포맷 저장** — 로컬 도구는 `.hwpx` → `.hwpx` 로만 저장합니다. rhwp 도구는
  입력 형식을 보존하고, `.hwpx` 입력에 `-o ….hwp` 를 주면 경고와 함께 HWP5 로 저장합니다
  (이미지·차트가 유실될 수 있습니다).
- **머리말/꼬리말/각주 추출 가능, 텍스트박스/미주/수식은 v0.3** — `read_hwp_text` 결과에 머리말은 `--- headers ---`, 꼬리말은 `--- footers ---`, 각주는 `--- footnotes ---` 블록으로 표시됩니다. 텍스트박스 본문, 미주, 수식 추출은 v0.3 예정.
- **검색어가 두 텍스트 노드에 걸치면 매칭 안 됨** — 예: 한 `<hp:t>`가 "산업"으로 끝나고 다음이 "AI"로 시작하면 "산업AI"는 매칭 X. 한컴 hwpctl과 동일한 한계입니다.
- **`create_hwpx_document`의 표는 v0.2에서 텍스트 행으로 평탄화** — 진짜 OWPML 표는 v0.3에서.

---

## 어떻게 동작하나요?

- **읽기**: [`@rhwp/core`](https://www.npmjs.com/package/@rhwp/core) (rhwp의 Rust+WASM 파서) 가 섹션·문단·표(병합 셀 포함)·이미지를 traverse 합니다.
- **쓰기 (.hwpx)**: ZIP 아카이브 안의 `Contents/section*.xml` 을 직접 파싱해서 `<hp:t>` 텍스트 노드를 search/replace 한 뒤 다시 패키징합니다 (mimetype은 spec대로 stored). rhwp의 `exportHwpx()` 라운드트립 이슈를 우회하기 위한 layer입니다.
- **새 문서**: rhwp의 `createBlankDocument` + `insertText` 로 작성한 뒤 `exportHwpx` 로 저장합니다 (텍스트 라운드트립이 안정).
- **rhwp 도구 (v0.4 신규)**: `rhwp mcp-serve` 를 자식 프로세스로 띄워 MCP 를 **그대로 중계**합니다.
  rhwp 는 이미 표준 MCP 서버라(2026-11-19 확인: `initialize` 가 protocolVersion
  `2025-06-18` · serverInfo `rhwp 0.9.1` 응답, `tools/list` 184개) 184개를 손으로 매핑하지
  않습니다. 손으로 적으면 rhwp 가 올라갈 때마다 낡으므로, 목록과 호출을 중계해
  **파리티를 구조적으로** 보장합니다.

## 크레딧

**rhwp** ([@edwardkim](https://github.com/edwardkim), MIT) — 한글 포맷 파서·렌더러·Field API. 이 프로젝트의 포맷 처리는 rhwp 에 기반합니다: <https://github.com/edwardkim/rhwp>

**hwp-mcp** — rhwp 위에 AI 에이전트가 자연어로 호출할 수 있게 도구화한 MCP 어댑터 (MIT).

### 라이선스 (2026-11-19 확인)

| 대상 | 라이선스 |
|---|---|
| `hwp-mcp` | MIT |
| `rhwp` (엔진) | MIT — Copyright 2025-2026 Edward Kim |
| rhwp 의 제3자 의존성 | MIT · Apache-2.0 · BSD-3-Clause · ISC · CC0 · Unlicense (**GPL·AGPL·LGPL·SSPL 0건**) |
| rhwp 가 쓰는 폰트 39종 | OFL-1.1 38종 + GUST/LPPL 1종 (LaTeX 수식 폰트) |

**이 패키지는 rhwp 바이너리를 번들하지 않습니다.** 첫 실행 때 사용자의 기기가 상류
GitHub 릴리스에서 직접 받고 SHA256 으로 대조합니다. rhwp 의 제3자 고지(`notices/`)는
그 압축 안에 함께 들어 있어 사용자에게 그대로 전달됩니다.

⚠️ `--embed-fonts` 로 폰트를 산출물에 임베딩해 **배포**할 경우, 해당 폰트의 OFL 조건
(저작권 고지 포함, 글꼴 자체의 유료 판매 금지)은 배포하는 쪽의 의무입니다.

## 커버리지

| 영역 | 커버 |
|---|---|
| 읽기/추출 | ~90% |
| 렌더링 | ~85% (SVG · HTML · 수식 SVG · Canvas는 브라우저용이라 제외) |
| 쓰기 — 텍스트 | ~95% |
| 쓰기 — 구조 | ~90% (행·열·병합·이미지 4종) |
| 쓰기 — 서식 | ~70% (글자 + 문단) |
| 메타 / 필드 | ~85% |
| **전체 가중** | **~85%** |

남은 큰 항목: `.hwp` 바이너리 쓰기, 차트, 스타일 정의·적용, 텍스트박스 본문 추출, hwpctl 30 Actions(의도적 제외).

## 업데이트 노트

### v0.4.0 (2026-11-19)

- ✨ **rhwp 가 주는 기능 전부 사용 가능** — `rhwp mcp-serve` 를 중계해 도구 **184개**를 엽니다.
  목록을 코드에 적지 않고 런타임에 받아 오므로 rhwp 업그레이드를 자동으로 따라갑니다.
- ✨ **프로필** — 기본은 로컬 35 + 엄선 15 = **50개**. `HWP_MCP_PROFILE=full` 로 219개 전부.
  (184개를 기본으로 열면 AI 의 도구 선택 정확도와 컨텍스트가 같이 나빠집니다.)
- ✨ **`.hwp` 직접 쓰기** — rhwp 편집 도구는 입력 형식을 보존합니다. `.hwpx` 로 바꿔
  저장할 필요가 없어졌습니다.
- ✨ **`hwp_engine_status`** — 엔진 상태·버전·출처·노출 도구 수를 한 번에 봅니다.
- ✨ **바이너리 자동 확보** — `HWP_MCP_RHWP_BIN` → 캐시 → `PATH` → GitHub 릴리스 순으로
  찾고, 받을 때는 `SHA256SUMS.txt` 와 대조합니다. 받는 동안에도 서버는 즉시 뜨고
  준비되면 `tools/list_changed` 로 목록을 갱신합니다.
- 🐛 **첫 설치가 깨지던 버그** — 릴리스 압축이 `rhwp/rhwp` 구조라 루트의 `rhwp` 가
  디렉터리인데 `existsSync` 로 골라 `EISDIR` 로 실패했습니다. 파일 여부를 확인하도록
  고치고 회귀 테스트를 넣었습니다.
- 🐛 서버가 보고하는 버전이 `package.json` 과 어긋나 있었습니다 (0.2.0 대 0.3.0).
- `HWP_MCP_NO_DOWNLOAD=1` · `HWP_MCP_CACHE_DIR` 추가.

### v0.3.0 (2026-07-08)

- ✨ **`convert_hwp_markdown` 신규** — HWP/HWPX → Markdown 변환. 문서 흐름 순서를 그대로 유지합니다(기존 `read_hwp`는 본문 뒤에 표를 몰아서 출력).
  - 표는 제자리에 GitHub 마크다운으로
  - 이미지는 `<문서명>_images/`로 추출 + 상대링크 (`output_path` 생략 시 markdown 문자열만 반환)
  - 수식은 `$…$` 인라인, 각주는 문서 끝 `[^N]:` 목록
  - 개요 1~7 스타일 문단은 `#`~`######` heading으로 (best-effort)
- 내부: 순서 보존 traversal walker `walkDocumentFlow` 추가 — 수식 컨트롤이 1x1 표로도 응답하는 rhwp 특성 처리

### v0.2.1 (2026-05-26)

- 🐛 bin-symlink 버그 수정 — v0.2.0에서 `npx hwp-mcp` 실행 시 서버가 조용히 종료되던 문제

### v0.2.0 (2026-04-29)

- Python 구현 폐기, **rhwp(Rust + WASM) 기반 전면 재작성** — 한컴오피스·OS 의존성 제거
- 읽기·렌더 `.hwp`/`.hwpx` 지원, `.hwpx` 쓰기(치환·템플릿·신규 생성·구조 편집) 34개 도구

### v0.1 (2026-03-31)

- 최초 릴리스 (`hangul-mcp` → `hwp-mcp` 개명, Python 기반)

## 릴리스 / 이슈

- 변경 이력: 위 [업데이트 노트](#업데이트-노트) 및 <https://github.com/treesoop/hwp-mcp/releases>
- 버그 신고 · 기능 제안: <https://github.com/treesoop/hwp-mcp/issues>
- npm 패키지: <https://www.npmjs.com/package/hwp-mcp>

이슈 올릴 때는 `node --version`, OS, MCP 클라이언트(Claude Code / Desktop / Cursor / …), 그리고 가능하면 재현되는 `.hwpx` 샘플을 첨부해주세요.

## English

`hwp-mcp` is an MCP server for reading and writing Korean Hangul (.hwp / .hwpx) documents from Claude / Cursor / ChatGPT and any MCP-compatible client. **Read and Markdown conversion work for both formats; write currently supports .hwpx (find/replace, template fill, create new doc) — .hwp write is planned.** Runs on macOS (including Apple Silicon), Windows, and Linux — WebAssembly-based, no Hancom Office install required, no Windows-only COM automation. Built on top of [rhwp](https://github.com/edwardkim/rhwp) (Rust + WebAssembly HWP engine by Edward Kim, MIT).

```bash
claude mcp add hwp-mcp -- npx -y hwp-mcp
claude mcp list | grep hwp-mcp   # ✓ Connected
```

**Not seeing `✓ Connected`?** Upgrade to v0.2.1+ (`npx -y hwp-mcp@latest`) — v0.2.0 had a bin-symlink bug that made the server exit silently. Tools not appearing in your AI client? Restart the session; MCP tools load at startup.

**Rolling it out to a whole team?** [Trina AX](https://github.com/trina-app/trina-ax), from the same team, is an open-source, self-hosted workspace that runs Claude Code on your company's server. Everyone shares the company files (HWP/HWPX, PDF, Office), team skills and MCP servers, each within their own folder permissions.

## License

MIT.
