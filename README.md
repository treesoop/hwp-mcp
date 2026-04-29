# hwp-mcp

> Read & write **HWP / HWPX** (Korean Hangul) documents from Claude, Cursor, ChatGPT, and any MCP-compatible client.

[![npm version](https://img.shields.io/npm/v/hwp-mcp.svg)](https://www.npmjs.com/package/hwp-mcp)
[![Built on rhwp](https://img.shields.io/badge/built%20on-rhwp-blue)](https://github.com/edwardkim/rhwp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

`hwp-mcp` is an MCP (Model Context Protocol) server that lets AI assistants read, edit, and create Korean Hancom Office documents. It is built on top of [**rhwp**](https://github.com/edwardkim/rhwp), a Rust + WebAssembly HWP/HWPX engine by Edward Kim.

---

## Install

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

Requires Node.js ≥ 20.

---

## Tools

### Read (.hwp + .hwpx)

| Tool | Description |
|------|-------------|
| `read_hwp` | Full document: text + tables (markdown) + image list |
| `read_hwp_text` | Body text only |
| `read_hwp_tables` | Tables as GitHub-flavored markdown (handles merged cells) |
| `list_hwp_images` | List embedded images (mime, bytes) |
| `extract_hwp_images` | Save embedded images to disk |

### Write (.hwpx only in v0.2)

| Tool | Description |
|------|-------------|
| `replace_hwp_text` | Find & replace, save as new .hwpx |
| `fill_hwp_template` | Fill multiple `{{placeholders}}` in one call |
| `create_hwpx_document` | Create a new .hwpx with text content |

> **v0.2 limitation:** `.hwp` (binary) input is rejected by write tools with a clear error. Convert to `.hwpx` in Hancom Office, or use a read tool. `.hwp` write is planned for v0.3. See [Limitations](#limitations) below.

---

## Usage examples

### Read a Korean government .hwpx

```
You: Read /Users/me/2026년_시행계획.hwpx

AI: # 2026년_시행계획.hwpx
    형식: .HWPX | 문단: 153개 | 표: 15개 | 이미지: 2개

    Ⅰ. 추진 배경
    □ (글로벌 현황) 전세계 AI 솔루션 시장 규모는 ...
    ...

    ### 표 9 (7행 x 4열)
    | 도메인 | 입력 데이터 | 학습 내용 | 산업AI 솔루션 적용 기능 예시 |
    | --- | --- | --- | --- |
    | 기계 | · 센서 데이터 로그 ... | ... | ... |
    ...
```

### Fill a template

```
You: Fill /path/to/form.hwpx with {{name}}=남대현, {{company}}=포텐랩

AI: 저장 완료 (saved): form_filled.hwpx
    총 2건 치환 (2 replacements)
      '{{name}}' → 1건
      '{{company}}' → 1건
```

### Replace text

```
You: In /path/to/doc.hwpx replace "산업AI" with "산업-AI"

AI: '산업AI' → '산업-AI': 18건 교체 (replaced 18)
    저장 (saved): doc_modified.hwpx
```

### Create a new HWPX

```
You: Create employees.hwpx with the lines "사원 명부" and "두 번째 줄"

AI: HWPX 문서 생성 완료 (created): employees.hwpx
```

### Extract images

```
You: Extract images from /path/to/document.hwpx

AI: 이미지 2개를 추출했습니다 (extracted 2 images):
    저장 위치 (output): /path/to/document_images
      - image_001.bmp
      - image_002.bmp
```

---

## Limitations

- **`.hwp` write is not supported in v0.2.** rhwp 0.7.7's binary export does not preserve in-memory edits, so write tools route via direct ZIP-level mutation of `.hwpx` `Contents/section*.xml`. Native `.hwp` write is on the v0.3 roadmap.
- **Cross-format save is rejected.** `.hwpx` input must save as `.hwpx`. The reverse direction is rejected with a clear error.
- **Headers, footers, footnotes, and text-boxes are not yet extracted by read tools** — only body paragraphs and tables. Tracked for v0.3.
- **Replace boundaries are XML text nodes.** A target string split across two adjacent runs (e.g. one `<hp:t>` ends with "산업", the next begins with "AI") is not joined and won't match. This mirrors hwpctl's text-replace semantics and is the same trade-off other Korean office tools make.
- **Tables in `create_hwpx_document` are flattened to text rows in v0.2.** True OWPML table generation arrives in v0.3.

---

## 한국어

`hwp-mcp`는 Claude, Cursor, ChatGPT 등 MCP 호환 AI에서 한글 문서(HWP, HWPX)를 읽고 쓸 수 있도록 해주는 서버입니다. 파서·렌더링은 [rhwp](https://github.com/edwardkim/rhwp) (Edward Kim 작) 의 Rust+WebAssembly 엔진을 사용합니다.

### 설치

Claude Code:
```bash
claude mcp add hwp-mcp -- npx -y hwp-mcp
```

Claude Desktop / Cursor 설정 JSON:
```json
{
  "mcpServers": {
    "hwp-mcp": { "command": "npx", "args": ["-y", "hwp-mcp"] }
  }
}
```

Node.js 20 이상 필요.

### 사용 예시

```
사용자: /Users/me/이력서.hwp 읽어줘

AI: # 이력서.hwp
    형식: .HWP | 문단: 18개 | 표: 1개 | 이미지: 0개
    ...
```

### 한계 (v0.2)

- `.hwp` 쓰기 미지원 — `.hwpx`만 write 가능 (한계 사항은 영문 [Limitations](#limitations) 섹션 참고). `.hwp` write는 v0.3 예정.
- 크로스 포맷 저장 미지원 (입력과 같은 확장자로만 저장)
- 머리말/꼬리말/각주/텍스트박스 미추출 (v0.3)
- 셀 병합은 best-effort 2D 표로 평탄화

---

## How it works

- **Read** uses [`@rhwp/core`](https://www.npmjs.com/package/@rhwp/core) (rhwp's Rust+WASM parser) to traverse sections, paragraphs, tables (including merged cells via `getCellInfo`), and embedded images.
- **Write** for `.hwpx` operates directly on the ZIP archive: `Contents/section*.xml` is parsed, `<hp:t>` text nodes are search/replaced with XML escaping, and the archive is repackaged with `mimetype` stored uncompressed (per ODF/HWPX spec). This bypasses rhwp's `exportHwpx()` round-trip issue in 0.7.7.
- **Create** uses rhwp's `createBlankDocument` + `insertText` and exports via `exportHwpx` (text-only round-trips correctly through that path).

## Built on rhwp

`hwp-mcp` is a thin MCP adapter on top of [`@rhwp/core`](https://www.npmjs.com/package/@rhwp/core). Most of the parsing, traversal, field handling, and document export comes from rhwp. Please consider supporting that project: <https://github.com/edwardkim/rhwp>.

## License

MIT.
