import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import type { SessionConfig } from "./lib/types.js";
import { extractSessionConfigFromHeaders } from "./lib/session-config.js";
import { createMcpServer } from "./server.js";

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  config: SessionConfig;
}

const sessions = new Map<string, SessionEntry>();

function cleanupSession(sessionId: string) {
  const entry = sessions.get(sessionId);
  if (!entry) return;
  sessions.delete(sessionId);
  entry.transport.close().catch(() => {});
  entry.server.close().catch(() => {});
}

function startHttpServer() {
  const app = express();

  app.use(express.json());
  app.use(
    cors({
      exposedHeaders: ["Mcp-Session-Id"],
    })
  );

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      uptime: process.uptime(),
      activeSessions: sessions.size,
      memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    });
  });

  app.post("/mcp", async (req, res) => {
    // StreamableHTTPServerTransport is strict about Accept. Some clients send
    // Accept: */* on POST. Treat that as supporting the required types.
    const accept = req.headers.accept;
    if (!accept || accept === "*/*") {
      req.headers.accept = "application/json, text/event-stream";
    }

    const existingSessionId = req.headers["mcp-session-id"] as
      | string
      | undefined;

    if (existingSessionId) {
      const entry = sessions.get(existingSessionId);
      if (!entry) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      await entry.transport.handleRequest(req, res, req.body);
      return;
    }

    const body = req.body;
    if (!body || !isInitializeRequest(body)) {
      res
        .status(400)
        .json({ error: "Missing Mcp-Session-Id header for non-init request" });
      return;
    }

    const config = extractSessionConfigFromHeaders(
      req.headers as Record<string, string | string[] | undefined>
    );

    const server = createMcpServer(config);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (sessionId: string) => {
        sessions.set(sessionId, { transport, server, config });
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) cleanupSession(transport.sessionId);
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get("/mcp", async (req, res) => {
    const accept = req.headers.accept;
    if (!accept || accept === "*/*") {
      req.headers.accept = "text/event-stream";
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId) {
      res.status(400).json({ error: "Missing Mcp-Session-Id header" });
      return;
    }

    const entry = sessions.get(sessionId);
    if (!entry) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    await entry.transport.handleRequest(req, res);
  });

  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId) {
      res.status(400).json({ error: "Missing Mcp-Session-Id header" });
      return;
    }

    const entry = sessions.get(sessionId);
    if (!entry) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    await entry.transport.handleRequest(req, res);
    cleanupSession(sessionId);
  });

  const PORT = parseInt(process.env.PORT || "3100", 10);

  const httpServer = app.listen(PORT, () => {
    console.log(`remake-mcp listening on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });

  async function shutdown(signal: string) {
    console.log(`\n${signal} received - shutting down...`);

    httpServer.close();

    const cleanups = Array.from(sessions.keys()).map((id) => {
      const entry = sessions.get(id);
      sessions.delete(id);
      if (!entry) return Promise.resolve();
      return Promise.allSettled([entry.transport.close(), entry.server.close()]);
    });

    await Promise.allSettled(cleanups);
    console.log("Shutdown complete.");
    process.exit(0);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

async function startStdioServer() {
  const config = extractSessionConfigFromHeaders(undefined);
  const server = createMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function main() {
  const mode = (process.env.MCP_TRANSPORT || "http").toLowerCase();
  if (mode === "stdio") {
    await startStdioServer();
    return;
  }

  startHttpServer();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

