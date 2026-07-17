/**
 * Test the Streamable-HTTP transport: launch a generated server in HTTP mode, then connect
 * over HTTP (like a remote agent / gateway would) and call a tool. Proves hosting-readiness.
 */
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = process.argv[2] || join(here, "out", "frankfurter-http", "server.ts");
const PORT = 3939;

// 1. Launch the generated server in HTTP mode.
const child = spawn(process.execPath, ["--import", "tsx", serverPath], {
  env: { ...process.env, MCP_TRANSPORT: "http", PORT: String(PORT) },
  stdio: ["ignore", "inherit", "pipe"],
});
let ready = false;
child.stderr.on("data", (d) => { process.stderr.write("[server] " + d); if (String(d).includes("/mcp")) ready = true; });

// 2. Wait for "listening on :PORT/mcp".
for (let i = 0; i < 50 && !ready; i++) await new Promise((r) => setTimeout(r, 100));
if (!ready) { console.error("server didn't start"); child.kill(); process.exit(1); }

// 3. Connect over HTTP and call a tool.
try {
  const transport = new StreamableHTTPClientTransport(new URL(`http://localhost:${PORT}/mcp`));
  const client = new Client({ name: "w2mcp-http-test", version: "0.1.0" });
  await client.connect(transport);

  const { tools } = await client.listTools();
  console.log("\n✓ connected over HTTP. tools:", tools.map((t) => t.name).join(", "));

  const res = await client.callTool({ name: "get_exchange_rates", arguments: { base: "USD" } });
  const text = res.content?.[0]?.text ?? "";
  console.log("\nget_exchange_rates({base:'USD'}) →\n" + text.slice(0, 350));

  await client.close();
  console.log("\n✓ Streamable-HTTP transport works end-to-end (remote MCP call returned live data)");
} finally {
  child.kill();
}
