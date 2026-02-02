# FreshTrack Pro - DigitalOcean Deployment Guide

This guide covers deploying FreshTrack Pro to DigitalOcean infrastructure, including Droplet provisioning, optional managed PostgreSQL, and DigitalOcean Spaces integration.

> **Not sure if DigitalOcean is right for you?** See the [Deployment Decision Guide](./DEPLOYMENT_DECISION_GUIDE.md) to compare options.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration Options](#configuration-options)
- [Deployment Modes](#deployment-modes)
- [Step-by-Step Deployment](#step-by-step-deployment)
- [Managed PostgreSQL Setup](#managed-postgresql-setup)
- [DigitalOcean Spaces Setup](#digitalocean-spaces-setup)
- [Cost Comparison](#cost-comparison)
- [Networking and Security](#networking-and-security)
- [Troubleshooting](#troubleshooting)
- [Maintenance](#maintenance)

## Overview

FreshTrack Pro can be deployed to DigitalOcean in three primary configurations:

| Mode             | Database              | Storage         | Monthly Cost | Best For                             |
| ---------------- | --------------------- | --------------- | ------------ | ------------------------------------ |
| **Self-Hosted**  | PostgreSQL container  | MinIO container | ~$24-48/mo   | Full control, cost optimization      |
| **Managed DB**   | DO Managed PostgreSQL | MinIO container | ~$54-78/mo   | Automated backups, reduced DB ops    |
| **Full Managed** | DO Managed PostgreSQL | DO Spaces       | ~$59-83/mo   | Minimal ops burden, enterprise-grade |

The deployment script (`deploy-digitalocean.sh`) automates Droplet provisioning and supports all three modes through configuration flags.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    DigitalOcean VPC                          │
│                   10.116.0.0/20                              │
│                                                              │
│  ┌────────────────────┐    ┌──────────────────────────────┐ │
│  │     Droplet        │    │   Managed PostgreSQL         │ │
│  │  (Ubuntu 24.04)    │    │   (optional)                 │ │
│  │  ┌──────────────┐  │    │                              │ │
│  │  │ Caddy (443)  │◄─┼────┤   • Auto-backups daily       │ │
│  │  │   (SSL)      │  │    │   • Point-in-time recovery   │ │
│  │  └──────┬───────┘  │    │   • Connection pooling       │ │
│  │         │          │    │   • Private network access   │ │
│  │  ┌──────▼───────┐  │    │   • 7-day backup retention   │ │
│  │  │   Backend    │──┼────┤                              │ │
│  │  │   (Fastify)  │  │    └──────────────────────────────┘ │
│  │  └──────┬───────┘  │                                      │
│  │         │          │                                      │
│  │  ┌──────▼───────┐  │    ┌──────────────────────────────┐ │
│  │  │  PostgreSQL  │  │    │   DigitalOcean Spaces        │ │
│  │  │  (self-host) │  │    │   (optional)                 │ │
│  │  │  +PgBouncer   │  │    │                              │ │
│  │  └──────┬───────┘  │    │   • 250GB storage            │ │
│  │         │          │    │   • 1TB bandwidth/mo         │ │
│  │  ┌──────▼───────┐  │    │   • CDN included             │ │
│  │  │    Redis     │  │    │   • S3-compatible API        │ │
│  │  └──────────────┘  │    │   • $5/month base            │ │
│  │                    │    │                              │ │
│  │  ┌──────────────┐  │    └──────────────────────────────┘ │
│  │  │    MinIO     │  │                                      │
│  │  │  (self-host) │  │                                      │
│  │  └──────────────┘  │                                      │
│  │                    │                                      │
│  │  ┌──────────────┐  │                                      │
│  │  │  Prometheus  │  │    ┌──────────────────────────────┐ │
│  │  │   + Grafana  │  │    │   Cloud Firewall             │ │
│  │  │   + Loki     │  │    │                              │ │
│  │  └──────────────┘  │    │   • SSH (22) allowed         │ │
│  │                    │    │   • HTTP (80) allowed        │ │
│  │  ┌──────────────┐  │    │   • HTTPS (443) allowed      │ │
│  │  │   UFW        │  │    │   • All outbound allowed     │ │
│  │  │  fail2ban    │  │    │                              │ │
│  │  └──────────────┘  │    └──────────────────────────────┘ │
│  └────────────────────┘                                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Deployment Features

- **Idempotent provisioning**: Safely rerun deployment after failures
- **Automated infrastructure**: VPC, Cloud Firewall, and Droplet setup
- **Cloud-init automation**: Docker installation and security hardening
- **DNS verification**: Prevents Let's Encrypt rate limit exhaustion
- **Health check validation**: Ensures application is running before completion
- **Automatic rollback**: Reverts to previous version on deployment failure
- **Version management**: Keeps 3 previous deployments for quick rollback

## Prerequisites

### 1. DigitalOcean Account

Create an account at [digitalocean.com](https://www.digitalocean.com/).

**Required:**

- API token with read/write permissions
- SSH key added to account
- Payment method configured
- Email address for billing notifications

**Recommended:**

- Enable 2FA for account security
- Set up billing alerts to avoid unexpected charges

### 2. doctl CLI Installation

The `doctl` command-line tool is required for API interaction.

**macOS:**

```bash
brew install doctl
```

**Linux (snap):**

```bash
sudo snap install doctl
```

**Linux (manual):**

```bash
cd ~
wget https://github.com/digitalocean/doctl/releases/download/v1.98.0/doctl-1.98.0-linux-amd64.tar.gz
tar xf doctl-1.98.0-linux-amd64.tar.gz
sudo mv doctl /usr/local/bin
```

**Windows (Chocolatey):**

```powershell
choco install doctl
```

**Authenticate:**

```bash
doctl auth init
# Paste your API token when prompted
```

Verify authentication:

```bash
doctl account get
```

Expected output:

```
Email                       Droplet Limit    Email Verified
your-email@example.com      25               true
```

### 3. SSH Key Setup

If you haven't added an SSH key to DigitalOcean:

```bash
# Generate key (if you don't have one)
ssh-keygen -t ed25519 -C "your-email@example.com"
# Press Enter for default location (~/.ssh/id_ed25519)
# Enter passphrase (recommended) or leave empty

# Add to DigitalOcean
doctl compute ssh-key create my-laptop-key --public-key "$(cat ~/.ssh/id_ed25519.pub)"
```

List available keys:

```bash
doctl compute ssh-key list
```

**Important:** Remember your SSH key name - you'll need it in the deployment configuration.

### 4. API Token

Create at: https://cloud.digitalocean.com/account/api/tokens

**Steps:**

1. Click "Generate New Token"
2. Name: `freshtrack-deployment`
3. Permissions: **Read and Write** (both required)
4. Expiration: Never (or set your preferred expiration)
5. Click "Generate Token"
6. **Copy the token immediately** - it's only shown once

Save the token securely in a password manager.

### 5. External Services

**Required:**

- **Domain name** with DNS management access
- **Stack Auth account** (https://app.stack-auth.com/)
  - Project ID
  - Publishable Key
  - Secret Key

**Optional:**

- **Telnyx account** for SMS notifications
- **Slack/Discord webhook** for deployment notifications

## Quick Start

For experienced users who want to get started immediately:

```bash
# 1. Clone repository
git clone https://github.com/yourusername/freshtrack-pro.git
cd freshtrack-pro

# 2. Copy and configure
cp scripts/deploy.config.example scripts/deploy.config
# Edit deploy.config with your values (see Configuration Options section)

# 3. Deploy to DigitalOcean
./scripts/deploy-digitalocean.sh
```

**Deployment time:**

- First deployment: 8-12 minutes
- Subsequent deployments: 1-3 minutes

The script will:

1. Validate doctl authentication (10 seconds)
2. Create or reuse VPC (20 seconds)
3. Create or reuse Cloud Firewall (20 seconds)
4. Provision Droplet (90 seconds)
5. Wait for cloud-init to complete (3-5 minutes)
6. Deploy application containers (1-2 minutes)
7. Display Droplet IP for DNS configuration

After deployment, configure DNS and access your application.

## Configuration Options

Edit `scripts/deploy.config` with your deployment settings.

### Required Settings

These settings MUST be configured for deployment to work:

```bash
# Domain and SSL
DOMAIN=freshtrackpro.com
ADMIN_EMAIL=admin@freshtrackpro.com

# DigitalOcean API
DO_API_TOKEN=dop_v1_your_token_here
DO_SSH_KEY_NAME=my-laptop-key

# Stack Auth (from app.stack-auth.com)
STACK_AUTH_PROJECT_ID=prj_xxx
STACK_AUTH_PUBLISHABLE_KEY=pk_xxx
STACK_AUTH_SECRET_KEY=sk_xxx

# Database credentials
POSTGRES_PASSWORD=<generate-strong-password>
```

**Generate strong passwords:**

```bash
# Database password
openssl rand -base64 32

# Or use a password manager to generate 32+ character passwords
```

### Optional Settings

```bash
# Droplet configuration
DO_REGION=nyc3                    # Default: nyc3
DO_DROPLET_SIZE=s-2vcpu-4gb       # Default: s-2vcpu-4gb ($24/mo)

# Managed services (see Cost Comparison section)
USE_MANAGED_DB=false              # Use DO Managed PostgreSQL
USE_DO_SPACES=false               # Use DO Spaces instead of MinIO

# Managed database size (if USE_MANAGED_DB=true)
DO_DB_SIZE=db-s-1vcpu-2gb         # Default: $30/mo

# Spaces configuration (if USE_DO_SPACES=true)
DO_SPACES_REGION=nyc3
DO_SPACES_BUCKET=freshtrack-media
DO_SPACES_ACCESS_KEY=xxx
DO_SPACES_SECRET_KEY=xxx

# Deployment settings
VERSION_RETENTION=3               # Keep 3 previous versions
HEALTH_CHECK_TIMEOUT=30           # 30 seconds per retry
HEALTH_CHECK_RETRIES=30           # 30 retries = 15 minutes total

# Notifications
BACKUP_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

### Region Selection

Choose the region closest to your users for minimal latency:

| Region     | Location               | Latency from US East | Monthly Cost |
| ---------- | ---------------------- | -------------------- | ------------ |
| nyc1, nyc3 | New York, USA          | ~5ms                 | Standard     |
| sfo3       | San Francisco, USA     | ~70ms                | Standard     |
| tor1       | Toronto, Canada        | ~15ms                | Standard     |
| lon1       | London, UK             | ~80ms                | Standard     |
| fra1       | Frankfurt, Germany     | ~90ms                | Standard     |
| ams3       | Amsterdam, Netherlands | ~85ms                | Standard     |
| sgp1       | Singapore              | ~230ms               | Standard     |
| blr1       | Bangalore, India       | ~250ms               | Standard     |
| syd1       | Sydney, Australia      | ~200ms               | Standard     |

**Recommendation:**

- North America: `nyc3` (New York) or `sfo3` (San Francisco)
- Europe: `fra1` (Frankfurt) or `lon1` (London)
- Asia: `sgp1` (Singapore) or `blr1` (Bangalore)

### Droplet Sizes

| Size         | CPU | RAM   | Storage | Transfer | Monthly | Best For            |
| ------------ | --- | ----- | ------- | -------- | ------- | ------------------- |
| s-1vcpu-1gb  | 1   | 1 GB  | 25 GB   | 1 TB     | $6      | Development/testing |
| s-2vcpu-2gb  | 2   | 2 GB  | 50 GB   | 2 TB     | $18     | Small production    |
| s-2vcpu-4gb  | 2   | 4 GB  | 80 GB   | 4 TB     | $24     | **Recommended**     |
| s-4vcpu-8gb  | 4   | 8 GB  | 160 GB  | 5 TB     | $48     | High traffic        |
| s-8vcpu-16gb | 8   | 16 GB | 320 GB  | 6 TB     | $96     | Enterprise          |

**Recommended:** `s-2vcpu-4gb` for production deployments (good balance of cost and performance)

## Deployment Modes

### Mode 1: Self-Hosted (Default)

All services run in Docker containers on the Droplet.

**Configuration:**

```bash
USE_MANAGED_DB=false
USE_DO_SPACES=false
```

**Services included:**

- PostgreSQL 15 with PgBouncer connection pooling
- Redis for caching and sessions
- MinIO for S3-compatible object storage
- Prometheus, Grafana, Loki for observability
- Automated daily backups to MinIO

**Pros:**

- Lowest monthly cost ($24-48/mo)
- Full control over configuration
- No external service dependencies
- Data sovereignty (all data on your Droplet)
- Customizable backup retention policies

**Cons:**

- You manage backups and restoration
- Manual database scaling and optimization
- Database administration responsibility
- More operational complexity

**Best for:**

- Teams with DevOps experience
- Cost-sensitive deployments
- Organizations requiring full data control
- Development and staging environments

### Mode 2: Managed Database

Use DigitalOcean Managed PostgreSQL with self-hosted storage.

**Configuration:**

```bash
USE_MANAGED_DB=true
DO_DB_SIZE=db-s-1vcpu-2gb
USE_DO_SPACES=false
```

**Managed PostgreSQL features:**

- Automated daily backups (7-day retention)
- Point-in-time recovery to any moment in last 7 days
- Built-in connection pooling (25+ connections per GB RAM)
- Private network access via VPC
- Automatic security patches
- High availability option (standby nodes)
- 99.95% uptime SLA

**Pros:**

- Automated backups with point-in-time recovery
- Professional database management
- High availability options
- Reduced operational burden
- Dedicated database resources

**Cons:**

- Higher monthly cost (+$30-60/mo)
- Less configuration flexibility
- DigitalOcean vendor dependency
- Cannot use custom PostgreSQL extensions

**Best for:**

- Production applications
- Teams without dedicated DBA
- Applications requiring high availability
- Compliance requirements for automated backups

### Mode 3: Full Managed

Managed PostgreSQL + DigitalOcean Spaces for complete managed infrastructure.

**Configuration:**

```bash
USE_MANAGED_DB=true
USE_DO_SPACES=true
```

**Additional features (Spaces):**

- S3-compatible API
- Built-in CDN (DigitalOcean CDN included)
- 250 GB storage + 1 TB bandwidth included
- Automatic replication across availability zones
- 99.99% uptime SLA

**Pros:**

- Minimal operational burden
- Enterprise-grade infrastructure
- CDN acceleration for media files
- Geographic replication options
- Professional monitoring and support

**Cons:**

- Highest monthly cost (~$100+/mo)
- Vendor lock-in considerations
- Less customization options
- Data egress costs for high bandwidth usage

**Best for:**

- Production SaaS applications
- Global user base (CDN benefits)
- Teams focused on product development
- Enterprise deployments

## Step-by-Step Deployment

### Step 1: Prepare Configuration

```bash
# Navigate to project directory
cd freshtrack-pro

# Copy example configuration
cp scripts/deploy.config.example scripts/deploy.config

# Edit configuration file
nano scripts/deploy.config
# Or use your preferred editor: vim, code, etc.
```

Edit `deploy.config` with your values. **At minimum, configure:**

1. **Domain settings:**
   - `DOMAIN` - Your domain name
   - `ADMIN_EMAIL` - Email for SSL notifications

2. **DigitalOcean credentials:**
   - `DO_API_TOKEN` - API token from DigitalOcean
   - `DO_SSH_KEY_NAME` - SSH key name in your account

3. **Stack Auth credentials:**
   - `STACK_AUTH_PROJECT_ID`
   - `STACK_AUTH_PUBLISHABLE_KEY`
   - `STACK_AUTH_SECRET_KEY`

4. **Database password:**
   - `POSTGRES_PASSWORD` - Strong password (32+ characters)

**Configuration checklist:**

- [ ] Domain configured and DNS accessible
- [ ] DigitalOcean API token created
- [ ] SSH key added to DigitalOcean account
- [ ] Stack Auth credentials obtained
- [ ] Strong database password generated
- [ ] Region selected (default: nyc3)
- [ ] Droplet size selected (default: s-2vcpu-4gb)

### Step 2: Run Deployment

```bash
./scripts/deploy-digitalocean.sh
```

**What happens during deployment:**

1. **Configuration validation** (10 seconds)
   - Loads `deploy.config`
   - Validates required settings
   - Checks for missing credentials

2. **doctl authentication** (10 seconds)
   - Validates API token
   - Checks account access
   - Verifies SSH key exists

3. **VPC creation** (20 seconds)
   - Creates VPC `freshtrack-vpc` if not exists
   - IP range: `10.116.0.0/20`
   - Region: Your selected region

4. **Cloud Firewall setup** (20 seconds)
   - Creates firewall `freshtrack-firewall` if not exists
   - Allows SSH (22), HTTP (80), HTTPS (443)
   - Applies to Droplet automatically

5. **Droplet provisioning** (90 seconds)
   - Creates Droplet `freshtrack-prod`
   - Size: Your configured size
   - Image: Ubuntu 24.04 LTS
   - Attaches to VPC
   - Adds Cloud Firewall rules

6. **Cloud-init wait** (3-5 minutes)
   - Installs Docker and Docker Compose
   - Configures UFW firewall
   - Installs fail2ban for SSH protection
   - Installs node_exporter for metrics
   - Signals completion via `/var/lib/cloud/instance/boot-finished`

7. **Application deployment** (1-2 minutes)
   - Transfers configuration and secrets via SCP
   - Runs `deploy-selfhosted.sh` on Droplet
   - Verifies DNS before requesting SSL certificates
   - Deploys Docker containers
   - Validates health checks

8. **Completion** (immediate)
   - Displays Droplet IP address
   - Shows next steps for DNS configuration
   - Saves Droplet IP to `.droplet-ip` file

**Total time: 8-12 minutes**

**Example output:**

```
==> Loading configuration...
✓ Loaded configuration from scripts/deploy.config

==> Validating DigitalOcean CLI...
✓ doctl installed: doctl version 1.98.0
✓ Authenticated as: your-email@example.com

==> Creating VPC...
✓ VPC freshtrack-vpc already exists

==> Creating Cloud Firewall...
✓ Cloud Firewall freshtrack-firewall already exists

==> Provisioning Droplet...
✓ Droplet freshtrack-prod created: 123.45.67.89

==> Waiting for cloud-init to complete...
⚠ Cloud-init in progress... (1/10)
✓ Cloud-init completed. Docker is ready.

==> Deploying application...
✓ Configuration transferred to Droplet
✓ Deployment completed successfully

Droplet IP: 123.45.67.89

Next Steps:
  1. Configure DNS:
     Add A record: freshtrackpro.com -> 123.45.67.89
  2. Wait for DNS propagation (5-60 minutes)
  3. Access: https://freshtrackpro.com
```

### Step 3: Configure DNS

After deployment completes, configure DNS records to point to your Droplet.

**Droplet IP saved to:**

```bash
cat .droplet-ip
# Output: 123.45.67.89
```

**In your DNS provider (Cloudflare, Route53, Namecheap, etc.):**

| Type | Name | Value        | TTL |
| ---- | ---- | ------------ | --- |
| A    | @    | 123.45.67.89 | 300 |
| A    | www  | 123.45.67.89 | 300 |

**Optional subdomains:**
| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | monitoring | 123.45.67.89 | 300 |
| A | status | 123.45.67.89 | 300 |

**DNS propagation time:**

- Typical: 5-60 minutes
- Worst case: up to 24 hours
- Use `dig` to check status

**Check DNS propagation:**

```bash
# Your domain
dig freshtrackpro.com +short
# Should return: 123.45.67.89

# Different DNS servers
dig @8.8.8.8 freshtrackpro.com +short   # Google DNS
dig @1.1.1.1 freshtrackpro.com +short   # Cloudflare DNS
```

**Important:** The deployment script verifies DNS before requesting SSL certificates. If you run deployment before DNS propagates, it will pause and wait for you to configure DNS.

### Step 4: Verify Deployment

**Check DNS resolution:**

```bash
dig freshtrackpro.com +short
# Should return your Droplet IP
```

**Access your application:**

```
https://freshtrackpro.com
```

**Verify SSL certificate:**

```bash
curl -I https://freshtrackpro.com
# Should show: HTTP/2 200
# Should NOT show certificate warnings
```

**SSH to Droplet:**

```bash
ssh root@$(cat .droplet-ip)
# Or: ssh root@123.45.67.89
```

**Check Docker containers:**

```bash
ssh root@$(cat .droplet-ip)
cd /opt/freshtrack-pro
docker compose ps
```

Expected services:

- `freshtrack-caddy` - Running
- `freshtrack-backend` - Running
- `freshtrack-postgres` - Running (if self-hosted)
- `freshtrack-redis` - Running
- `freshtrack-minio` - Running (if self-hosted)
- `prometheus` - Running
- `grafana` - Running
- `loki` - Running

**View logs:**

```bash
docker compose logs -f backend
# Press Ctrl+C to exit
```

**Access Grafana:**

```
https://freshtrackpro.com/grafana
```

Default credentials (if not configured):

- Username: `admin`
- Password: Check `/opt/freshtrack-pro/secrets/grafana-password`

## Managed PostgreSQL Setup

### Automatic Setup

If `USE_MANAGED_DB=true` in config, the deployment script automatically:

1. **Creates database cluster** in VPC
   - Name: `freshtrack-db`
   - Region: Your selected region
   - Size: Your configured size
   - Private network only (VPC)

2. **Configures connection pooling**
   - Mode: Transaction pooling
   - Increases connection limit 4x

3. **Downloads SSL certificate**
   - Required for secure connections
   - Saved to `/opt/freshtrack-pro/secrets/`

4. **Saves connection string**
   - To `/opt/freshtrack-pro/secrets/database-url`
   - Includes SSL mode and pooler endpoint

### Manual Setup (Standalone)

To add managed database to existing deployment:

```bash
./scripts/deploy-digitalocean.sh --setup-managed-db
```

This creates the database cluster and outputs the connection string.

**Manual configuration steps:**

1. **Create database cluster:**

   ```bash
   doctl databases create freshtrack-db \
     --engine pg \
     --region nyc3 \
     --size db-s-1vcpu-2gb \
     --version 15 \
     --private-network-uuid $(doctl vpcs list --format ID --no-header | head -1)
   ```

2. **Wait for provisioning** (5-10 minutes):

   ```bash
   doctl databases get freshtrack-db
   # Wait until status: online
   ```

3. **Get connection details:**

   ```bash
   doctl databases connection freshtrack-db --format URI
   ```

4. **Update application:**

   ```bash
   # SSH to Droplet
   ssh root@$(cat .droplet-ip)

   # Save connection string
   echo "postgresql://user:pass@host-pooler:25060/db?sslmode=require" > /opt/freshtrack-pro/secrets/database-url

   # Restart backend
   docker compose restart backend
   ```

### Connection String Format

Managed PostgreSQL provides two endpoints:

**Direct connection (LIMITED):**

```
postgresql://user:password@host.db.ondigitalocean.com:25060/defaultdb?sslmode=require
```

- Use only for administration
- Limited to 100 connections total
- No connection pooling

**Connection pooler (RECOMMENDED):**

```
postgresql://user:password@host-pooler.db.ondigitalocean.com:25060/defaultdb?sslmode=require
```

- Use for application connections
- 25+ connections per GB RAM (50+ for 2GB tier)
- Built-in PgBouncer pooling
- Better performance under load

**Important:** Always use the `-pooler` endpoint for application connections.

### Database Tiers

| Tier            | CPU | RAM   | Disk   | Connections | Monthly Cost | Use Case           |
| --------------- | --- | ----- | ------ | ----------- | ------------ | ------------------ |
| db-s-1vcpu-1gb  | 1   | 1 GB  | 10 GB  | 25          | $15          | Development        |
| db-s-1vcpu-2gb  | 1   | 2 GB  | 25 GB  | 50          | $30          | Small production   |
| db-s-2vcpu-4gb  | 2   | 4 GB  | 38 GB  | 100         | $60          | Production with HA |
| db-s-4vcpu-8gb  | 4   | 8 GB  | 115 GB | 200         | $120         | High traffic       |
| db-s-6vcpu-16gb | 6   | 16 GB | 270 GB | 400         | $240         | Enterprise         |

**Recommendation:**

- Development: `db-s-1vcpu-1gb` ($15/mo)
- Production: `db-s-1vcpu-2gb` ($30/mo)
- High traffic: `db-s-2vcpu-4gb` with standby ($60/mo)

### High Availability

Add standby nodes for automatic failover:

```bash
doctl databases configuration update freshtrack-db --num-nodes 2
```

**Standby node benefits:**

- Automatic failover (<30 seconds)
- Read replicas for load distribution
- Zero-downtime maintenance
- Geographic redundancy options

**Cost:** +$30-60/mo depending on tier

## DigitalOcean Spaces Setup

### Enable Spaces

DigitalOcean Spaces provides S3-compatible object storage with built-in CDN.

**1. Create Spaces access keys:**

Visit: https://cloud.digitalocean.com/account/api/spaces

- Click "Generate New Key"
- Name: `freshtrack-spaces`
- Copy Access Key and Secret Key

**2. Configure in deploy.config:**

```bash
USE_DO_SPACES=true
DO_SPACES_REGION=nyc3
DO_SPACES_BUCKET=freshtrack-media
DO_SPACES_ACCESS_KEY=DO00XXXXXXXXX
DO_SPACES_SECRET_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**3. Create Space (optional - script creates automatically):**

```bash
doctl spaces create freshtrack-media --region nyc3
```

**4. Enable CDN:**

```bash
doctl spaces cdn enable freshtrack-media --region nyc3
```

CDN endpoint format:

```
https://freshtrack-media.nyc3.cdn.digitaloceanspaces.com
```

### Spaces Pricing

**Base tier:**

- $5/month for 250 GB storage
- 1 TB outbound bandwidth included
- CDN included at no extra cost

**Overages:**

- Storage: $0.02/GB over 250 GB
- Bandwidth: $0.01/GB over 1 TB

**Example costs:**
| Usage | Storage | Bandwidth | Monthly Cost |
|-------|---------|-----------|--------------|
| Small | 100 GB | 500 GB | $5 |
| Medium | 300 GB | 1.2 TB | $6 |
| Large | 500 GB | 2 TB | $15 |

### Spaces Features

**S3 compatibility:**

- Use standard S3 SDKs and tools
- Works with `aws-sdk` in Node.js
- Compatible with Terraform S3 backend

**CDN acceleration:**

- Automatic edge caching
- Global points of presence
- SSL included on CDN endpoints
- Custom domain support

**Access control:**

- Public or private buckets
- IAM-style permissions
- CORS configuration
- Signed URLs for temporary access

## Cost Comparison

### Monthly Infrastructure Costs

| Component             | Self-Hosted    | Managed DB     | Full Managed   |
| --------------------- | -------------- | -------------- | -------------- |
| Droplet (2 vCPU, 4GB) | $24            | $24            | $24            |
| PostgreSQL            | $0 (container) | $30 (managed)  | $30 (managed)  |
| MinIO/Storage         | $0 (container) | $0 (container) | $5 (Spaces)    |
| Redis                 | $0 (container) | $0 (container) | $0 (container) |
| Backups               | ~$1 (Volumes)  | $0 (included)  | $0 (included)  |
| **Total**             | **~$25/mo**    | **~$54/mo**    | **~$59/mo**    |

**High-traffic configuration:**

| Component             | Self-Hosted    | Managed DB     | Full Managed   |
| --------------------- | -------------- | -------------- | -------------- |
| Droplet (4 vCPU, 8GB) | $48            | $48            | $48            |
| PostgreSQL            | $0 (container) | $60 (HA)       | $60 (HA)       |
| MinIO/Storage         | $0 (container) | $0 (container) | $15 (Spaces)   |
| Redis                 | $0 (container) | $0 (container) | $0 (container) |
| Backups               | ~$2 (Volumes)  | $0 (included)  | $0 (included)  |
| **Total**             | **~$50/mo**    | **~$108/mo**   | **~$123/mo**   |

### Operational Time Costs

| Task                  | Self-Hosted   | Managed DB     | Full Managed   |
| --------------------- | ------------- | -------------- | -------------- |
| Database backups      | 2 hrs/mo      | 0 hrs/mo       | 0 hrs/mo       |
| Database optimization | 2 hrs/mo      | 0 hrs/mo       | 0 hrs/mo       |
| Security patches      | 2 hrs/mo      | 0.5 hrs/mo     | 0.5 hrs/mo     |
| Monitoring setup      | 2 hrs/mo      | 1 hr/mo        | 0.5 hrs/mo     |
| Storage management    | 1 hr/mo       | 1 hr/mo        | 0 hrs/mo       |
| Incident response     | 2 hrs/mo      | 1 hr/mo        | 0.5 hrs/mo     |
| **Total**             | **11 hrs/mo** | **3.5 hrs/mo** | **1.5 hrs/mo** |

### Total Cost of Ownership

At $100/hour engineer rate:

| Mode         | Infrastructure | Operations | **Total**     |
| ------------ | -------------- | ---------- | ------------- |
| Self-Hosted  | $25/mo         | $1,100/mo  | **$1,125/mo** |
| Managed DB   | $54/mo         | $350/mo    | **$404/mo**   |
| Full Managed | $59/mo         | $150/mo    | **$209/mo**   |

**At $150/hour engineer rate:**

| Mode         | Infrastructure | Operations | **Total**     |
| ------------ | -------------- | ---------- | ------------- |
| Self-Hosted  | $25/mo         | $1,650/mo  | **$1,675/mo** |
| Managed DB   | $54/mo         | $525/mo    | **$579/mo**   |
| Full Managed | $59/mo         | $225/mo    | **$284/mo**   |

### Cost Analysis

**Recommendation by team size:**

| Team Size      | Recommended Mode | Reasoning                               |
| -------------- | ---------------- | --------------------------------------- |
| Solo developer | Full Managed     | Focus on product, not ops               |
| 2-5 engineers  | Full Managed     | Better ROI on feature development       |
| 5-10 engineers | Managed DB       | Balance cost and operational control    |
| 10+ engineers  | Self-Hosted      | Dedicated DevOps team justifies savings |

**Break-even analysis:**

At what point is self-hosted cheaper than managed?

- **Never**, when accounting for engineer time
- Self-hosted saves ~$30/mo in infrastructure
- But costs ~7.5 more hours/mo in operations
- At $100/hr: Costs $720/mo more in time
- At $50/hr: Still costs $345/mo more

**Conclusion:** Use managed services unless you have a dedicated DevOps team or specific compliance requirements requiring full control.

## Networking and Security

### VPC Private Networking

All resources are automatically placed in a Virtual Private Cloud (VPC).

**VPC configuration:**

- Name: `freshtrack-vpc`
- IP range: `10.116.0.0/20` (4,096 IP addresses)
- Region: Your selected region
- Private network between Droplet and managed services

**Benefits:**

- No bandwidth charges for internal traffic
- Reduced latency (~1ms vs 5-10ms public internet)
- Enhanced security (services not exposed to internet)
- Simplified firewall rules

**Check VPC status:**

```bash
doctl vpcs list
```

### Cloud Firewall

The deployment script creates a Cloud Firewall with sensible defaults.

**Inbound rules:**
| Protocol | Port | Source | Purpose |
|----------|------|--------|---------|
| TCP | 22 | 0.0.0.0/0 | SSH access |
| TCP | 80 | 0.0.0.0/0 | HTTP (Let's Encrypt validation) |
| TCP | 443 | 0.0.0.0/0 | HTTPS (application traffic) |

**Outbound rules:**

- All protocols, all ports, all destinations (required for updates and external APIs)

**Manage firewall:**

```bash
# List firewalls
doctl compute firewall list

# Add custom rule (example: allow PostgreSQL from specific IP)
doctl compute firewall add-rules freshtrack-firewall \
  --inbound-rules "protocol:tcp,ports:5432,address:203.0.113.0/24"

# Remove rule
doctl compute firewall remove-rules freshtrack-firewall \
  --inbound-rules "protocol:tcp,ports:5432,address:203.0.113.0/24"
```

**Best practices:**

- Keep SSH (22) open for administration
- Consider restricting SSH to your office/VPN IP range
- Never restrict HTTP (80) - required for SSL renewal
- HTTPS (443) should remain open for public access

### Host Firewall (UFW)

UFW (Uncomplicated Firewall) is configured on the Droplet for defense-in-depth.

**Check status:**

```bash
ssh root@$(cat .droplet-ip)
ufw status verbose
```

**Expected output:**

```
Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere
80/tcp                     ALLOW       Anywhere
443/tcp                    ALLOW       Anywhere
```

**Add custom rules:**

```bash
# Allow PostgreSQL from specific IP
ufw allow from 203.0.113.10 to any port 5432

# Delete rule
ufw delete allow from 203.0.113.10 to any port 5432
```

### fail2ban

Protects SSH from brute force attacks by banning IPs after failed login attempts.

**Check status:**

```bash
ssh root@$(cat .droplet-ip)
fail2ban-client status sshd
```

**Configuration:**

- Ban after 5 failed attempts
- Ban duration: 10 minutes
- Find time window: 10 minutes

**View banned IPs:**

```bash
fail2ban-client status sshd
```

**Unban IP:**

```bash
fail2ban-client set sshd unbanip 203.0.113.10
```

### Security Best Practices

**1. Regular updates:**

```bash
ssh root@$(cat .droplet-ip)
apt update && apt upgrade -y
```

**2. SSH key authentication only:**

```bash
# Disable password authentication
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd
```

**3. Enable automatic security updates:**

```bash
apt install unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
```

**4. Monitor security logs:**

```bash
# View SSH authentication logs
tail -f /var/log/auth.log

# View fail2ban logs
tail -f /var/log/fail2ban.log
```

**5. Rotate secrets regularly:**

- Database passwords every 90 days
- API tokens every 180 days
- SSL certificates auto-renewed by Let's Encrypt

## Troubleshooting

### doctl Authentication Failed

**Error:**

```
Error: Unable to authenticate
```

**Cause:** Invalid or expired API token

**Solution 1: Re-authenticate interactively**

```bash
doctl auth init
# Paste your API token when prompted
```

**Solution 2: Use environment variable**

```bash
export DIGITALOCEAN_TOKEN=dop_v1_your_token_here
doctl account get
```

**Solution 3: Check token permissions**

- Visit: https://cloud.digitalocean.com/account/api/tokens
- Verify token has "Read" and "Write" permissions
- Generate new token if needed

**Verify authentication:**

```bash
doctl account get
# Should show your email and account details
```

### Droplet Not Accessible via SSH

**Error:**

```
ssh: connect to host 123.45.67.89 port 22: Connection refused
```

**Possible causes and solutions:**

**1. Cloud Firewall blocking SSH:**

```bash
doctl compute firewall list
doctl compute firewall get freshtrack-firewall
# Verify SSH (port 22) is allowed
```

**2. Wrong SSH key:**

```bash
# List keys in your DigitalOcean account
doctl compute ssh-key list

# Add your current key if missing
doctl compute ssh-key create my-new-key --public-key "$(cat ~/.ssh/id_ed25519.pub)"
```

**3. Droplet still provisioning:**

```bash
# Check Droplet status
doctl compute droplet list
# Wait until status is "active"
```

**4. Cloud-init not complete:**

```bash
# Wait 5-10 minutes for initial setup
# Check cloud-init status (if you can access console)
sudo cloud-init status --wait
```

**5. Use DigitalOcean Console:**

- Visit: https://cloud.digitalocean.com/droplets
- Click on Droplet → Access → Launch Droplet Console
- Debug from console access

### DNS Not Resolving

**Error:**

```bash
dig freshtrackpro.com +short
# Returns nothing or wrong IP
```

**Solutions:**

**1. Check DNS propagation:**

```bash
# Check from different DNS servers
dig @8.8.8.8 freshtrackpro.com +short   # Google
dig @1.1.1.1 freshtrackpro.com +short   # Cloudflare
dig @8.8.4.4 freshtrackpro.com +short   # Google alternate
```

**2. Verify A record in DNS provider:**

- Log into your DNS provider (Cloudflare, Route53, etc.)
- Verify A record exists: `freshtrackpro.com` → `123.45.67.89`
- Check TTL is low (300 seconds) for faster propagation

**3. Clear local DNS cache:**

```bash
# macOS
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder

# Linux
sudo systemd-resolve --flush-caches

# Windows
ipconfig /flushdns
```

**4. Wait for propagation:**

- Typical: 5-60 minutes
- Worst case: up to 48 hours
- Use https://www.whatsmydns.net/ to check global propagation

**5. Test with hosts file (temporary):**

```bash
# Add to /etc/hosts (Linux/Mac) or C:\Windows\System32\drivers\etc\hosts (Windows)
123.45.67.89 freshtrackpro.com
```

### SSL Certificate Failed

**Error in Caddy logs:**

```
failed to obtain certificate: ACME server reported an error:
connection refused
```

**Common causes and solutions:**

**1. DNS not resolving:**

```bash
dig freshtrackpro.com +short
# MUST return Droplet IP before requesting SSL
```

**2. Port 80 not open:**

```bash
# Check Cloud Firewall
doctl compute firewall get freshtrack-firewall

# Check UFW
ssh root@$(cat .droplet-ip)
ufw status | grep 80
```

**3. Domain pointing to wrong IP:**

```bash
dig freshtrackpro.com +short
# Should match: cat .droplet-ip
```

**4. Let's Encrypt rate limits:**

- 5 failures per hour per domain
- 50 certificates per registered domain per week
- Wait 1 hour if rate limited

**5. View Caddy logs:**

```bash
ssh root@$(cat .droplet-ip)
docker logs freshtrack-caddy
# Look for specific error messages
```

**6. Test certificate request manually:**

```bash
ssh root@$(cat .droplet-ip)
curl -I http://freshtrackpro.com
# Should redirect to HTTPS or show Caddy response
```

**Recovery:**

```bash
# Wait for DNS propagation
# Clear failed attempts
ssh root@$(cat .droplet-ip)
cd /opt/freshtrack-pro
docker compose down
docker volume rm freshtrack_caddy_data
docker compose up -d
```

### Database Connection Failed

**Error in backend logs:**

```
Error: connect ECONNREFUSED
```

**For self-hosted PostgreSQL:**

**1. Check PostgreSQL container:**

```bash
ssh root@$(cat .droplet-ip)
docker compose ps postgres
# Should show "running"
```

**2. Check PostgreSQL logs:**

```bash
docker compose logs postgres
# Look for errors during startup
```

**3. Test connection manually:**

```bash
docker compose exec postgres psql -U freshtrack_user -d freshtrack
# Should connect successfully
```

**4. Verify credentials:**

```bash
cat /opt/freshtrack-pro/secrets/postgres-password
# Should match POSTGRES_PASSWORD in config
```

**For managed PostgreSQL:**

**1. Use pooler endpoint:**

```bash
# Wrong:
postgresql://user:pass@host.db.ondigitalocean.com:25060/db

# Correct:
postgresql://user:pass@host-pooler.db.ondigitalocean.com:25060/db
```

**2. Verify SSL mode:**

```bash
# Connection string MUST include sslmode=require
postgresql://user:pass@host-pooler:25060/db?sslmode=require
```

**3. Check trusted sources:**

```bash
doctl databases firewalls list freshtrack-db
# Should include Droplet's VPC or IP
```

**4. Test connection from Droplet:**

```bash
ssh root@$(cat .droplet-ip)
psql "postgresql://user:pass@host-pooler:25060/db?sslmode=require"
```

**5. Download CA certificate:**

```bash
doctl databases ca-cert freshtrack-db > /opt/freshtrack-pro/secrets/db-ca.crt
```

### Application Health Check Failing

**Error during deployment:**

```
Health check failed after 30 retries
Rolling back to previous version...
```

**Debugging steps:**

**1. Check backend logs:**

```bash
ssh root@$(cat .droplet-ip)
docker compose logs backend
# Look for startup errors
```

**2. Test health endpoint manually:**

```bash
curl http://localhost:3000/health
# Should return: {"status":"ok"}
```

**3. Check environment variables:**

```bash
docker compose exec backend env | grep -E 'DATABASE_URL|STACK_AUTH'
# Verify all required variables are set
```

**4. Check Stack Auth credentials:**

```bash
# Test Stack Auth API
curl -H "Authorization: Bearer $STACK_AUTH_SECRET_KEY" \
  https://api.stack-auth.com/api/v1/projects/$STACK_AUTH_PROJECT_ID
```

**5. Check database connectivity:**

```bash
docker compose exec backend node -e "
  require('pg').Pool({
    connectionString: process.env.DATABASE_URL
  }).query('SELECT NOW()').then(console.log).catch(console.error)
"
```

**6. Increase health check timeout:**

```bash
# In deploy.config
HEALTH_CHECK_TIMEOUT=60
HEALTH_CHECK_RETRIES=60
# Total wait: 60 minutes
```

### View Logs

**All services:**

```bash
ssh root@$(cat .droplet-ip)
cd /opt/freshtrack-pro
docker compose logs -f
```

**Specific service:**

```bash
docker compose logs -f backend
docker compose logs -f postgres
docker compose logs -f caddy
```

**Tail last 100 lines:**

```bash
docker compose logs --tail=100 backend
```

**Filter by time:**

```bash
docker compose logs --since=10m backend
docker compose logs --since="2024-01-24T12:00:00" backend
```

**Search logs:**

```bash
docker compose logs backend | grep ERROR
docker compose logs backend | grep -i "database"
```

## Maintenance

### Updates

**Update application code:**

```bash
# SSH to Droplet
ssh root@$(cat .droplet-ip)

# Navigate to application directory
cd /opt/freshtrack-pro

# Pull latest code
git pull origin main

# Redeploy (automatic rollback on failure)
./scripts/deploy-selfhosted.sh --deploy
```

**Update system packages:**

```bash
ssh root@$(cat .droplet-ip)
apt update && apt upgrade -y
```

**Update Docker:**

```bash
apt update
apt install docker-ce docker-ce-cli containerd.io
systemctl restart docker
```

**Zero-downtime updates:**
The deployment script automatically:

1. Pulls new Docker images
2. Tags current deployment (for rollback)
3. Starts new containers
4. Health checks new containers
5. Stops old containers only after new ones are healthy
6. Rolls back if health checks fail

### Backups

#### Self-Hosted Mode

**Automated daily backups** (configured in Phase 10):

```bash
# Backups run automatically at 2 AM UTC
# Location: MinIO bucket (accessible at https://your-domain:9001)

# Verify backups exist
ssh root@$(cat .droplet-ip)
docker compose exec postgres ls -lh /backups/
```

**Manual backup:**

```bash
ssh root@$(cat .droplet-ip)
cd /opt/freshtrack-pro
docker compose exec postgres pg_dump -U freshtrack_user -Fc freshtrack > backup-$(date +%Y%m%d).dump
```

**Test restoration:**

```bash
# Run the test restore script
./scripts/test-restore.sh
# Creates test database, restores, validates, cleans up
```

**Download backup locally:**

```bash
scp root@$(cat .droplet-ip):/opt/freshtrack-pro/backups/freshtrack-*.dump ./
```

**Restore from backup:**

```bash
# WARNING: This will replace current database
ssh root@$(cat .droplet-ip)
cd /opt/freshtrack-pro
docker compose exec -T postgres pg_restore -U freshtrack_user -d freshtrack --clean backup-20240124.dump
```

#### Managed PostgreSQL

**Automated daily backups** (built-in):

- 7-day retention
- Point-in-time recovery
- Managed by DigitalOcean

**Create on-demand backup:**

```bash
doctl databases backups create freshtrack-db
```

**List backups:**

```bash
doctl databases backups list freshtrack-db
```

**Restore from backup:**

**Option 1: Fork database (non-destructive):**

```bash
# Creates new database from backup
doctl databases fork freshtrack-db freshtrack-db-restored \
  --backup-restore-id BACKUP_ID
```

**Option 2: Point-in-time recovery:**

```bash
# Restore to specific timestamp
doctl databases fork freshtrack-db freshtrack-db-restored \
  --restore-from-timestamp "2024-01-24T12:00:00Z"
```

**Backup best practices:**

- Test restoration monthly
- Keep local copies of critical backups
- Document restoration procedures
- Monitor backup success (webhook notifications)

### Scaling

#### Vertical Scaling (Resize Droplet)

**Resize Droplet:**

```bash
# List available sizes
doctl compute size list

# Resize (requires restart)
doctl compute droplet-action resize DROPLET_ID \
  --size s-4vcpu-8gb \
  --wait

# Or resize disk permanently (cannot be reversed)
doctl compute droplet-action resize DROPLET_ID \
  --size s-4vcpu-8gb \
  --resize-disk \
  --wait
```

**Downtime:** 1-5 minutes during resize

**Resize managed database:**

```bash
# List database sizes
doctl databases options sizes

# Resize database
doctl databases resize freshtrack-db \
  --size db-s-2vcpu-4gb \
  --num-nodes 1
```

**Downtime:** None (online resize)

#### High Availability

**Add database standby nodes:**

```bash
doctl databases resize freshtrack-db \
  --size db-s-2vcpu-4gb \
  --num-nodes 2
```

Benefits:

- Automatic failover (<30 seconds)
- Read replicas for load distribution
- Zero-downtime maintenance

**Enable Droplet backups:**

```bash
doctl compute droplet-action enable-backups DROPLET_ID
```

Cost: +20% of Droplet price

#### Horizontal Scaling

For multi-Droplet deployments:

1. **Add load balancer:**

   ```bash
   doctl compute load-balancer create \
     --name freshtrack-lb \
     --region nyc3 \
     --forwarding-rules "entry_protocol:https,entry_port:443,target_protocol:http,target_port:80"
   ```

2. **Deploy to multiple Droplets**
3. **Use managed PostgreSQL** (required for multi-instance)
4. **Configure shared storage** (Spaces for media files)

### Monitoring

**Access Grafana:**

```
https://freshtrackpro.com/grafana
```

**Default dashboards:**

- System metrics (CPU, memory, disk, network)
- PostgreSQL metrics (connections, queries, cache hit rate)
- Application metrics (request rate, error rate, response time)
- Caddy metrics (HTTPS requests, SSL certificate expiry)

**Configure alerts:**

1. Navigate to Alerting → Alert rules
2. Create alerts for:
   - High CPU usage (>80% for 5 minutes)
   - Low disk space (<10%)
   - High error rate (>5% of requests)
   - Database connection pool exhaustion
   - SSL certificate expiring (<30 days)

**DigitalOcean Monitoring:**

Access at: https://cloud.digitalocean.com/droplets

Built-in metrics:

- CPU usage
- Bandwidth usage
- Disk I/O
- Disk space

**Set up billing alerts:**

1. Visit: https://cloud.digitalocean.com/account/billing
2. Click "Alerts"
3. Set threshold (e.g., $100/month)
4. Add email notification

### Performance Optimization

**1. Enable Redis caching:**

```bash
# Already configured in docker-compose.yml
# Verify Redis is running
docker compose ps redis
```

**2. Optimize PostgreSQL:**

```bash
# Adjust PgBouncer pool size based on traffic
# Edit: docker/pgbouncer/pgbouncer.ini
default_pool_size = 25  # Increase for high traffic
max_client_conn = 100

# Restart PgBouncer
docker compose restart pgbouncer
```

**3. Enable HTTP/2:**

```bash
# Already enabled in Caddy configuration
# Verify:
curl -I --http2 https://freshtrackpro.com
```

**4. CDN for static assets:**

- Enable DigitalOcean Spaces CDN
- Configure Caddy to cache static files
- Use `Cache-Control` headers appropriately

**5. Database query optimization:**

```bash
# Check slow queries
docker compose exec postgres psql -U freshtrack_user -d freshtrack \
  -c "SELECT query, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
```

---

## Next Steps

After successful deployment:

1. **Configure monitoring alerts** in Grafana
   - Set up Slack/Discord notifications
   - Define alert thresholds for your SLAs

2. **Test backup restoration**
   - Run `./scripts/test-restore.sh` monthly
   - Document your RTO and RPO

3. **Set up DNS for additional subdomains**
   - monitoring.freshtrackpro.com
   - status.freshtrackpro.com

4. **Review security configurations**
   - Restrict SSH to office IP range (if applicable)
   - Enable automatic security updates
   - Set up log monitoring

5. **Plan for scaling**
   - Monitor resource usage
   - Set up auto-scaling alerts
   - Document scale-up procedures

6. **Create runbooks**
   - Incident response procedures
   - Deployment rollback steps
   - Common troubleshooting scenarios

## Additional Resources

**FreshTrack Pro Documentation:**

- [Self-Hosted Deployment Guide](SELFHOSTED_DEPLOYMENT.md) - Detailed deployment procedures
- [Database Documentation](DATABASE.md) - Database management and optimization
- [SSL Certificates Guide](SSL_CERTIFICATES.md) - HTTP-01 and DNS-01 challenge methods

**DigitalOcean Documentation:**

- [Droplet Documentation](https://docs.digitalocean.com/products/droplets/)
- [Managed PostgreSQL Guide](https://docs.digitalocean.com/products/databases/postgresql/)
- [Spaces Documentation](https://docs.digitalocean.com/products/spaces/)
- [VPC Networking](https://docs.digitalocean.com/products/networking/vpc/)

**Docker and Orchestration:**

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Caddy Web Server](https://caddyserver.com/docs/)
- [PostgreSQL Official Docs](https://www.postgresql.org/docs/)

**Monitoring and Observability:**

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Loki for Logs](https://grafana.com/docs/loki/latest/)

## Support

**Community:**

- GitHub Issues: https://github.com/yourusername/freshtrack-pro/issues
- Discussions: https://github.com/yourusername/freshtrack-pro/discussions

**Commercial Support:**

- Email: support@freshtrackpro.com
- Documentation: https://docs.freshtrackpro.com

---

**Document Version:** 1.0
**Last Updated:** 2026-01-24
**Deployment Script Version:** 12-02 (Phase 12)
