# MCP Server - OpenAPI & Redmine Tools

A Model Context Protocol (MCP) server providing tools for OpenAPI/Swagger documentation search and Redmine issue management.

## 🚀 Quick Start

### Local Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run
pnpm start
```

Server runs on `http://localhost:3100`

### Test Health Endpoint

```bash
curl http://localhost:3100/health
```

## 🛠️ Features

### Transport Type: HTTP (Not Stdio)
- ✅ **HTTP REST API** with Express.js
- ✅ **StreamableHTTPServerTransport** from MCP SDK
- ✅ **Server-Sent Events (SSE)** for server-to-client notifications
- ✅ **Multi-user session management** via `Mcp-Session-Id` header
- ❌ **NOT stdio-based** (doesn't use stdin/stdout)

### Tools Provided

#### 1. OpenAPI Search (`openapi_searchEndpoints`)
Search through OpenAPI/Swagger documentation for API endpoints.

**Configuration:** Pass `OPENAPI-JSON` header with URL to OpenAPI JSON

**Example:**
```bash
curl -X POST http://localhost:3100/mcp \
  -H "Content-Type: application/json" \
  -H "OPENAPI-JSON: https://petstore3.swagger.io/api/v3/openapi.json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

#### 2. Redmine Issue Fetcher (`redmine_getIssue`)
Fetch Redmine issues with attachments and custom fields.

**Configuration:** Pass these headers:
- `REDMINE-URL`: Your Redmine instance URL
- `REDMINE-API`: Your Redmine API key
- `REDMINE-PROJECT`: Project ID to scope issues

## 📡 API Endpoints

### Health Check
```
GET /health
```

Returns server status, uptime, active sessions, memory usage.
Returns server status, uptime, memory usage.

### MCP Protocol
```
POST /mcp       # JSON-RPC messages (initialize, tools/list, tools/call, etc.)
GET /mcp        # Optional SSE stream (client-dependent)
```

This server is **sessionless**. Clients do not need to store or send `Mcp-Session-Id`.

## 🏗️ Architecture

### Session Management
This server is sessionless and does not store per-client state.

### Multi-User Support
Multiple concurrent users supported. Configuration is passed via HTTP headers per request.

## 🌐 Deployment

Choose your platform:
- **Railway** - $5/month, easiest deployment
- **Koyeb** - Free forever, good DX
- **Oracle Cloud** - Free forever, maximum resources, manual setup

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed guides.

## 🔧 Configuration

### Environment Variables
```bash
PORT=3100              # Server port (default: 3100)
NODE_ENV=production    # Environment
```

### Per-Session Configuration (via HTTP headers)
```
REDMINE-API: <your-api-key>
REDMINE-URL: https://redmine.example.com
REDMINE-PROJECT: <project-id>
OPENAPI-JSON: https://api.example.com/openapi.json
```

## 📦 Dependencies

- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `express` - HTTP server
- `cors` - CORS middleware
- `sharp` - Image processing (for Redmine attachments)
- `zod` - Schema validation

## 🐳 Docker

```bash
# Build
docker build -t mcp-server .

# Run
docker run -p 3100:3100 mcp-server

# Test
curl http://localhost:3100/health
```

## 🧪 Testing

```bash
# 1. Start server
pnpm start

# 2. Initialize session with OpenAPI config
curl -X POST http://localhost:3100/mcp \
  -H "Content-Type: application/json" \
  -H "OPENAPI-JSON: https://petstore3.swagger.io/api/v3/openapi.json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "test-client", "version": "1.0.0"}
    }
  }' -i

# 3. List available tools
curl -X POST http://localhost:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list"
  }'

# 4. Call OpenAPI search tool
curl -X POST http://localhost:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "openapi_searchEndpoints",
      "arguments": {"path": "/pet"}
    }
  }'
```

## 📝 License

MIT

## 🤝 Contributing

Issues and PRs welcome!

## 📚 Resources

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/sdk)
- [Express.js](https://expressjs.com/)
