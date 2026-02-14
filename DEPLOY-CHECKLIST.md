# Deployment Checklist

Use this checklist to deploy to all three platforms systematically.

## ✅ Pre-Deployment Verification

- [x] Code compiles: `pnpm build` ✅
- [x] It's an HTTP server (not stdio) ✅
- [x] Uses `StreamableHTTPServerTransport` ✅
- [x] Has Dockerfile ✅
- [x] Has `.env.example` ✅
- [x] Has `.gitignore` with `.env` excluded ✅
- [ ] Code committed to Git
- [ ] Pushed to GitHub

```bash
# Verify build works
cd /mnt/s/ReMake_MCP/new/browser-tools-mcp
pnpm install
pnpm build

# Commit and push
git add .
git commit -m "feat: ready for multi-platform deployment"
git push origin main
```

---

## 🚂 Platform 1: Railway ($5/month)

### Setup Steps
- [ ] 1. Go to [railway.app](https://railway.app)
- [ ] 2. Sign up / log in
- [ ] 3. Click "New Project" → "Deploy from GitHub repo"
- [ ] 4. Select your repository: `ReMake_MCP` (or your repo name)
- [ ] 5. Wait for auto-deploy (Railway detects Dockerfile automatically)
- [ ] 6. In Settings → Environment:
  - [ ] Add `PORT=3100` (optional, Railway sets this automatically)
- [ ] 7. In Settings → Networking:
  - [ ] Enable "Public Networking" (generates public URL)
- [ ] 8. Copy your Railway URL (e.g., `https://remake-mcp-production.up.railway.app`)

### Testing
```bash
# Replace <railway-url> with your actual URL
RAILWAY_URL="https://your-app.railway.app"

# Test health
curl $RAILWAY_URL/health

# Test MCP initialize
curl -X POST $RAILWAY_URL/mcp \
  -H "Content-Type: application/json" \
  -H "x-swagger-api-json: https://petstore3.swagger.io/api/v3/openapi.json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "test", "version": "1.0"}
    }
  }' -i | grep -E "Mcp-Session-Id|HTTP"
```

### Monitoring
- [ ] Check deployment logs in Railway dashboard
- [ ] Set up billing alerts (Settings → Usage)
- [ ] Monitor costs (should be ~$5/month for always-on)

**Railway URL:** `________________________________`

---

## 🚀 Platform 2: Koyeb (Free Forever)

### Setup Steps
- [ ] 1. Go to [koyeb.com](https://www.koyeb.com)
- [ ] 2. Sign up (no credit card required)
- [ ] 3. Connect GitHub account
- [ ] 4. Click "Create App"
- [ ] 5. Select "GitHub" as source
- [ ] 6. Choose your repository
- [ ] 7. Configure:
  - [ ] Builder: **Docker**
  - [ ] Dockerfile path: `./Dockerfile`
  - [ ] Port: `3100`
  - [ ] Instance: **Nano** (512MB - free tier)
  - [ ] Regions: Select closest to you
  - [ ] Scaling: **1 instance**
- [ ] 8. Click "Deploy"
- [ ] 9. Wait 2-3 minutes for build + deploy
- [ ] 10. Copy your Koyeb URL (e.g., `https://remake-mcp-yourorg.koyeb.app`)

### Testing
```bash
# Replace <koyeb-url> with your actual URL
KOYEB_URL="https://your-app-yourorg.koyeb.app"

# Test health
curl $KOYEB_URL/health

# Test MCP initialize
curl -X POST $KOYEB_URL/mcp \
  -H "Content-Type: application/json" \
  -H "x-swagger-api-json: https://petstore3.swagger.io/api/v3/openapi.json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "test", "version": "1.0"}
    }
  }' -i | grep -E "Mcp-Session-Id|HTTP"
```

### Monitoring
- [ ] Check deployment logs in Koyeb dashboard
- [ ] Verify free tier usage (should be 0 cost)
- [ ] Check uptime (Monitoring tab)

**Koyeb URL:** `________________________________`

---

## ☁️ Platform 3: Oracle Cloud Always Free

### Phase 1: Account Setup
- [ ] 1. Go to [oracle.com/cloud/free](https://www.oracle.com/cloud/free/)
- [ ] 2. Click "Start for free"
- [ ] 3. Fill in account details
- [ ] 4. **Choose home region** (CANNOT change later!)
  - [ ] Recommended: `us-ashburn-1` (US East) or `eu-frankfurt-1` (Europe)
- [ ] 5. Verify email
- [ ] 6. Add payment method (for verification only, won't be charged)
- [ ] 7. Wait for account approval (can take hours/days)

### Phase 2: Create Compute Instance
- [ ] 1. Log in to Oracle Cloud Console
- [ ] 2. Navigate: Menu → Compute → Instances
- [ ] 3. Click "Create Instance"
- [ ] 4. Configure:
  - [ ] Name: `mcp-server`
  - [ ] Image: **Oracle Linux 8** (or Ubuntu 22.04)
  - [ ] Click "Change Shape"
    - [ ] Shape series: **Ampere** (ARM)
    - [ ] Shape: **VM.Standard.A1.Flex**
    - [ ] OCPUs: **2**
    - [ ] Memory: **12 GB**
  - [ ] Networking: Use default VCN
  - [ ] Add SSH keys:
    - [ ] Generate new key pair (download private key!)
    - [ ] OR upload your public key
  - [ ] Boot volume: 50 GB (default)
- [ ] 5. Click "Create"
- [ ] 6. Wait ~2 minutes
- [ ] 7. **Note Public IP:** `___________________________`

### Phase 3: Configure Firewall (Cloud Level)
- [ ] 1. In instance details, click VCN name
- [ ] 2. Click "Security Lists" → Default Security List
- [ ] 3. Click "Add Ingress Rules"
- [ ] 4. Add Rule #1 (HTTP MCP):
  - [ ] Source CIDR: `0.0.0.0/0`
  - [ ] IP Protocol: `TCP`
  - [ ] Destination Port Range: `3100`
  - [ ] Description: `MCP Server HTTP`
- [ ] 5. Add Rule #2 (Optional - HTTP):
  - [ ] Source CIDR: `0.0.0.0/0`
  - [ ] IP Protocol: `TCP`
  - [ ] Destination Port Range: `80`
  - [ ] Description: `HTTP`
- [ ] 6. Add Rule #3 (Optional - HTTPS):
  - [ ] Source CIDR: `0.0.0.0/0`
  - [ ] IP Protocol: `TCP`
  - [ ] Destination Port Range: `443`
  - [ ] Description: `HTTPS`
- [ ] 7. Click "Add Ingress Rules"

### Phase 4: SSH and Install Dependencies
```bash
# SSH into instance (use your private key path)
ssh -i ~/.ssh/oracle_key opc@<your-public-ip>
# OR for Ubuntu: ssh -i ~/.ssh/oracle_key ubuntu@<your-public-ip>
```

**On the instance, run:**
```bash
# Update system
sudo dnf update -y  # Oracle Linux
# OR
# sudo apt update && sudo apt upgrade -y  # Ubuntu

# Install Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs git  # Oracle Linux
# OR
# curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
# sudo apt install -y nodejs git  # Ubuntu

# Verify Node
node --version  # Should be v20.x

# Install PM2 and pnpm globally
sudo npm install -g pm2 pnpm

# Configure firewall (instance level)
sudo firewall-cmd --permanent --add-port=3100/tcp
sudo firewall-cmd --reload

# Verify firewall
sudo firewall-cmd --list-all
```

- [ ] Node.js installed (v20+)
- [ ] Git installed
- [ ] PM2 installed
- [ ] Firewall configured

### Phase 5: Deploy Application
```bash
# Still on the Oracle Cloud instance

# Clone your repo (replace with your repo URL)
git clone https://github.com/your-username/ReMake_MCP.git
cd ReMake_MCP/new/browser-tools-mcp

# Install dependencies
pnpm install

# Build
pnpm build

# Create .env file (optional)
cat > .env << 'EOF'
PORT=3100
NODE_ENV=production
EOF

# Start with PM2
pm2 start dist/index.js --name mcp-server

# Check status
pm2 status
pm2 logs mcp-server --lines 20

# Save PM2 config
pm2 save

# Setup auto-start on reboot
pm2 startup
# ^ This outputs a command - COPY AND RUN IT
```

- [ ] Repository cloned
- [ ] Dependencies installed
- [ ] Application built
- [ ] PM2 started successfully
- [ ] PM2 auto-startup configured

### Phase 6: Testing
```bash
# From your local machine
ORACLE_IP="<your-public-ip>"

# Test health
curl http://$ORACLE_IP:3100/health

# Test MCP initialize
curl -X POST http://$ORACLE_IP:3100/mcp \
  -H "Content-Type: application/json" \
  -H "x-swagger-api-json: https://petstore3.swagger.io/api/v3/openapi.json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "test", "version": "1.0"}
    }
  }' -i | grep -E "Mcp-Session-Id|HTTP"
```

- [ ] Health endpoint responds
- [ ] MCP initialize works
- [ ] Session ID returned

### Phase 7: (Optional) Nginx + SSL
```bash
# On the Oracle instance

# Install Nginx
sudo dnf install -y nginx  # Oracle Linux
# OR
# sudo apt install -y nginx  # Ubuntu

# Create Nginx config
sudo tee /etc/nginx/conf.d/mcp-server.conf > /dev/null <<'EOF'
server {
    listen 80;
    server_name _;  # Change to your domain if you have one

    location / {
        proxy_pass http://localhost:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # Important for SSE
        proxy_buffering off;
        proxy_cache off;
    }
}
EOF

# Test Nginx config
sudo nginx -t

# Start Nginx
sudo systemctl enable nginx
sudo systemctl start nginx

# Update firewall for HTTP/HTTPS
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

- [ ] Nginx installed
- [ ] Nginx configured
- [ ] Nginx running
- [ ] Accessible via HTTP (port 80)

**Oracle Cloud IP:** `________________________________`

---

## 📊 Deployment Summary

| Platform | URL | Status | Notes |
|----------|-----|--------|-------|
| **Railway** | | ⬜ Not deployed / ✅ Deployed | Cost: $5/month |
| **Koyeb** | | ⬜ Not deployed / ✅ Deployed | Cost: Free |
| **Oracle Cloud** | | ⬜ Not deployed / ✅ Deployed | Cost: Free, IP: _______ |

---

## 🎯 Learning Objectives Completed

After deploying to all three platforms, you will have learned:

- [ ] **Railway**: Modern PaaS deployment, Dockerfile auto-detection, monitoring
- [ ] **Koyeb**: Free-tier PaaS, GitHub integration, container deployment
- [ ] **Oracle Cloud**:
  - [ ] IaaS/VPS management
  - [ ] Linux server administration
  - [ ] SSH access and security
  - [ ] Firewall configuration (cloud + OS level)
  - [ ] PM2 process management
  - [ ] Nginx reverse proxy
  - [ ] Manual deployment workflows

---

## 🔄 Maintenance Commands

### Railway
```bash
# View logs
# Use Railway dashboard → Deployments → View logs

# Redeploy
git push origin main  # Auto-redeploys

# Rollback
# Use Railway dashboard → Deployments → Rollback
```

### Koyeb
```bash
# View logs
# Use Koyeb dashboard → Logs

# Redeploy
git push origin main  # Auto-redeploys

# Restart
# Use Koyeb dashboard → Actions → Restart
```

### Oracle Cloud
```bash
# SSH in
ssh -i ~/.ssh/oracle_key opc@<your-ip>

# View logs
pm2 logs mcp-server

# Restart
pm2 restart mcp-server

# Update code
cd ReMake_MCP/new/browser-tools-mcp
git pull
pnpm install
pnpm build
pm2 restart mcp-server

# Monitor
pm2 monit
htop

# Check system
pm2 status
systemctl status nginx
sudo firewall-cmd --list-all
```

---

## 🎓 Next Steps After Deployment

1. **Compare Performance:**
   - [ ] Test response times: `time curl <url>/health`
   - [ ] Monitor resource usage
   - [ ] Check uptime over 24 hours

2. **Test Multi-User:**
   - [ ] Create 2+ simultaneous sessions
   - [ ] Verify session isolation
   - [ ] Check memory usage with multiple users

3. **Evaluate Platforms:**
   - [ ] Ease of deployment: Which was easiest?
   - [ ] Monitoring/Logging: Which has best observability?
   - [ ] Cost: Is Railway's $5 worth it vs free options?
   - [ ] Control: How much do you value Oracle's full control?

4. **Document Findings:**
   - [ ] Create comparison blog post / notes
   - [ ] Share learnings
   - [ ] Update memory with insights

---

## ✅ Success Criteria

All three deployments are considered successful when:

- [ ] All health endpoints respond: `{"status":"ok",...}`
- [ ] All can initialize MCP sessions
- [ ] All return `Mcp-Session-Id` header
- [ ] All can list tools
- [ ] All can execute OpenAPI search tool
- [ ] No errors in logs

---

**Good luck with your deployments! 🚀**
