# Docker Explained - Complete Beginner's Guide

## Table of Contents
1. [What is Docker?](#what-is-docker)
2. [Key Concepts](#key-concepts)
3. [Dockerfile Syntax Basics](#dockerfile-syntax-basics)
4. [Your Dockerfile Explained Line-by-Line](#your-dockerfile-explained-line-by-line)
5. [How Railway Uses This](#how-railway-uses-this)

---

## What is Docker?

**Docker** is a tool that packages your application and everything it needs (code, dependencies, runtime) into a **container** - think of it like a lightweight, portable virtual machine.

### Why Docker?

**Without Docker:**
- "Works on my machine" problem
- Different Node.js versions on different servers
- Manual setup: install Node, install packages, configure environment
- Hard to replicate exact environment

**With Docker:**
- Package everything once
- Runs the same everywhere (your laptop, Railway, AWS, anywhere)
- One command to run your app
- Reproducible builds

### Real-world analogy:

**Shipping containers** revolutionized shipping - same container works on trucks, trains, ships.

**Docker containers** do the same for software - same container runs on your laptop, Railway, cloud servers.

---

## Key Concepts

### 1. **Image**
A blueprint/template for your application.
- Like a recipe or class definition
- Read-only
- Contains: OS, code, dependencies, config
- Example: `node:22-alpine` is an image with Node.js 22 on Alpine Linux

### 2. **Container**
A running instance of an image.
- Like an object created from a class
- Isolated environment
- Can read/write (but changes are lost when container stops, unless you use volumes)
- Example: Your MCP server running in Railway is a container

### 3. **Dockerfile**
A text file with instructions to build an image.
- Like a build script
- Each line is a command
- Docker reads this top-to-bottom

### 4. **Layer**
Each Dockerfile instruction creates a layer.
- Layers are cached
- If nothing changes, Docker reuses the cached layer (fast!)
- Layers stack on top of each other

### 5. **Multi-stage Build**
Use multiple `FROM` statements to create multiple stages.
- Build stage: compile code, install dev tools
- Runtime stage: only production code
- Result: smaller, cleaner final image

---

## Dockerfile Syntax Basics

### Command Format
```dockerfile
INSTRUCTION arguments
```

### Common Instructions

| Instruction | Purpose | Example |
|------------|---------|---------|
| `FROM` | Set base image | `FROM node:22-alpine` |
| `RUN` | Execute command during build | `RUN npm install` |
| `COPY` | Copy files from host to image | `COPY package.json ./` |
| `WORKDIR` | Set working directory | `WORKDIR /app` |
| `ENV` | Set environment variable | `ENV NODE_ENV=production` |
| `EXPOSE` | Document which port app uses | `EXPOSE 3100` |
| `CMD` | Default command when container starts | `CMD ["node", "index.js"]` |
| `ENTRYPOINT` | Command that always runs | `ENTRYPOINT ["tini", "--"]` |
| `USER` | Set user for running commands | `USER appuser` |
| `HEALTHCHECK` | Test if container is healthy | `HEALTHCHECK CMD wget ...` |

---

## Your Dockerfile Explained Line-by-Line

### 🏗️ STAGE 1: BUILDER (Lines 1-14)

---

#### Line 1:
```dockerfile
FROM node:22-alpine AS builder
```

**Breakdown:**
- `FROM` - Start with a base image
- `node:22-alpine` - The base image name
  - `node` = Official Node.js image
  - `22` = Node.js version 22
  - `alpine` = Alpine Linux (tiny Linux distribution, ~5MB vs ~100MB for Ubuntu)
  - Think: "Give me Node.js 22 on the smallest Linux available"
- `AS builder` - Name this stage "builder" (for multi-stage build)

**What happens:** Docker downloads the Node.js 22 Alpine image if you don't have it

---

#### Line 3:
```dockerfile
RUN corepack enable && corepack prepare pnpm@latest --activate
```

**Breakdown:**
- `RUN` - Execute this command during image build
- `corepack` - A tool that comes with Node.js (v16.9+) for managing package managers
  - Manages: npm, yarn, pnpm
  - Think: "Package manager manager"
- `corepack enable` - Activate corepack
- `&&` - Shell operator meaning "and then" (run next command only if first succeeds)
- `corepack prepare pnpm@latest --activate` - Install and activate latest pnpm
- `pnpm` - Fast, disk-efficient package manager (alternative to npm)
  - Uses symlinks to share packages between projects
  - Saves disk space and time

**What happens:** Sets up pnpm so you can use it in next commands

---

#### Line 5:
```dockerfile
WORKDIR /app
```

**Breakdown:**
- `WORKDIR` - Set the working directory (like `cd /app`)
- `/app` - Directory path inside the container

**What happens:**
- Creates `/app` directory if it doesn't exist
- All subsequent commands run from `/app`
- Like running `mkdir -p /app && cd /app`

---

#### Line 7:
```dockerfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
```

**Breakdown:**
- `COPY` - Copy files from your computer (host) to the image
- `package.json pnpm-lock.yaml pnpm-workspace.yaml` - Source files (from your project)
  - `package.json` - Lists your dependencies
  - `pnpm-lock.yaml` - Locks exact versions of dependencies
  - `pnpm-workspace.yaml` - pnpm workspace configuration
- `./` - Destination (current directory = `/app`)

**Why copy these FIRST before other files?**
- **Docker layer caching!**
- Package files rarely change
- If they haven't changed, Docker reuses cached `pnpm install` layer
- Saves TONS of time on rebuilds

---

#### Line 8:
```dockerfile
RUN pnpm install --frozen-lockfile
```

**Breakdown:**
- `RUN pnpm install` - Install dependencies from package.json
- `--frozen-lockfile` - Don't update pnpm-lock.yaml
  - Uses EXACT versions from lockfile
  - Ensures reproducible builds
  - Build fails if package.json and lockfile don't match

**What happens:**
- Downloads and installs all packages to `node_modules/`
- This layer is cached until package files change

---

#### Line 10-11:
```dockerfile
COPY tsconfig.json ./
COPY src/ ./src/
```

**Breakdown:**
- Copy TypeScript config and source code
- `tsconfig.json` - TypeScript compiler configuration
- `src/` - Your source code directory
- `./src/` - Destination inside container

**Why AFTER installing dependencies?**
- Source code changes frequently
- Dependencies change rarely
- Copying them separately = better cache utilization

---

#### Line 12:
```dockerfile
RUN pnpm build
```

**Breakdown:**
- Runs the `build` script from your package.json
- Typically: `tsc` (TypeScript compiler)
- Compiles TypeScript (`.ts`) → JavaScript (`.js`)
- Output goes to `dist/` directory

**What happens:** Your app is now compiled and ready to run

---

#### Line 14:
```dockerfile
RUN pnpm prune --prod
```

**Breakdown:**
- `pnpm prune` - Remove unnecessary packages
- `--prod` - Keep only production dependencies, remove dev dependencies
  - Dev deps: TypeScript, testing tools, linters (only needed for building)
  - Prod deps: Actual runtime libraries your app needs

**What happens:** `node_modules/` gets smaller (faster deploys, smaller image)

---

### 🚀 STAGE 2: RUNTIME (Lines 18-41)

---

#### Line 18:
```dockerfile
FROM node:22-alpine
```

**Breakdown:**
- **New `FROM`** = Start a completely fresh image
- All previous stage (builder) is discarded
- We'll selectively copy only what we need from builder

**Why start fresh?**
- Builder stage has: TypeScript compiler, dev tools, source code, build cache
- Runtime doesn't need any of that!
- Result: Much smaller final image

---

#### Line 20:
```dockerfile
RUN apk add --no-cache tini
```

**Breakdown:**
- `apk` - Alpine Package Keeper (Alpine's package manager)
  - Like `apt` on Ubuntu or `yum` on CentOS
- `add` - Install a package
- `--no-cache` - Don't save package index (saves space)
- `tini` - A tiny init system for containers

**What is tini?**
- Handles process signals properly (SIGTERM, SIGINT)
- Prevents zombie processes
- Ensures graceful shutdowns
- Think: "Proper process babysitter"

**Why needed?**
- Docker containers should have PID 1 be an init system
- Node.js doesn't handle signals well as PID 1
- tini solves this problem (only ~30KB)

---

#### Line 22:
```dockerfile
WORKDIR /app
```

Same as before - set working directory to `/app`

---

#### Line 24:
```dockerfile
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
```

**Breakdown:**
- `addgroup` - Create a user group (Alpine command)
- `-S` - System group (no password, can't login)
- `appgroup` - Group name
- `&&` - And then...
- `adduser` - Create a user
- `-S` - System user
- `appuser` - Username
- `-G appgroup` - Add user to appgroup

**Why create a user?**
- **Security!**
- By default, containers run as `root` (user ID 0)
- If attacker breaks into container, they have root privileges
- Running as non-root limits damage
- Best practice: Always run apps as non-root user

---

#### Lines 26-28:
```dockerfile
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
```

**Breakdown:**
- `COPY --from=builder` - Copy from the builder stage (not from host!)
- `/app/dist` - Source (in builder stage)
- `./dist` - Destination (in current stage)

**What's being copied:**
- `dist/` - Compiled JavaScript code
- `node_modules/` - Production dependencies only
- `package.json` - Package metadata

**What's NOT copied (left behind in builder):**
- `src/` - TypeScript source code (don't need it anymore)
- `tsconfig.json` - TypeScript config
- Dev dependencies
- Build cache

**Result:** Clean, minimal runtime image

---

#### Line 30:
```dockerfile
USER appuser
```

**Breakdown:**
- `USER` - Switch to a different user
- `appuser` - The non-root user we created earlier

**What happens:**
- All subsequent commands run as `appuser`
- When container starts, app runs as `appuser` (not root)
- Security win!

---

#### Lines 32-33:
```dockerfile
ENV NODE_ENV=production
ENV PORT=3100
```

**Breakdown:**
- `ENV` - Set environment variable
- `NODE_ENV=production` - Tells Node.js to run in production mode
  - Disables dev features
  - Better performance
  - Less verbose logging
- `PORT=3100` - Your app listens on port 3100

**What happens:** These variables are available when your app runs

---

#### Line 35:
```dockerfile
EXPOSE 3100
```

**Breakdown:**
- `EXPOSE` - Document which port the container uses
- `3100` - Port number

**IMPORTANT:**
- This does NOT actually open/publish the port!
- It's just documentation
- Railway/Docker needs to explicitly map ports: `-p 3100:3100`

---

#### Lines 37-38:
```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3100/health || exit 1
```

**Breakdown:**
- `HEALTHCHECK` - Define how to check if container is healthy
- `--interval=30s` - Check every 30 seconds
- `--timeout=5s` - Each check times out after 5 seconds
- `--start-period=10s` - Wait 10s before first check (gives app time to start)
- `--retries=3` - Mark unhealthy after 3 consecutive failures
- `CMD` - The actual health check command
- `wget -qO- http://localhost:3100/health` - HTTP request to `/health` endpoint
  - `wget` - Download tool (like curl)
  - `-q` - Quiet (no output)
  - `-O-` - Output to stdout (not a file)
- `|| exit 1` - If wget fails, exit with status 1 (unhealthy)

**What happens:**
- Every 30s, Docker hits your `/health` endpoint
- If it returns 200 OK → healthy ✅
- If it fails 3 times → unhealthy ❌
- Railway can auto-restart unhealthy containers

---

#### Line 40:
```dockerfile
ENTRYPOINT ["tini", "--"]
```

**Breakdown:**
- `ENTRYPOINT` - Command that ALWAYS runs (can't be overridden easily)
- `["tini", "--"]` - JSON array format
  - `tini` - The init system we installed
  - `--` - Separator (everything after this is passed to next command)

**What happens:**
- Container starts tini as PID 1
- tini then starts your app (from CMD)

---

#### Line 41:
```dockerfile
CMD ["node", "dist/index.js"]
```

**Breakdown:**
- `CMD` - Default command when container starts
- `["node", "dist/index.js"]` - JSON array format
  - `node` - Node.js runtime
  - `dist/index.js` - Your compiled app entry point

**What happens:**
- tini starts → tini starts `node dist/index.js`
- Your MCP server begins running

**ENTRYPOINT vs CMD:**
- `ENTRYPOINT` = The wrapper (tini)
- `CMD` = The actual app command
- Combined: `tini -- node dist/index.js`

---

## How Railway Uses This

### 1. **Detect Dockerfile**
Railway scans your repo, finds `Dockerfile`

### 2. **Build Image**
```bash
docker build -t mcp-server:latest .
```

**What happens:**
- Reads Dockerfile line by line
- Executes each instruction
- Creates layers
- Caches layers for faster rebuilds
- Final image tagged as `mcp-server:latest`

### 3. **Run Container**
```bash
docker run -d -p 3100:3100 mcp-server:latest
```

**Breakdown:**
- `docker run` - Start a container
- `-d` - Detached mode (run in background)
- `-p 3100:3100` - Map port 3100 (host) → 3100 (container)
  - Format: `host_port:container_port`
- `mcp-server:latest` - Image to run

### 4. **Monitor Health**
- Runs healthcheck every 30s
- Restarts container if unhealthy

### 5. **Expose to Internet**
- Railway assigns a public URL
- Routes traffic to your container's port 3100

---

## Visualizing the Build

```
┌─────────────────────────────────────────┐
│  STAGE 1: BUILDER                       │
├─────────────────────────────────────────┤
│  node:22-alpine                         │
│  + pnpm                                 │
│  + dependencies (dev + prod)            │
│  + TypeScript compiler                  │
│  + Your source code (src/)              │
│  ↓ Compile                              │
│  + Compiled code (dist/)                │
│  ↓ Prune dev dependencies               │
│  + Only prod dependencies left          │
└─────────────────────────────────────────┘
              ↓ (copy only what we need)
┌─────────────────────────────────────────┐
│  STAGE 2: RUNTIME                       │
├─────────────────────────────────────────┤
│  node:22-alpine (fresh)                 │
│  + tini                                 │
│  + Non-root user (appuser)              │
│  + dist/ (from builder)                 │
│  + node_modules/ (prod only, from builder) │
│  + package.json (from builder)          │
│  ↓ Run as appuser                       │
│  node dist/index.js                     │
└─────────────────────────────────────────┘
```

---

## Common Terms Glossary

| Term | Meaning |
|------|---------|
| **Alpine** | Tiny Linux distro (~5MB), popular for containers |
| **apk** | Alpine Package Keeper (package manager) |
| **corepack** | Node.js tool to manage npm/yarn/pnpm |
| **tini** | Minimal init system for containers (handles signals) |
| **pnpm** | Fast, space-efficient package manager |
| **frozen-lockfile** | Don't modify lockfile, use exact versions |
| **prune** | Remove unnecessary packages |
| **PID 1** | Process ID 1 (first process in system/container) |
| **SIGTERM/SIGINT** | Unix signals for graceful shutdown |
| **zombie process** | Dead process that hasn't been cleaned up |
| **layer** | Cached step in Docker build |
| **multi-stage** | Multiple FROM statements, copy between stages |

---

## Why This Dockerfile is Well-Written

✅ **Multi-stage build** - Small final image (only runtime code)
✅ **Layer caching** - Fast rebuilds (package.json copied first)
✅ **Security** - Non-root user
✅ **Alpine** - Minimal base image
✅ **Health checks** - Auto-restart if unhealthy
✅ **Proper init** - tini handles signals correctly
✅ **Production-ready** - Only prod dependencies
✅ **Reproducible** - Frozen lockfile

---

## Next Steps to Learn More

1. **Try building locally:**
   ```bash
   docker build -t my-mcp-server .
   docker run -p 3100:3100 my-mcp-server
   ```

2. **Experiment:**
   - Add a new dependency → rebuild → see layer caching
   - Change source code → rebuild → faster (package layer cached)
   - Remove multi-stage → compare image sizes

3. **Learn Docker CLI:**
   - `docker images` - List images
   - `docker ps` - List running containers
   - `docker logs <container>` - View logs
   - `docker exec -it <container> sh` - Get shell inside container

---

**Questions?** Ask about any specific part!
