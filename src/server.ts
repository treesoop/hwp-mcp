#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readHwp, readHwpText, readHwpTables } from "./tools/read.js";
import { listHwpImages, extractHwpImages } from "./tools/images.js";
import {
  replaceHwpText,
  fillHwpTemplate,
  createHwpxDocument,
} from "./tools/write.js";
import { renderHwpPage, renderHwpAllPages } from "./tools/render.js";
import { replaceHwpImage, listHwpBinData } from "./tools/replace-image.js";
import { getHwpInfo, listHwpFields, getHwpFieldValue } from "./tools/info.js";
import {
  appendHwpParagraph,
  deleteHwpParagraph,
  appendHwpTableRow,
  deleteHwpTableRow,
  deleteHwpImage,
  setHwpFieldValue,
  setHwpParagraphText,
  setHwpCellText,
} from "./tools/edit.js";
import { renderHwpHtml, renderHwpEquationSvg } from "./tools/render-extra.js";

const TOOLS = [
  {
    name: "read_hwp",
    description:
      "Read full HWP/HWPX document content as text + tables (markdown) + image listing. Args: file_path (absolute path).",
    inputSchema: {
      type: "object",
      properties: { file_path: { type: "string" } },
      required: ["file_path"],
    },
  },
  {
    name: "read_hwp_text",
    description:
      "Extract plain body text from an HWP/HWPX file (no tables, no images). Args: file_path.",
    inputSchema: {
      type: "object",
      properties: { file_path: { type: "string" } },
      required: ["file_path"],
    },
  },
  {
    name: "read_hwp_tables",
    description:
      "Extract every table from an HWP/HWPX file as GitHub-flavored markdown. Args: file_path.",
    inputSchema: {
      type: "object",
      properties: { file_path: { type: "string" } },
      required: ["file_path"],
    },
  },
  {
    name: "list_hwp_images",
    description:
      "List embedded images (mime, byte length, locator) in an HWP/HWPX file. Args: file_path.",
    inputSchema: {
      type: "object",
      properties: { file_path: { type: "string" } },
      required: ["file_path"],
    },
  },
  {
    name: "extract_hwp_images",
    description:
      "Save every embedded image to disk. Args: file_path, output_dir (optional; defaults to <file>_images/).",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        output_dir: { type: "string" },
      },
      required: ["file_path"],
    },
  },
  {
    name: "replace_hwp_text",
    description:
      "Find and replace text in an HWPX file. v0.2: only .hwpx is supported as input/output. Args: file_path, old_text, new_text, output_path (optional).",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        old_text: { type: "string" },
        new_text: { type: "string" },
        output_path: { type: "string" },
      },
      required: ["file_path", "old_text", "new_text"],
    },
  },
  {
    name: "fill_hwp_template",
    description:
      "Fill multiple placeholders in an HWPX template. `replacements` is a JSON object string, e.g. {\"{{name}}\":\"Kim\",\"{{company}}\":\"Acme\"}. v0.2: .hwpx only. Args: file_path, replacements, output_path (optional).",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        replacements: { type: "string" },
        output_path: { type: "string" },
      },
      required: ["file_path", "replacements"],
    },
  },
  {
    name: "get_hwp_info",
    description:
      "Get document metadata (version, page count, section count, fonts used, totals for tables/images/footnotes/equations/headers/footers). Args: file_path.",
    inputSchema: {
      type: "object",
      properties: { file_path: { type: "string" } },
      required: ["file_path"],
    },
  },
  {
    name: "get_hwp_field_value",
    description:
      "Get a Hancom field's current value by name. Args: file_path, name.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        name: { type: "string" },
      },
      required: ["file_path", "name"],
    },
  },
  {
    name: "list_hwp_fields",
    description:
      "List Hancom-style fields (`<hp:fldBegin>`/end pairs) in the document, with name and type when available. Useful before fill_hwp_template. Args: file_path.",
    inputSchema: {
      type: "object",
      properties: { file_path: { type: "string" } },
      required: ["file_path"],
    },
  },
  {
    name: "list_hwp_bindata",
    description:
      "List ZIP entries under BinData/ inside an .hwpx (image and binary attachments). Useful before replace_hwp_image. Args: file_path.",
    inputSchema: {
      type: "object",
      properties: { file_path: { type: "string" } },
      required: ["file_path"],
    },
  },
  {
    name: "replace_hwp_image",
    description:
      "Replace an embedded image inside an .hwpx by overwriting its BinData/ ZIP entry with new file contents. `target` accepts either basename ('image1.bmp') or full entry path ('BinData/image1.bmp'). Args: file_path, target, source_path, output_path (optional).",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        target: { type: "string" },
        source_path: { type: "string" },
        output_path: { type: "string" },
      },
      required: ["file_path", "target", "source_path"],
    },
  },
  {
    name: "render_hwp_page",
    description:
      "Render a single page of an HWP/HWPX document as SVG. If output_path is omitted, the raw SVG string is returned inline (useful for direct LLM consumption). Args: file_path, page (0-based, default 0), output_path (optional).",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        page: { type: "number" },
        output_path: { type: "string" },
      },
      required: ["file_path"],
    },
  },
  {
    name: "render_hwp_all_pages",
    description:
      "Render every page of an HWP/HWPX as SVG files in a directory. Args: file_path, output_dir (default <file>_pages/), max_pages (optional limit).",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        output_dir: { type: "string" },
        max_pages: { type: "number" },
      },
      required: ["file_path"],
    },
  },
  {
    name: "append_hwp_paragraph",
    description:
      "Append a new paragraph to the end of an .hwpx document body. Clones the last paragraph's structure (paraPr/charPr/style refs) and replaces text. Args: file_path, text, output_path (optional).",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        text: { type: "string" },
        output_path: { type: "string" },
      },
      required: ["file_path", "text"],
    },
  },
  {
    name: "delete_hwp_paragraph",
    description:
      "Delete the Nth paragraph (0-based) from an .hwpx body. Args: file_path, index, output_path (optional).",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        index: { type: "number" },
        output_path: { type: "string" },
      },
      required: ["file_path", "index"],
    },
  },
  {
    name: "append_hwp_table_row",
    description:
      "Append a new row to the Nth table (0-based) in an .hwpx. `cells` is a JSON string array of cell texts (length should match table column count). Args: file_path, table_index, cells, output_path (optional).",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        table_index: { type: "number" },
        cells: { type: "string" },
        output_path: { type: "string" },
      },
      required: ["file_path", "table_index", "cells"],
    },
  },
  {
    name: "delete_hwp_table_row",
    description:
      "Delete the Mth row (0-based) from the Nth table (0-based) in an .hwpx. Args: file_path, table_index, row_index, output_path (optional).",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        table_index: { type: "number" },
        row_index: { type: "number" },
        output_path: { type: "string" },
      },
      required: ["file_path", "table_index", "row_index"],
    },
  },
  {
    name: "set_hwp_paragraph_text",
    description:
      "Replace the entire text of the Nth paragraph (0-based) in an .hwpx body with new text. The paragraph attributes (paraPr/style refs) are preserved; runs are collapsed into a single <hp:run> with the new text. Args: file_path, index, text, output_path (optional).",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        index: { type: "number" },
        text: { type: "string" },
        output_path: { type: "string" },
      },
      required: ["file_path", "index", "text"],
    },
  },
  {
    name: "set_hwp_cell_text",
    description:
      "Replace a single cell's text in a table inside an .hwpx. Args: file_path, table_index, row, col (all 0-based), text, output_path (optional).",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        table_index: { type: "number" },
        row: { type: "number" },
        col: { type: "number" },
        text: { type: "string" },
        output_path: { type: "string" },
      },
      required: ["file_path", "table_index", "row", "col", "text"],
    },
  },
  {
    name: "set_hwp_field_value",
    description:
      "Set a Hancom field's value by name in an .hwpx (writes the new text between the matching `<hp:fldBegin name=...>` and `<hp:fldEnd>`). Use list_hwp_fields first to discover names. Args: file_path, name, value, output_path (optional).",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        name: { type: "string" },
        value: { type: "string" },
        output_path: { type: "string" },
      },
      required: ["file_path", "name", "value"],
    },
  },
  {
    name: "delete_hwp_image",
    description:
      "Delete a BinData/ ZIP entry inside an .hwpx (effectively removes the embedded image bytes). Args: file_path, target (basename or full entry), output_path (optional).",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        target: { type: "string" },
        output_path: { type: "string" },
      },
      required: ["file_path", "target"],
    },
  },
  {
    name: "render_hwp_html",
    description:
      "Render a single page of an HWP/HWPX as HTML. Useful for AI consumption when SVG isn't ideal. Args: file_path, page (0-based, default 0), output_path (optional).",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        page: { type: "number" },
        output_path: { type: "string" },
      },
      required: ["file_path"],
    },
  },
  {
    name: "render_hwp_equation_svg",
    description:
      "Render an OWPML equation script (e.g. 'TIMES LEFT ( {a} over {b} RIGHT )') to SVG. Args: script, font_size (HWP units, default 1300), color (default 0).",
    inputSchema: {
      type: "object",
      properties: {
        script: { type: "string" },
        font_size: { type: "number" },
        color: { type: "number" },
      },
      required: ["script"],
    },
  },
  {
    name: "create_hwpx_document",
    description:
      "Create a new .hwpx file from a JSON content list of {type:'text',text} items. Tables (type:'table',headers,rows) are rendered as flat text rows in v0.2. Args: output_path (must end with .hwpx), content (JSON string of items).",
    inputSchema: {
      type: "object",
      properties: {
        output_path: { type: "string" },
        content: { type: "string" },
      },
      required: ["output_path", "content"],
    },
  },
];

