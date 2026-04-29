# hwp-mcp

> Claude · Cursor · ChatGPT 등 MCP 호환 AI에서 **한글 문서(.hwp / .hwpx)** 를 읽고 수정하고 새로 만들 수 있게 해주는 서버입니다.

[![npm version](https://img.shields.io/npm/v/hwp-mcp.svg)](https://www.npmjs.com/package/hwp-mcp)
[![Built on rhwp](https://img.shields.io/badge/built%20on-rhwp-blue)](https://github.com/edwardkim/rhwp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

`hwp-mcp`은 한컴오피스 문서를 AI 에이전트가 직접 다루도록 해주는 MCP(Model Context Protocol) 서버입니다. **읽기뿐 아니라 텍스트 수정, 템플릿 채우기, 새 문서 생성까지 가능합니다.**

## 어떤 프로젝트인가요?

이 프로젝트는 두 부분으로 나뉩니다.

- 🔧 **rhwp가 한 일 (핵심 엔진)** — [Edward Kim](https://github.com/edwardkim) 님의 [**rhwp**](https://github.com/edwardkim/rhwp)는 닫힌 한글 포맷(HWP 5.0 binary, HWPX/OWPML)을 전부 역공학으로 풀어 Rust + WebAssembly로 구현한 오픈소스 엔진입니다. 파싱, 표·이미지·수식·머리말 추출, SVG 렌더링, 한컴 호환 Field API — 이 모든 핵심 능력은 rhwp 가 제공합니다. **rhwp 가 없으면 이 프로젝트도 없습니다.**

- 🤝 **`hwp-mcp` 가 한 일 (에이전트 어댑터)** — `@rhwp/core` 위에 얹은 얇은 MCP 서버 layer. 우리가 추가한 것은:
  - `read_hwp`, `fill_hwp_template`, `replace_hwp_text` 같은 **에이전트 친화적 도구 시그니처** — Claude/Cursor 같은 LLM이 자연어로 호출할 수 있게
  - 본문·표·이미지·머리말·꼬리말·각주·수식을 한 번에 dump 하는 **시나리오 중심 traversal walker**
  - 표 셀 병합 자동 처리, footnote/equation 자동 합본 같은 **사용 편의 layer**
  - rhwp 0.7.7 의 `exportHwpx` 라운드트립 한계를 우회하기 위한 **`.hwpx` ZIP-level mutation layer** (실제 쓰기를 가능하게 하는 핵심)
  - npm `hwp-mcp` 패키지 (한 줄 설치) + Node.js WASM 부트스트랩

요약: **AI가 한글 문서를 진짜로 읽고 쓸 수 있게 해주는 어댑터**입니다. 모든 오픈 한글 능력에 대한 감사는 rhwp 프로젝트에 보내주세요 🙏

---

## 설치

### Claude Code

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

Node.js 20 이상 필요.

---

## 도구 목록

`hwp-mcp` v0.2가 노출하는 **33개 MCP 도구**입니다. 읽기·렌더는 `.hwp`/`.hwpx` 모두 지원, 쓰기는 `.hwpx` 전용입니다.

### 읽기 (5)

| 도구 | `.hwp` | `.hwpx` | 설명 |
|------|:---:|:---:|------|
| `read_hwp` | ✅ | ✅ | 본문 + 표(마크다운) + 이미지 목록 한 번에 |
| `read_hwp_text` | ✅ | ✅ | 본문 + 머리말 + 꼬리말 + 각주 + 수식 통합 텍스트 |
| `read_hwp_tables` | ✅ | ✅ | 표를 GitHub 마크다운으로 (셀 병합 처리) |
| `list_hwp_images` | ✅ | ✅ | 임베디드 이미지 목록 (mime, 바이트) |
| `extract_hwp_images` | ✅ | ✅ | 이미지를 디스크로 추출 |

### 메타 / 조회 (4)

| 도구 | `.hwp` | `.hwpx` | 설명 |
|------|:---:|:---:|------|
| `get_hwp_info` | ✅ | ✅ | 버전·페이지·글꼴·표/이미지/각주/수식 통계 |
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

`hwp-mcp` v0.2의 알려진 제약 사항입니다.

- **`.hwp` 쓰기 미지원** — 읽기는 `.hwp`/`.hwpx` 모두 됩니다. 쓰기는 `.hwpx`만. `.hwp` 입력에 대해 쓰기 도구를 호출하면 명확한 에러 메시지를 돌려줍니다. 한컴오피스에서 `.hwpx`로 다른 이름 저장 후 사용하시거나, v0.3 릴리스를 기다려주세요.
- **크로스 포맷 저장 거부** — `.hwpx` 입력은 `.hwpx`로만 저장됩니다.
- **머리말/꼬리말/각주 추출 가능, 텍스트박스/미주/수식은 v0.3** — `read_hwp_text` 결과에 머리말은 `--- headers ---`, 꼬리말은 `--- footers ---`, 각주는 `--- footnotes ---` 블록으로 표시됩니다. 텍스트박스 본문, 미주, 수식 추출은 v0.3 예정.
- **검색어가 두 텍스트 노드에 걸치면 매칭 안 됨** — 예: 한 `<hp:t>`가 "산업"으로 끝나고 다음이 "AI"로 시작하면 "산업AI"는 매칭 X. 한컴 hwpctl과 동일한 한계입니다.
- **`create_hwpx_document`의 표는 v0.2에서 텍스트 행으로 평탄화** — 진짜 OWPML 표는 v0.3에서.

---

## 어떻게 동작하나요?

- **읽기**: [`@rhwp/core`](https://www.npmjs.com/package/@rhwp/core) (rhwp의 Rust+WASM 파서) 가 섹션·문단·표(병합 셀 포함)·이미지를 traverse 합니다.
- **쓰기 (.hwpx)**: ZIP 아카이브 안의 `Contents/section*.xml` 을 직접 파싱해서 `<hp:t>` 텍스트 노드를 search/replace 한 뒤 다시 패키징합니다 (mimetype은 spec대로 stored). rhwp의 `exportHwpx()` 라운드트립 이슈를 우회하기 위한 layer입니다.
- **새 문서**: rhwp의 `createBlankDocument` + `insertText` 로 작성한 뒤 `exportHwpx` 로 저장합니다 (텍스트 라운드트립이 안정).

## 크레딧

**rhwp** ([@edwardkim](https://github.com/edwardkim)) — 핵심 파서·렌더러·Field API. 닫힌 한글 포맷을 오픈한 그 모든 작업이 이 프로젝트의 토대입니다. 가능하시다면 그 프로젝트도 함께 응원해 주세요: <https://github.com/edwardkim/rhwp>

**hwp-mcp** — rhwp 위에 AI 에이전트가 자연어로 호출할 수 있게 도구화한 얇은 MCP 어댑터. 핵심 능력은 모두 rhwp 의 것이고, 우리는 그것을 LLM 에 연결한 wiring 입니다.

## English

`hwp-mcp` is an MCP server for reading and writing Korean Hangul (.hwp / .hwpx) documents from Claude / Cursor / ChatGPT and any MCP-compatible client. **Read works for both formats; write currently supports .hwpx (find/replace, template fill, create new doc) — .hwp write is planned for v0.3.** Built on top of [rhwp](https://github.com/edwardkim/rhwp) (Rust + WebAssembly HWP engine by Edward Kim, MIT). Install: `claude mcp add hwp-mcp -- npx -y hwp-mcp`.

## License

MIT.
