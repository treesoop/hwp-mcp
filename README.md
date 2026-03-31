# hwp-mcp

MCP server for reading and writing HWP/HWPX (Korean Hangul word processor) files.

Works with Claude Code, Claude Desktop, VS Code Copilot, Cursor, ChatGPT, and any MCP-compatible client.

## Install

```bash
# Claude Code
claude mcp add hwp-mcp -- uvx --from hwp-mcp hwp-mcp

# Claude Desktop / Other clients (settings JSON)
{
  "mcpServers": {
    "hwp-mcp": {
      "command": "uvx",
      "args": ["--from", "hwp-mcp", "hwp-mcp"]
    }
  }
}
```

## Tools

### Read

| Tool | Description |
|------|-------------|
| `read_hwp` | Read full document (text + tables + images) |
| `read_hwp_text` | Extract text only |
| `read_hwp_tables` | Extract tables as markdown |
| `list_hwp_images` | List embedded images |
| `extract_hwp_images` | Save images to disk |

### Write

| Tool | Description |
|------|-------------|
| `fill_hwp_template` | Fill template placeholders (e.g. `{{name}}` -> `John`) |
| `replace_hwp_text` | Find and replace text |
| `create_hwpx_document` | Create new HWPX document with text and tables |

## Usage Examples

### Read an HWP file
```
You: Read /path/to/document.hwp

AI: # document.hwp
    Format: .HWP | Paragraphs: 23 | Tables: 2 | Images: 1

    | Name | Position | Company |
    | --- | --- | --- |
    | Kim | CTO | Acme |
    ...
```

### Fill a template
```
You: Fill template /path/to/form.hwp with name=Kim, company=Acme

AI: Saved: form_filled.hwp
    Total 2 replacements
      '{{name}}' -> 1
      '{{company}}' -> 1
```

### Replace text in HWP
```
You: Replace "홍길동" with "남대현" in /path/to/document.hwp

AI: '홍길동' -> '남대현': 3 replacements
    Saved: document_modified.hwp
```

### Create a new HWPX document
```
You: Create a document with title "Employee Info" and a table with columns Name, Role

AI: HWPX document created: employee.hwpx
```

### Extract images
```
You: Extract images from /path/to/document.hwp

AI: Extracted 3 images to /path/to/document_images/
      - BIN0001.png
      - BIN0002.jpg
      - BIN0003.emf
```

## Supported Formats

| Format | Read | Write |
|--------|------|-------|
| HWP (v5.0) | Text, tables, images | Text replacement |
| HWPX (OWPML) | Text, tables, images | Text replacement, create new |

## How It Works

- **HWP**: Parses OLE/CFB binary format, decompresses zlib streams, decodes HWPTAG records (text, tables, images)
- **HWPX**: Extracts ZIP archive, parses OWPML XML (section*.xml) for text/tables, reads BinData/ for images
- **Write**: Rebuilds OLE container with modified stream data (custom CFB writer for size-changed streams)

## License

MIT
