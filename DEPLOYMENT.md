# Deployment Guide

This MCP server can be deployed to Railway, Koyeb, or Oracle Cloud. All three methods are documented below.

## Prerequisites

- Node.js 20+
- pnpm (or npm)
- Git repository (for Railway/Koyeb)
- Docker (optional, for local testing)

---

## ✅ Verification: HTTP Server (Not Stdio)

This MCP server uses **HTTP transport** via `StreamableHTTPServerTransport`:
- ✅ Express.js server with REST endpoints
- ✅ POST/GET/DELETE `/mcp` endpoints
- ✅ SSE (Server-Sent Events) support
- ✅ Multi-user session management
- ❌ NOT stdio-based (no stdin/stdout communication)

**Key files:**
- `src/index.ts` - HTTP server with session management
- `src/server.ts` - MCP server factory
- `Dockerfile` - Production-ready container

---

## 🚂 Deployment Option 1: Railway ($5/month)

### Step 1: Deploy via GitHub (Recommended)

1. **Push your code to GitHub:**
```bash
git add .
git commit -m "Prepare for Railway deployment"
git push origin main
```

2. **Deploy on Railway:**
   - Go to [railway.app](https://railway.app)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository
   - Railway auto-detects Dockerfile and builds

3. **Configure Environment Variables:**
   - In Railway dashboard → Variables tab
   - Add: `PORT=3100` (Railway auto-injects this, but explicit is better)
   - Optional: Add Redmine/Swagger configs if you want defaults

4. **Get your URL:**
   - Railway generates a URL like: `https://your-app.railway.app`
   - Test: `curl https://your-app.railway.app/health`

---

## 🚀 Deployment Option 2: Koyeb (Free Forever)

### Step 1: Sign Up
- Go to [koyeb.com](https://www.koyeb.com)
- Sign up (no credit card required)
- Connect your GitHub account

### Step 2: Deploy

1. **Push to GitHub**
2. **Create Koyeb App:**
   - Click "Create App"
   - Select "GitHub" deployment
   - Choose your repository
   - Builder: **Docker**
   - Dockerfile path: `./Dockerfile`
   - Exposed port: `3100`
3. **Instance type:** Nano (512MB - free tier)
4. **Deploy** - wait 2-3 minutes

---

## ☁️ Deployment Option 3: Oracle Cloud Always Free

See full Oracle Cloud deployment guide in DEPLOYMENT.md

---

## 🧪 Testing Your Deployed Server

```bash
# Health check
curl https://your-url/health

# Initialize MCP session
curl -X POST https://your-url/mcp \
  -H "Content-Type: application/json" \
  -H "x-swagger-api-json: https://petstore3.swagger.io/api/v3/openapi.json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "test", "version": "1.0.0"}
    }
  }'
```
