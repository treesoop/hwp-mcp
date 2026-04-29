# hwp-mcp

> Claude · Cursor · ChatGPT 등 MCP 호환 AI에서 **한글 문서(.hwp / .hwpx)** 를 읽고 수정하고 새로 만들 수 있게 해주는 서버입니다.

[![npm version](https://img.shields.io/npm/v/hwp-mcp.svg)](https://www.npmjs.com/package/hwp-mcp)
[![Built on rhwp](https://img.shields.io/badge/built%20on-rhwp-blue)](https://github.com/edwardkim/rhwp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

`hwp-mcp`은 한컴오피스 문서를 AI 에이전트가 직접 다루도록 해주는 MCP(Model Context Protocol) 서버입니다. **읽기뿐 아니라 텍스트 수정, 템플릿 채우기, 새 문서 생성까지 가능합니다.**

> **rhwp 기반.** 이 프로젝트는 [Edward Kim](https://github.com/edwardkim) 님의 [**rhwp**](https://github.com/edwardkim/rhwp) (Rust + WebAssembly HWP/HWPX 엔진) 위에 얹은 얇은 MCP 어댑터입니다. 닫힌 한글 포맷의 벽을 깨주신 rhwp 프로젝트에 감사드립니다 🙏

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

## 무엇을 할 수 있나요?

### 읽기 (`.hwp` · `.hwpx` 모두 지원)

| 도구 | 설명 |
|------|-------------|
| `read_hwp` | 본문 + 표(마크다운) + 이미지 목록까지 한 번에 |
| `read_hwp_text` | 본문 + 각주 텍스트 추출 |
| `read_hwp_tables` | 표를 GitHub 마크다운으로 (셀 병합 처리) |
| `list_hwp_images` | 임베디드 이미지 목록 |
| `extract_hwp_images` | 이미지를 디스크로 추출 |

### 시각 렌더링 (`.hwp` · `.hwpx` 모두 지원)

| 도구 | 설명 |
|------|-------------|
| `render_hwp_page` | 특정 페이지를 SVG로 렌더 (인라인 또는 파일 저장). AI가 페이지를 시각적으로 분석할 때 |
| `render_hwp_all_pages` | 전체 페이지 SVG 일괄 추출 |

### 쓰기 (`.hwpx` 지원)

| 도구 | 설명 |
|------|-------------|
| `replace_hwp_text` | 특정 문자열 찾아 바꾸기 |
| `fill_hwp_template` | `{{이름}}`, `{{회사}}` 등 여러 자리표시자 한 번에 |
| `create_hwpx_document` | 텍스트로 새 `.hwpx` 만들기 |

> v0.2에서 쓰기는 `.hwpx`에 대해서만 동작합니다. `.hwp`(바이너리) 쓰기는 v0.3에서 추가 예정 — 자세한 한계는 [한계](#한계) 참고.

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
- **각주는 추출되지만 머리말/꼬리말/텍스트박스는 아직 미노출** — `read_hwp_text` 결과 끝에 `--- footnotes ---` 섹션으로 각주가 붙습니다. 머리말/꼬리말/텍스트박스 본문은 v0.3 예정.
- **검색어가 두 텍스트 노드에 걸치면 매칭 안 됨** — 예: 한 `<hp:t>`가 "산업"으로 끝나고 다음이 "AI"로 시작하면 "산업AI"는 매칭 X. 한컴 hwpctl과 동일한 한계입니다.
- **`create_hwpx_document`의 표는 v0.2에서 텍스트 행으로 평탄화** — 진짜 OWPML 표는 v0.3에서.

---

## 어떻게 동작하나요?

- **읽기**: [`@rhwp/core`](https://www.npmjs.com/package/@rhwp/core) (rhwp의 Rust+WASM 파서) 가 섹션·문단·표(병합 셀 포함)·이미지를 traverse 합니다.
- **쓰기 (.hwpx)**: ZIP 아카이브 안의 `Contents/section*.xml` 을 직접 파싱해서 `<hp:t>` 텍스트 노드를 search/replace 한 뒤 다시 패키징합니다 (mimetype은 spec대로 stored). rhwp의 `exportHwpx()` 라운드트립 이슈를 우회하기 위한 layer입니다.
- **새 문서**: rhwp의 `createBlankDocument` + `insertText` 로 작성한 뒤 `exportHwpx` 로 저장합니다 (텍스트 라운드트립이 안정).

## rhwp에 감사드립니다

`hwp-mcp`이 가능한 건 [**rhwp**](https://github.com/edwardkim/rhwp)가 한글 포맷을 전부 역공학으로 풀어주셨기 때문입니다. 파싱·렌더링·필드 핸들링·이미지 추출 — 핵심 능력은 모두 rhwp의 것입니다. 가능하시다면 그 프로젝트도 함께 응원해 주세요: <https://github.com/edwardkim/rhwp>

## English

`hwp-mcp` is an MCP server for reading and writing Korean Hangul (.hwp / .hwpx) documents from Claude / Cursor / ChatGPT and any MCP-compatible client. **Read works for both formats; write currently supports .hwpx (find/replace, template fill, create new doc) — .hwp write is planned for v0.3.** Built on top of [rhwp](https://github.com/edwardkim/rhwp) (Rust + WebAssembly HWP engine by Edward Kim, MIT). Install: `claude mcp add hwp-mcp -- npx -y hwp-mcp`.

## License

MIT.