const HANDLERS: Record<string, (args: any) => Promise<string>> = {
  read_hwp: readHwp,
  read_hwp_text: readHwpText,
  read_hwp_tables: readHwpTables,
  list_hwp_images: listHwpImages,
  extract_hwp_images: extractHwpImages,
  replace_hwp_text: replaceHwpText,
  fill_hwp_template: fillHwpTemplate,
  create_hwpx_document: createHwpxDocument,
  render_hwp_page: renderHwpPage,
  render_hwp_all_pages: renderHwpAllPages,
  get_hwp_info: getHwpInfo,
  list_hwp_fields: listHwpFields,
  get_hwp_field_value: getHwpFieldValue,
  list_hwp_bindata: listHwpBinData,
  replace_hwp_image: replaceHwpImage,
  append_hwp_paragraph: appendHwpParagraph,
  delete_hwp_paragraph: deleteHwpParagraph,
  append_hwp_table_row: appendHwpTableRow,
  delete_hwp_table_row: deleteHwpTableRow,
  set_hwp_paragraph_text: setHwpParagraphText,
  set_hwp_cell_text: setHwpCellText,
  set_hwp_field_value: setHwpFieldValue,
  delete_hwp_image: deleteHwpImage,
  render_hwp_html: renderHwpHtml,
  render_hwp_equation_svg: renderHwpEquationSvg,
};

export function buildServer(): Server {
  const server = new Server(
    { name: "hwp-mcp", version: "0.2.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const handler = HANDLERS[req.params.name];
    if (!handler) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }],
        isError: true,
      };
    }
    try {
      const text = await handler(req.params.arguments ?? {});
      return { content: [{ type: "text", text }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `오류 (error): ${(e as Error).message}` }],
        isError: true,
      };
    }
  });

  return server;
}

export async function runServer(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runServer().catch((e) => {
    process.stderr.write(`fatal: ${e?.message ?? e}\n`);
    process.exit(1);
  });
}
