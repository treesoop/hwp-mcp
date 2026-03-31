# hangul-mcp

MCP server for reading and writing HWP/HWPX (Korean Hangul word processor) files.

Works with Claude Code, Claude Desktop, VS Code Copilot, Cursor, ChatGPT, and any MCP-compatible client.

## Install

```bash
# Claude Code
claude mcp add hangul -- uvx hangul-mcp

# Claude Desktop / Other clients (settings JSON)
{
  "mcpServers": {
    "hangul": {
      "command": "uvx",
      "args": ["hangul-mcp"]
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

## Examples

### Read an HWP file
```
> Read /path/to/document.hwp

# document.hwp
Format: .HWP | Paragraphs: 23 | Tables: 2 | Images: 1

| Name | Position | Company |
| --- | --- | --- |
| Kim | CTO | Acme |
...
```

### Fill a template
```
> Fill template /path/to/form.hwp with {"{{name}}": "Kim", "{{company}}": "Acme"}

Saved: form_filled.hwp
Total 2 replacements
  '{{name}}' -> 1
  '{{company}}' -> 1
```

### Create a new document
```
> Create HWPX with text "Employee Info" and a table [["Name", "Role"], ["Kim", "CTO"]]

HWPX document created: employee.hwpx
```

## Supported Formats

| Format | Read | Write |
|--------|------|-------|
| HWP (v5.0) | Text, tables, images | Text replacement |
| HWPX (OWPML) | Text, tables, images | Text replacement, create new |

## License

MIT
