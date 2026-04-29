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
