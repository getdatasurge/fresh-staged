# Self-Hosted Deployment Guide

Complete guide for deploying FreshTrack Pro to a self-hosted Ubuntu 24.04 VM.

> **Not sure if self-hosted is right for you?** See the [Deployment Decision Guide](./DEPLOYMENT_DECISION_GUIDE.md) to compare options.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [DNS Configuration](#dns-configuration)
4. [Server Preparation](#server-preparation)
5. [Configuration](#configuration)
6. [Deployment](#deployment)
7. [Verification](#verification)
8. [Post-Deployment](#post-deployment)
9. [Rollback Procedures](#rollback-procedures)
10. [Troubleshooting](#troubleshooting)
11. [Maintenance](#maintenance)

---

## Overview

This guide covers deploying FreshTrack Pro using the automated `deploy-automated.sh` script. The script is checkpoint-based, idempotent, and automatically resumes from the last successful step after failures.

**What the script does:**

- Installs Docker and Docker Compose
- Configures UFW firewall (ports 22, 80, 443)
- Installs fail2ban for intrusion prevention
- Installs node_exporter for system metrics
- Sets up application directory (/opt/freshtrack-pro)
- Creates secure secret files
- Validates DNS before requesting SSL certificates
- Deploys services with health check validation
- Automatic rollback on deployment failure

**Estimated time:** 30-45 minutes for first deployment

---

## Prerequisites

### Server Requirements

| Requirement | Minimum          | Recommended      | Notes                                           |
| ----------- | ---------------- | ---------------- | ----------------------------------------------- |
| CPU         | 4 vCPU           | 4+ vCPU          | `preflight.sh` validates automatically          |
| RAM         | 8 GB             | 16 GB            | Deployment fails preflight if less than minimum |
| Storage     | 100 GB SSD       | 200 GB SSD       | For database growth and Docker images           |
| OS          | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS | Other distros not officially supported          |
| Network     | Static IP        | Static IP        | Required for DNS configuration                  |

> **Note:** The `preflight.sh` script validates server requirements automatically. Deployment will abort early with clear error messages if minimums are not met.

### External Services Checklist

**Required:**

- [ ] Domain name with DNS access
  - Primary domain (e.g., `freshtrack.example.com`)
  - Subdomain for monitoring (`monitoring.example.com`)
- [ ] Stack Auth account (https://stack-auth.com)
  - Project ID (found in Dashboard > Settings)
  - Publishable Key (`pk_...`) - safe to expose in frontend
  - Secret Key (`sk_...`) - store securely, never commit to git

**Optional:**

- [ ] Telnyx account for SMS alerts
  - API Key (from Telnyx portal)
  - Messaging Profile ID (configured in portal)
  - Phone Number (purchased in Telnyx)
- [ ] The Things Network (TTN) for LoRaWAN sensors
  - Application ID (from TTN console)
  - API Key (generated in TTN console)
- [ ] Slack/Discord webhook for deployment notifications

### Local Tools

- SSH client for server access
- Text editor for configuration

---

## DNS Configuration

Configure DNS records BEFORE running deployment. The deployment script verifies DNS configuration before requesting SSL certificates to prevent Let's Encrypt rate limit issues.

### Required Records

| Type | Name                  | Value          | Required | Purpose                       |
| ---- | --------------------- | -------------- | -------- | ----------------------------- |
| A    | @ (or yourdomain.com) | YOUR_SERVER_IP | Yes      | Main application              |
| A    | monitoring            | YOUR_SERVER_IP | Yes      | Grafana/Prometheus dashboards |
| A    | status                | YOUR_SERVER_IP | No       | Uptime Kuma status page       |
| A    | www                   | YOUR_SERVER_IP | No       | WWW redirect                  |

### Verify DNS Propagation

```bash
# Check A record
dig yourdomain.com +short

# Should return your server IP
# Wait for propagation (5-60 minutes) if different
```

**Important:** The deployment script checks DNS before requesting SSL certificates. If DNS is not configured, deployment will abort to prevent Let's Encrypt rate limit exhaustion (5 failures per hour limit).

**DNS propagation timing:**

- Typical: 5-60 minutes
- Worst case: up to 24 hours
- Use `dig` command to verify before deploying

### Firewall Requirements

Ensure these ports are accessible BEFORE deployment:

| Port | Protocol | Direction | Purpose                             |
| ---- | -------- | --------- | ----------------------------------- |
| 22   | TCP      | Inbound   | SSH access (required)               |
| 80   | TCP      | Inbound   | HTTP - Let's Encrypt ACME challenge |
| 443  | TCP      | Inbound   | HTTPS - Production traffic          |

> **Note:** The deployment script configures UFW (host firewall) automatically, but **cloud provider firewalls** (AWS Security Groups, DigitalOcean Firewall, GCP VPC rules) must be configured manually before deployment.

### Pre-Deployment Checklist

Complete this checklist BEFORE running `deploy-automated.sh`:

- [ ] VM provisioned with minimum specs (4 vCPU, 8 GB RAM, 100 GB SSD)
- [ ] SSH access confirmed: `ssh root@YOUR_IP`
- [ ] DNS A records created for domain and monitoring subdomain
- [ ] DNS propagated: `dig yourdomain.com +short` returns server IP
- [ ] Cloud firewall allows ports 22, 80, 443 inbound
- [ ] Stack Auth credentials ready (Project ID, Publishable Key, Secret Key)
- [ ] Admin email ready (for SSL certificate notifications)

---

## Server Preparation

### 1. SSH into Your Server

```bash
ssh root@YOUR_SERVER_IP
```

### 2. Update System

```bash
apt update && apt upgrade -y
```

### 3. Clone Repository

```bash
git clone https://github.com/your-org/freshtrack-pro.git /opt/freshtrack-pro
cd /opt/freshtrack-pro
```

**Note:** The deployment script can also clone the repository automatically. See Configuration section for `GIT_REPO_URL` and `GIT_BRANCH` settings.

---

## Configuration

### 1. Create Configuration File

```bash
cp scripts/deploy.config.example scripts/deploy.config
```

### 2. Edit Configuration

```bash
nano scripts/deploy.config
```

**Required settings:**

```bash
# Domain (must match DNS configuration)
DOMAIN=yourdomain.com
ADMIN_EMAIL=admin@yourdomain.com

# Database credentials (generate strong password)
POSTGRES_PASSWORD=your-secure-password-here

# Stack Auth credentials (from Stack Auth dashboard)
STACK_AUTH_PROJECT_ID=your-project-id
STACK_AUTH_PUBLISHABLE_KEY=pk_...
STACK_AUTH_SECRET_KEY=sk_...
```

**Optional settings:**

```bash
# Grafana admin password (auto-generated if omitted)
GRAFANA_ADMIN_PASSWORD=

# MinIO credentials (auto-generated if omitted)
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=

# Deployment settings
VERSION_RETENTION=3  # Keep last 3 deployments for rollback
HEALTH_CHECK_TIMEOUT=30  # Seconds between health check attempts
HEALTH_CHECK_RETRIES=30  # Max attempts (30×30s = 15 min total)

# Git repository (if not already cloned)
GIT_REPO_URL=https://github.com/your-org/freshtrack-pro.git
GIT_BRANCH=main
```

**Generate secure passwords:**

```bash
# PostgreSQL password
openssl rand -base64 32

# Grafana password
openssl rand -base64 16
```

See `scripts/deploy.config.example` for all available options and detailed comments.

---

## Deployment

### Step 1: Clone Repository

```bash
ssh root@YOUR_SERVER_IP
git clone https://github.com/your-org/freshtrack-pro.git /opt/freshtrack-pro
cd /opt/freshtrack-pro
```

### Step 2: Run Automated Deployment

```bash
chmod +x scripts/deploy-automated.sh
sudo ./scripts/deploy-automated.sh
```

The script orchestrates 5 phases with checkpoint-based recovery:

| Phase | Name                | What It Does                               | Duration    |
| ----- | ------------------- | ------------------------------------------ | ----------- |
| 1     | Pre-flight          | Validates RAM, disk, network, OS           | ~10 sec     |
| 2     | Prerequisites       | Installs Docker, UFW, fail2ban, jq         | 2-5 min     |
| 3     | Configuration       | Prompts for domain, email, Stack Auth      | Interactive |
| 4     | Deployment          | Calls deploy.sh (builds, migrates, starts) | 5-15 min    |
| 5     | Health Verification | Waits for services to report healthy       | 1-5 min     |

**Total time:** 15-30 minutes for first deployment

### Step 3: Follow Interactive Prompts

During the Configuration phase, you'll be prompted for:

```
Enter your domain name (e.g., app.freshtrack.io): _
Enter admin email (for SSL certificates): _
Enter Stack Auth Project ID: _
Enter Stack Auth Publishable Key: _
Enter Stack Auth Secret Key: _
```

**Tip:** Have your Stack Auth credentials ready before starting.

### Step 4: Monitor Progress

The script provides real-time progress output:

```
========================================
FreshTrack Pro Automated Deployment
========================================

Start time: 2026-01-29 10:00:00

[1/5] Pre-flight checks...
  ✓ RAM: 8GB (minimum: 4GB)
  ✓ Disk: 100GB free (minimum: 10GB)
  ✓ OS: Ubuntu 24.04 LTS
  ✓ Network: Can reach docker.com

[2/5] Installing prerequisites...
  ✓ Docker installed
  ✓ UFW firewall configured
  ✓ fail2ban installed

[3/5] Configuration...
  ✓ Domain configured: app.example.com
  ✓ Secrets generated

[4/5] Deploying services...
  ✓ Building images...
  ✓ Running migrations...
  ✓ Starting services...

[5/5] Verifying health...
  Waiting for backend... (attempt 1/60)
  Waiting for backend... (attempt 2/60)
  ✓ All services healthy

========================================
     FreshTrack Pro Deployment Complete!
========================================

Access URLs:
  Dashboard:    https://app.example.com
  API:          https://app.example.com/api
  Health:       https://app.example.com/api/health
  Monitoring:   https://monitoring.app.example.com
```

### Checkpoint-Based Recovery

If deployment fails or is interrupted, simply re-run the script:

```bash
sudo ./scripts/deploy-automated.sh
```

The script automatically resumes from the last successful checkpoint. Completed phases are skipped.

**Example recovery output:**

```
[1/5] Pre-flight checks... SKIPPED (checkpoint exists)
[2/5] Installing prerequisites... SKIPPED (checkpoint exists)
[3/5] Configuration... SKIPPED (checkpoint exists)
[4/5] Deploying services... Resuming...
```

**To start fresh (clear all checkpoints):**

```bash
sudo ./scripts/deploy-automated.sh --reset
```

### DNS Check Behavior

The script checks DNS resolution with 5 retries before requesting SSL certificates:

1. Retrieves server public IP from `ifconfig.me` or `icanhazip.com`
2. Resolves domain via `dig +short`
3. Compares resolved IP with server IP
4. Retries 5 times with 10-second delays if mismatch
5. Aborts deployment if DNS not configured after retries

This prevents Let's Encrypt rate limit exhaustion (5 failed authorizations per hour).

### Health Check Behavior

After starting services, the script validates deployment health:

1. Makes HTTP request to `http://localhost:3000/health`
2. Verifies response contains `{"status":"healthy"}`
3. Retries up to 60 times with 5-second delays (5-minute total window)
4. If health checks fail, check logs with `docker compose logs`

---

## Verification

After deployment completes, run the verification script to validate all components:

```bash
./scripts/verify-deployment.sh your-domain.com
```

The script performs 6 verification checks:

| Check              | Code      | What It Validates                                    |
| ------------------ | --------- | ---------------------------------------------------- |
| Service Health     | VERIFY-01 | Backend, frontend, worker endpoints return 200       |
| SSL Certificate    | VERIFY-02 | Certificate valid, trusted, >30 days until expiry    |
| Dashboard Access   | VERIFY-03 | Dashboard accessible via HTTPS (curl 200 OK)         |
| E2E Pipeline       | VERIFY-04 | Sensor data flows through system (if TTN configured) |
| Monitoring Stack   | VERIFY-05 | Prometheus and Grafana accessible                    |
| Consecutive Health | VERIFY-06 | Dashboard passes 3 consecutive health checks         |

**Expected output:**

```
========================================
FreshTrack Pro Deployment Verification
========================================
Domain: app.example.com

==> Checking container status...
  ✓ backend: running
  ✓ postgres: running
  ✓ redis: running
  ✓ caddy: running

==> VERIFY-01: Checking all service endpoints...
  ✓ Backend API is healthy (HTTP 200)
  ✓ Frontend is healthy (HTTP 200)

==> VERIFY-02: Validating SSL certificate...
  ✓ SSL Certificate valid (87 days remaining)

==> VERIFY-03 + VERIFY-06: Dashboard accessibility (3 consecutive passes)...
  [PASS] Attempt 1: consecutive 1/3
  [PASS] Attempt 2: consecutive 2/3
  [PASS] Attempt 3: consecutive 3/3
  ✓ Dashboard verified (3 consecutive passes)

==> VERIFY-05: Checking monitoring stack...
  ✓ Prometheus is healthy (HTTP 200)
  ✓ Grafana is healthy (HTTP 200)

========================================
       DEPLOYMENT VERIFIED & LIVE
========================================
```

### Manual Verification

You can also verify manually:

```bash
# Check service health
curl https://your-domain.com/api/health

# Check SSL certificate
echo | openssl s_client -connect your-domain.com:443 2>/dev/null | openssl x509 -noout -dates

# Check container status
docker compose ps
```

---

## Post-Deployment

Run the post-deployment script to complete setup:

```bash
./scripts/post-deploy.sh your-domain.com
```

The script performs 5 setup steps:

| Step         | Code    | What It Does                                  |
| ------------ | ------- | --------------------------------------------- |
| URL Summary  | POST-01 | Displays all service URLs                     |
| Credentials  | POST-02 | Shows credentials (terminal only, not logged) |
| Demo Data    | POST-03 | Seeds sample organization and sensor data     |
| Grafana Note | POST-04 | Confirms dashboards are provisioned           |
| Next Steps   | POST-05 | Displays 5-step onboarding guide              |

**Expected output:**

```
========================================
FreshTrack Pro Post-Deployment Setup
========================================
Domain: app.example.com

==> POST-01: Displaying service URLs...

  Dashboard:  https://app.example.com
  API:        https://app.example.com/api/health
  Grafana:    https://app.example.com/grafana
  Prometheus: https://app.example.com/prometheus
  Bull Board: https://app.example.com/api/admin/queues

==> POST-02: Displaying credentials (terminal only)...
========================================
  CREDENTIAL SUMMARY (Terminal Only)
========================================
PostgreSQL: abcd...wxyz
Grafana:    efgh...uvwx
...

==> POST-03: Seeding demo data...
  ✓ Demo organization created
  ✓ Sample site created
  ✓ Sensor readings seeded

==> POST-04: Grafana dashboards...
  Pre-configured dashboards automatically provisioned:
    - FreshTrack Pro Overview
    - FreshTrack Sensor Metrics

==> POST-05: Next steps...
========================================
       NEXT STEPS
========================================
  1. Sign up at https://app.example.com/signup
  2. Create organization in dashboard
  3. Invite team members
  4. Configure TTN integration
  5. Set up alerting rules
```

### Access Your Application

After post-deployment completes:

| Service    | URL                                      | Credentials             |
| ---------- | ---------------------------------------- | ----------------------- |
| Dashboard  | https://your-domain.com                  | Sign up to create admin |
| Grafana    | https://your-domain.com/grafana          | admin / (from secrets)  |
| Prometheus | https://your-domain.com/prometheus       | None (internal)         |
| Bull Board | https://your-domain.com/api/admin/queues | None (admin only)       |

### SSH Tunnel for Prometheus

If Prometheus is not exposed publicly, access via SSH tunnel:

```bash
# From your local machine
ssh -L 9090:localhost:9090 root@YOUR_SERVER_IP

# Then access: http://localhost:9090
```

### Set Up Backups

Verify backup job is running:

```bash
docker compose logs postgres_backup
```

Expected output:

```
postgres_backup | Backup cron job scheduled: 0 2 * * *
postgres_backup | Daily backups at 2 AM UTC to MinIO
```

**Backup details:**

- Schedule: Daily at 2 AM UTC
- Format: pg_dump custom format with compression level 9
- Retention: 30 days (client-side, enforced by backup script)
- Storage: MinIO S3-compatible bucket
- Notifications: Webhook on failure (3 retries with exponential backoff)

See [docs/DATABASE.md](DATABASE.md) for backup and restore procedures.

### Access MinIO (Backup Storage)

MinIO is accessible only via localhost for security:

```bash
# SSH tunnel from local machine
ssh -L 9001:localhost:9001 root@YOUR_SERVER_IP

# Access MinIO console: http://localhost:9001
# Login: MINIO_ACCESS_KEY / MINIO_SECRET_KEY from config
```

### SSL Certificate Monitoring

Blackbox Exporter monitors SSL certificate expiry:

- Warning alert: 30 days before expiry
- Critical alert: 7 days before expiry

View alerts in Grafana dashboard.

---

## Rollback Procedures

### Automatic Rollback

The deployment script automatically rolls back if health checks fail:

- Previous 3 versions retained (configurable via `VERSION_RETENTION`)
- Code-only rollback (database unchanged)
- Previous Docker images restored
- Services restarted with restored images
- Rollback health check performed

**Automatic rollback flow:**

1. Health check fails after 30 attempts (15 minutes)
2. Script retrieves previous version from `.deployment-history`
3. Stops current deployment
4. Restores Docker images from previous version tag
5. Starts services with restored images
6. Verifies rollback health

### Manual Rollback

If you need to manually rollback to a previous version:

#### 1. Check Available Versions

```bash
cd /opt/freshtrack-pro
cat .deployment-history
```

Output example:

```
v1.2.3-20260124-142315
v1.2.2-20260123-103045
v1.2.1-20260122-091230
```

Most recent version is at the top. Older versions beyond `VERSION_RETENTION` are automatically pruned.

#### 2. Stop Current Deployment

```bash
docker compose -f docker-compose.yml \
               -f docker/compose.prod.yaml \
               -f docker/compose.selfhosted.yaml \
               down --timeout 30
```

#### 3. Restore Previous Version's Images

```bash
# Choose version from .deployment-history
PREVIOUS_VERSION="v1.2.2-20260123-103045"

# Restore backend
docker tag freshtrack-backend:$PREVIOUS_VERSION freshtrack-backend:latest

# Restore frontend
docker tag freshtrack-frontend:$PREVIOUS_VERSION freshtrack-frontend:latest
```

#### 4. Start Services

```bash
docker compose -f docker-compose.yml \
               -f docker/compose.prod.yaml \
               -f docker/compose.selfhosted.yaml \
               up -d
```

#### 5. Verify Rollback

```bash
# Check health endpoint
curl http://localhost:3000/health

# Check service status
docker compose ps

# Monitor logs
docker compose logs -f backend
```

### Database Considerations

**Important:** Rollback is code-only. The database is NOT rolled back automatically.

**Why code-only:**

- Database rollback is complex and risky
- Migrations are forward-only (per Phase 10 database practices)
- Schema changes must be backwards-compatible
- Rolling back code to previous version is safe and fast

**If deployment included database migrations:**

- Forward-only migrations (no automatic schema rollback)
- Previous code version must be compatible with new schema
- If schema change broke app, restore from backup

**Database restore procedure:**

See [docs/DATABASE.md](DATABASE.md) for complete restoration procedures. Quick reference:

```bash
# Test restore (non-destructive)
./scripts/test-restore.sh

# Production restore (destructive)
# WARNING: Stops services, drops database, restores from backup
./scripts/restore-backup.sh /path/to/backup.dump
```

**Recovery Time Objective (RTO):** 30 minutes
**Recovery Point Objective (RPO):** 24 hours (daily backup schedule)

---

## Troubleshooting

This section covers common deployment issues and their solutions, organized by deployment phase.

### Quick Diagnosis

Before diving into specific issues, gather diagnostic information:

```bash
# Check deployment checkpoint state
cat .deploy-state/checkpoints.txt 2>/dev/null || echo "No checkpoints found"

# Check which phase failed (look for last successful checkpoint)
ls -la .deploy-state/

# Check service status
docker compose ps

# Check recent logs
docker compose logs --tail=50
```

### Pre-flight Failures

Pre-flight checks validate your system meets minimum requirements before deployment begins.

#### "Insufficient RAM" Error

**Symptom:** `Pre-flight failed: RAM 4GB is below minimum 8GB`

**Cause:** System has less than 8GB RAM (FreshTrack Pro requires 8GB minimum)

**Solution:**

1. Check current RAM: `free -h`
2. Either:
   - Upgrade server to 8GB+ RAM, or
   - Set override (not recommended): `PREFLIGHT_SKIP_RAM=true ./scripts/deploy-automated.sh`

**Warning:** Running with less than 8GB RAM may cause OOM kills during deployment.

#### "Insufficient Disk Space" Error

**Symptom:** `Pre-flight failed: Disk space 8GB is below minimum 10GB`

**Cause:** Less than 10GB free disk space

**Solution:**

```bash
# Check disk usage
df -h

# Clean up Docker (if previous failed deployments)
docker system prune -a

# Clean up apt cache
sudo apt clean

# Retry deployment
sudo ./scripts/deploy-automated.sh
```

#### "Network Unreachable" Error

**Symptom:** `Pre-flight failed: Cannot reach docker.com`

**Cause:** Server cannot reach external networks (required for Docker install, apt packages)

**Solution:**

1. Check DNS resolution: `dig docker.com`
2. Check firewall outbound rules: `sudo ufw status`
3. Check if behind proxy: configure `HTTP_PROXY` if needed
4. Test connectivity: `curl -I https://docker.com`

### Checkpoint Recovery Failures

The deployment script uses checkpoints to track progress. If a checkpoint is corrupted or stale, deployment may fail to resume correctly.

#### "Checkpoint exists but state is invalid"

**Symptom:** Script says checkpoint exists but deployment state is inconsistent

**Solution:**

```bash
# View checkpoint state
cat .deploy-state/checkpoints.txt

# Clear specific checkpoint (e.g., deploy-deployment)
rm .deploy-state/checkpoints.txt  # Clears all checkpoints

# Or reset completely
sudo ./scripts/deploy-automated.sh --reset
```

#### Script Hangs at "Resuming from checkpoint"

**Symptom:** Script appears stuck after detecting checkpoint

**Cause:** Previous deployment left services in partial state

**Solution:**

```bash
# Stop all containers
docker compose down --timeout 30

# Clear checkpoints
rm -rf .deploy-state/checkpoints.txt

# Retry
sudo ./scripts/deploy-automated.sh
```

#### "Checkpoint file not writable"

**Symptom:** `Error: Cannot write to .deploy-state/checkpoints.txt`

**Cause:** Permission issues (usually when script was run as different user)

**Solution:**

```bash
# Fix ownership
sudo chown -R $(whoami):$(whoami) .deploy-state/

# Or remove and let script recreate
sudo rm -rf .deploy-state/
sudo ./scripts/deploy-automated.sh
```

### DNS Check Fails

**Symptom:** "DNS resolution failed for yourdomain.com"

**Cause:** Domain not pointing to server IP or DNS not propagated

**Solution:**

1. Verify DNS records in your provider dashboard:

   ```
   Type: A
   Name: yourdomain.com (or @)
   Value: YOUR_SERVER_IP
   TTL: 300 (or 3600)
   ```

2. Check propagation status:

   ```bash
   dig yourdomain.com +short
   # Should return: YOUR_SERVER_IP
   ```

3. If different IP returned, wait for propagation (typically 5-60 minutes)

4. Retry deployment after DNS propagates:
   ```bash
   sudo ./scripts/deploy-automated.sh
   ```

**DNS propagation checkers:**

- https://dnschecker.org
- https://www.whatsmydns.net

### Health Check Fails

**Symptom:** "Health check failed after 30 attempts"

**Causes and solutions:**

**1. Backend not starting:**

```bash
# Check backend logs
docker compose logs backend

# Common issues:
# - Database connection error → check postgres logs
# - Missing environment variable → check secrets files
# - Port conflict → check if port 3000 in use
```

**2. Database not ready:**

```bash
# Check database status
docker compose logs postgres

# Verify database is accepting connections
docker compose exec postgres pg_isready -U freshtrack_user

# Common issues:
# - Insufficient memory → check `docker stats`
# - Corrupted data → restore from backup
```

**3. Resource exhaustion:**

```bash
# Check resource usage
docker stats

# Check disk space
df -h

# Check memory
free -h

# Solution: Increase resources or scale down services
```

**4. Migration failure:**

```bash
# Check if migrations ran
docker compose logs backend | grep migration

# Manually run migrations
docker compose exec backend npm run migrate
```

### SSL Certificate Not Issued

**Symptom:** Browser shows certificate error or "Connection is not secure"

**Causes and solutions:**

**1. DNS not configured:**

```bash
# Verify DNS points to server
dig yourdomain.com +short

# Should match server IP
curl -s ifconfig.me
```

**2. Port 80 not accessible:**

```bash
# Check firewall allows port 80
sudo ufw status

# Should show:
# 80/tcp    ALLOW       Anywhere

# Test from external machine
curl -I http://yourdomain.com
```

**3. Let's Encrypt rate limit hit:**

Let's Encrypt limits:

- 5 failed authorizations per hour per account
- 50 certificates per registered domain per week
- 300 pending authorizations per account

**Solution:**

- Wait 1 hour if hit 5 failures/hour limit
- Use staging environment for testing

**Staging environment test:**

Edit `docker/caddy/Caddyfile` temporarily:

```caddyfile
{
    acme_ca https://acme-staging-v02.api.letsencrypt.org/directory
}
```

Staging issues untrusted certificates (expected). Verify Caddy can obtain cert, then switch back to production.

**4. Caddy logs show errors:**

```bash
# Check Caddy logs
docker compose logs caddy

# Common errors:
# - "Challenge failed" → DNS or port 80 issue
# - "Rate limit exceeded" → wait 1 hour
# - "DNS problem" → DNS not propagated yet
```

See [docs/SSL_CERTIFICATES.md](SSL_CERTIFICATES.md) for detailed SSL troubleshooting and wildcard certificate setup.

### Verification Script Failures

The `verify-deployment.sh` script performs 6 checks. Here's how to troubleshoot each:

#### VERIFY-01: Service Health Endpoint Failures

**Symptom:** `Backend API verification failed after 3 attempts (Last status: 000)`

**Cause:** Backend not responding or unreachable

**Solution:**

```bash
# Check if backend container is running
docker compose ps backend

# Check backend logs for errors
docker compose logs --tail=100 backend

# Common issues:
# - Database not ready: wait 30 seconds, retry
# - Missing env vars: check .env.production
# - Port conflict: check `lsof -i :3000`
```

#### VERIFY-02: SSL Certificate Failures

**Symptom:** `SSL Certificate EXPIRED` or `Cannot connect to https://domain`

**Causes and solutions:**

1. **Certificate not issued yet:**

   ```bash
   # Check Caddy logs
   docker compose logs caddy | grep -i "certificate"

   # Wait for Let's Encrypt (can take 1-2 minutes on first deploy)
   sleep 120
   ./scripts/verify-deployment.sh your-domain.com
   ```

2. **DNS not pointing to server:**

   ```bash
   # Check DNS resolution
   dig your-domain.com +short

   # Should return your server IP
   curl -s ifconfig.me
   ```

3. **Port 80 blocked (Let's Encrypt needs HTTP-01 challenge):**

   ```bash
   # Check firewall
   sudo ufw status | grep 80

   # Should show: 80/tcp ALLOW Anywhere
   ```

#### VERIFY-03/VERIFY-06: Dashboard Accessibility Failures

**Symptom:** `Dashboard failed to achieve 3 consecutive passes`

**Cause:** Dashboard returning non-200 responses intermittently

**Solution:**

```bash
# Check what status code is returned
curl -I https://your-domain.com

# Check Caddy proxy logs
docker compose logs caddy

# Check frontend container
docker compose logs frontend

# Common issues:
# - Frontend build failed: check for npm errors in logs
# - Caddy misconfigured: check Caddyfile syntax
```

#### VERIFY-04: E2E Pipeline Test Failures

**Symptom:** `E2E sensor pipeline test failed`

**Note:** This test only runs if `TTN_WEBHOOK_SECRET` is set.

**Solution:**

```bash
# Check if TTN is configured
grep TTN_WEBHOOK_SECRET .env.production

# If not using TTN, this test is skipped (normal)
# If using TTN, check webhook endpoint:
curl -X POST https://your-domain.com/api/webhooks/ttn \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

#### VERIFY-05: Monitoring Stack Failures

**Symptom:** `Prometheus verification failed` or `Grafana verification failed`

**Note:** Monitoring failures are warnings, not blockers.

**Solution:**

```bash
# Check Prometheus
docker compose logs prometheus

# Check Grafana
docker compose logs grafana

# Verify monitoring URLs (may require auth)
curl -I https://your-domain.com/prometheus/-/healthy
curl -I https://your-domain.com/grafana/api/health
```

### Service Won't Start

**Symptom:** Container restarts repeatedly or shows `Restarting` status

**Diagnosis:**

```bash
# Check service status
docker compose ps

# Check logs for specific service
docker compose logs <service-name>

# Check resource limits
docker stats
```

**Common causes:**

**1. Missing secrets:**

```bash
# Verify secrets exist
ls -la /opt/freshtrack-pro/secrets/

# Should show:
# -rw------- postgres_password.txt
# -rw------- database_url.txt
# -rw------- stack_auth_secret.txt
# -rw------- grafana_admin_password.txt
# -rw------- minio_access_key.txt
# -rw------- minio_secret_key.txt

# Recreate if missing
sudo ./scripts/deploy-automated.sh
```

**2. Resource limits exceeded:**

Production resource limits (from `docker/compose.prod.yaml`):

```yaml
backend:
  cpus: '2'
  memory: 2048M

postgres:
  cpus: '2'
  memory: 2048M

caddy:
  cpus: '0.5'
  memory: 512M
```

**Solution:**

- Increase server resources, or
- Adjust limits in `docker/compose.prod.yaml`

**3. Port conflict:**

```bash
# Check if port in use
sudo lsof -i :3000
sudo lsof -i :5432

# Solution: Stop conflicting service or change port
```

### Deployment Webhook Notifications Not Received

**Symptom:** No Slack/Discord notification after deployment

**Cause:** Webhook URL not configured or unreachable

**Solution:**

```bash
# Verify webhook URL in config
grep BACKUP_WEBHOOK_URL scripts/deploy.config

# Test webhook manually
curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
  -H 'Content-Type: application/json' \
  -d '{"text":"Test notification"}'

# Check deployment logs
docker compose logs postgres_backup | grep webhook
```

**Note:** Webhook failures do NOT cause deployment rollback (exit 0 on notification failure).

### Error Quick Reference

| Error Message                           | Phase  | Likely Cause          | Quick Fix                     |
| --------------------------------------- | ------ | --------------------- | ----------------------------- |
| `Pre-flight failed: RAM below minimum`  | 1      | Insufficient RAM      | Upgrade to 8GB+               |
| `Pre-flight failed: Disk below minimum` | 1      | Insufficient disk     | Run `docker system prune -a`  |
| `Cannot reach docker.com`               | 1      | Network blocked       | Check firewall outbound       |
| `Docker install failed`                 | 2      | apt lock or network   | Wait 5 min, retry             |
| `UFW configuration failed`              | 2      | UFW not installed     | `apt install ufw`             |
| `Domain validation failed`              | 3      | Invalid domain format | Use FQDN like app.example.com |
| `DNS resolution failed`                 | 4      | DNS not propagated    | Wait, check `dig domain`      |
| `Health check failed after N attempts`  | 5      | Service not starting  | Check `docker compose logs`   |
| `VERIFY-01: Backend unhealthy`          | Verify | Backend error         | `docker compose logs backend` |
| `VERIFY-02: SSL invalid`                | Verify | Cert not issued       | Check Caddy logs, port 80     |
| `VERIFY-03: Dashboard 502`              | Verify | Frontend not ready    | Wait 60s, retry               |
| `POST-03: Seed failed`                  | Post   | DB not ready          | `./scripts/seed-demo-data.sh` |

### Getting Help

If you cannot resolve an issue:

1. **Gather diagnostics:**

   ```bash
   # Create diagnostic bundle
   mkdir -p /tmp/freshtrack-diag
   docker compose ps > /tmp/freshtrack-diag/containers.txt
   docker compose logs --tail=200 > /tmp/freshtrack-diag/logs.txt
   cat .deploy-state/checkpoints.txt > /tmp/freshtrack-diag/checkpoints.txt 2>/dev/null
   cat /etc/os-release > /tmp/freshtrack-diag/os.txt
   free -h > /tmp/freshtrack-diag/memory.txt
   df -h > /tmp/freshtrack-diag/disk.txt
   ```

2. **Check documentation:**
   - [SSL Certificates](SSL_CERTIFICATES.md) - Certificate troubleshooting
   - [Database Operations](DATABASE.md) - Database issues
   - [Production Deployment](PRODUCTION_DEPLOYMENT.md) - Advanced configuration

3. **Report issue:**
   - GitHub Issues: Include diagnostic bundle
   - Email: admin@yourdomain.com

---

## Maintenance

### Updates

Deploy new version:

```bash
cd /opt/freshtrack-pro
git pull origin main
sudo ./scripts/deploy-automated.sh
```

The script handles:

- Git repository updates
- Docker image rebuilds
- Database migrations (if any)
- Health check validation
- Automatic rollback on failure

### Monitoring

**System metrics:**

- Grafana dashboard: https://monitoring.yourdomain.com
- CPU, memory, disk, network usage
- Docker container stats
- node_exporter metrics (port 9100)

**Application logs:**

- Centralized in Loki
- View via Grafana Explore interface
- Filter by service, time range, log level

**SSL expiry:**

- Blackbox exporter monitors certificate expiry
- Alerts at 30 days (warning) and 7 days (critical)
- View in Grafana alerting dashboard

### Backup Verification

**Monthly restore test (recommended):**

```bash
# Non-destructive test restore to temporary database
./scripts/test-restore.sh

# Expected output:
# ✓ Latest backup found: /backups/freshtrack_20260124_020001.dump
# ✓ Created test database: freshtrack_restore_test
# ✓ Restored backup successfully
# ✓ Verified table count: 42 tables
# ✓ Test database dropped
```

**Verify backup exists:**

```bash
# List backups in MinIO
docker compose exec postgres_backup ls -lh /backups/

# Should show daily backups for last 30 days
```

See [docs/DATABASE.md](DATABASE.md) for complete backup and restore documentation.

### Log Rotation

Logs are managed by Docker's logging driver:

**Loki-compatible services:**

```yaml
logging:
  driver: loki
  options:
    loki-url: 'http://localhost:3100/loki/api/v1/push'
    max-size: '10m'
    max-file: '3'
```

**Loki itself (json-file driver):**

```yaml
logging:
  driver: json-file
  options:
    max-size: '10m'
    max-file: '3'
```

**Retention:** 3 files × 10 MB = 30 MB per service (configurable)

### Security Updates

**System packages:**

```bash
# Update Ubuntu packages monthly
apt update && apt upgrade -y

# Restart if kernel updated
reboot
```

**Docker images:**

```bash
# Pull latest images
cd /opt/freshtrack-pro
docker compose pull

# Deploy with health check validation
sudo ./scripts/deploy-automated.sh
```

**fail2ban status:**

```bash
# Check banned IPs
sudo fail2ban-client status sshd

# Unban IP if needed
sudo fail2ban-client set sshd unbanip <IP>
```

### Firewall Management

```bash
# View current rules
sudo ufw status numbered

# Allow additional port (if needed)
sudo ufw allow 8080/tcp comment 'Custom service'

# Delete rule
sudo ufw delete <rule-number>

# Reload firewall
sudo ufw reload
```

**Current firewall configuration:**

- Port 22 (SSH): Required for remote access
- Port 80 (HTTP): Required for Let's Encrypt HTTP-01 challenge
- Port 443 (HTTPS): Production traffic

All other services bound to localhost (127.0.0.1) and not exposed.

### Version History

**View deployment history:**

```bash
cat /opt/freshtrack-pro/.deployment-history
```

**View current version:**

```bash
cat /opt/freshtrack-pro/.deployment-version
```

**Prune old Docker images:**

```bash
# Remove unused images (careful: removes all unused images)
docker image prune -a

# Or use automatic pruning from deployment script
# Keeps VERSION_RETENTION versions (default: 3)
```

---

## Related Documentation

- [SSL Certificate Configuration](SSL_CERTIFICATES.md) - HTTP-01 vs DNS-01 challenges, wildcard certificates
- [Database Operations](DATABASE.md) - Backup, restore, disaster recovery procedures
- [Production Deployment (general)](PRODUCTION_DEPLOYMENT.md) - Multi-environment deployment patterns

---

## Quick Reference

### Essential Commands

```bash
# Deploy or update
sudo ./scripts/deploy-automated.sh

# View logs
docker compose logs -f [service-name]

# Restart service
docker compose restart [service-name]

# Check health
curl http://localhost:3000/health

# Manual rollback
docker tag freshtrack-backend:<VERSION> freshtrack-backend:latest
docker compose up -d

# Test backup restore
./scripts/test-restore.sh

# View deployment history
cat .deployment-history
```

### File Locations

```
/opt/freshtrack-pro/               # Application directory
├── docker-compose.yml             # Base services
├── docker/
│   ├── compose.prod.yaml          # Production config
│   └── compose.selfhosted.yaml    # Self-hosted overrides
├── scripts/
│   ├── deploy-automated.sh       # Deployment script
│   ├── deploy.config              # Configuration (gitignored)
│   └── test-restore.sh            # Backup test script
├── secrets/                       # Secret files (600 permissions)
│   ├── postgres_password.txt
│   ├── database_url.txt
│   ├── stack_auth_secret.txt
│   ├── grafana_admin_password.txt
│   ├── minio_access_key.txt
│   └── minio_secret_key.txt
├── .deployment-version            # Current version tag
└── .deployment-history            # Version history (last 3)
```

### Monitoring URLs

- Application: https://yourdomain.com
- Grafana: https://monitoring.yourdomain.com
- Prometheus: http://localhost:9090 (SSH tunnel)
- MinIO: http://localhost:9001 (SSH tunnel)

---

**Last updated:** 2026-01-29
**Phase:** 37-documentation
**Version:** 1.2
