import express from "express";
import cors from "cors";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { extractRequestConfigFromHeaders } from "./lib/request-config.js";
import { createMcpServer } from "./server.js";

function startHttpServer() {
  const app = express();

  app.use(express.json());
  app.use(
    cors({
      // Sessionless transport; no custom exposed headers required.
      exposedHeaders: [],
    })
  );

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      uptime: process.uptime(),
      memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    });
  });

  // Sessionless MCP endpoint (Context7-style): the client does not need to
  // store or send Mcp-Session-Id. All per-request config comes from headers.
  app.all("/mcp", async (req, res) => {
    // StreamableHTTPServerTransport is strict about Accept. Some clients send
    // Accept: */* on POST. Treat that as supporting the required types.
    const accept = req.headers.accept;
    if (!accept || accept === "*/*") {
      req.headers.accept =
        req.method === "GET" ? "text/event-stream" : "application/json, text/event-stream";
    }

    // Defaults come from env; per-request overrides are extracted inside tools from request headers.
    const defaults = extractRequestConfigFromHeaders(undefined);
    const server: McpServer = createMcpServer(defaults);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const PORT = parseInt(process.env.PORT || "3100", 10);

  const httpServer = app.listen(PORT, () => {
    console.log(`remake-mcp listening on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });

  async function shutdown(signal: string) {
    console.log(`\n${signal} received - shutting down...`);

    httpServer.close();
    console.log("Shutdown complete.");
    process.exit(0);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

async function startStdioServer() {
  const config = extractRequestConfigFromHeaders(undefined);
  const server = createMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function main() {
  if (process.argv.includes("--http")) {
    startHttpServer();
  } else {
    await startStdioServer();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
