import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "./lib/config.js";
import { registerOpenApiTool } from "./tools/openapi.js";
import { registerRedmineTool } from "./tools/redmine.js";

export function createMcpServer(config: Config): McpServer {
  const server = new McpServer({
    name: "remake-mcp",
    version: "0.1.0",
  });

  registerOpenApiTool(server, config);
  registerRedmineTool(server, config);

  return server;
}
