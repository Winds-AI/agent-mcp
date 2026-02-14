import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SessionConfig } from "./lib/types.js";
import { registerOpenApiTool } from "./tools/openapi.js";
import { registerRedmineTool } from "./tools/redmine.js";

export function createMcpServer(config: SessionConfig): McpServer {
  const server = new McpServer({
    name: "remake-mcp",
    version: "0.1.0",
  });

  registerOpenApiTool(server, config);
  registerRedmineTool(server, config);

  return server;
}
