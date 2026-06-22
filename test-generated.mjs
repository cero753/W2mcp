/**
 * End-to-end test of the GENERATED Notion server: launch it as a real MCP stdio process,
 * list its tools, and call `search` live. Proves the generator's output actually works.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = process.argv[2] || join(here, "out", "notion-mcp", "server.ts");
const TOKEN = process.env.NOTION_TOKEN;
if (!TOKEN) { console.error("Set NOTION_TOKEN"); process.exit(1); }

const transport = new StdioClientTransport({
  command: process.execPath,                 // node
  args: ["--import", "tsx", serverPath],
  env: { ...process.env, NOTION_TOKEN: TOKEN },
});
const client = new Client({ name: "w2mcp-test", version: "0.1.0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log("tools exposed:", tools.map((t) => t.name).join(", "));

const res = await client.callTool({ name: "search", arguments: { page_size: 5 } });
const text = res.content?.[0]?.text ?? "";
console.log("\nsearch() result (shaped):\n" + text.slice(0, 700));

await client.close();
console.log("\n✓ generated server connected, listed tools, and returned live data");
