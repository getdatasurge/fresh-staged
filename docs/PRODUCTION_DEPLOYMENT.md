# Production Deployment Guide

Complete guide for deploying FreshTrack Pro to production infrastructure.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Server Setup](#initial-server-setup)
3. [Configuration](#configuration)
4. [Deployment](#deployment)
5. [Monitoring](#monitoring)
6. [Maintenance](#maintenance)
7. [Troubleshooting](#troubleshooting)
8. [Rollback Procedures](#rollback-procedures)

---

## Prerequisites

### Infrastructure Requirements

**Server Specifications (Minimum):**

- **CPU:** 4 cores (2.4 GHz+)
- **RAM:** 8 GB
- **Storage:** 100 GB SSD (database growth + logs)
- **Network:** Static IP address, 100 Mbps bandwidth
- **OS:** Ubuntu 22.04 LTS (recommended) or Debian 11+

**Recommended Providers:**

- DigitalOcean Droplet (4 vCPU, 8GB RAM, $48/month)
- Linode Dedicated CPU (4 Core, 8GB RAM, $36/month)
- AWS EC2 (t3.large or c5.xlarge)
- Hetzner Cloud (CPX31, €13.90/month)

### External Services

Before deployment, set up accounts and obtain credentials for:

**Required:**

- [x] **Stack Auth** - Authentication service
  - Sign up: https://stack-auth.com
  - Create project, obtain: Project ID, Publishable Key, Secret Key

- [x] **Domain Name** - DNS for production
  - Register domain (e.g., freshtrackpro.com)
  - DNS provider with API support (Cloudflare recommended)

**Optional but Recommended:**

- [ ] **Stripe** - Payment processing (for subscriptions)
  - Sign up: https://stripe.com
  - Obtain: Secret Key, Webhook Secret
  - Dashboard: https://dashboard.stripe.com/apikeys

- [ ] **Resend** - Email delivery (for notifications, digests)
  - Sign up: https://resend.com
  - Obtain: API Key
  - Dashboard: https://resend.com/api-keys

- [ ] **Telnyx** - SMS notifications
  - Sign up: https://telnyx.com
  - Obtain: API Key, Messaging Profile ID, Phone Number

- [ ] **The Things Network (TTN)** - LoRaWAN integration
  - Sign up: https://www.thethingsnetwork.org
  - Create application, obtain: App ID, API Key

- [ ] **Sentry** - Error tracking (optional)
  - Sign up: https://sentry.io
  - Create project, obtain: DSN

### Local Tools

Install on your local machine (for deployment):

- [x] **Git** - Version control
- [x] **SSH** - Server access
- [x] **Docker** - For testing builds locally (optional)

---

## Initial Server Setup

### 1. Provision Server

**DigitalOcean Example:**

```bash
# Via DigitalOcean CLI (optional)
doctl compute droplet create freshtrack-prod \
  --image ubuntu-22-04-x64 \
  --size s-4vcpu-8gb \
  --region nyc3 \
  --ssh-keys YOUR_SSH_KEY_ID

# Note the public IP address
export PROD_SERVER_IP="159.89.123.456"
```

**Or provision via web console for any provider.**

### 2. Initial Server Configuration

SSH into your server:

```bash
ssh root@$PROD_SERVER_IP
```

#### Update System

```bash
apt update && apt upgrade -y
apt install -y curl wget git vim ufw fail2ban
```

#### Create Application User

```bash
# Create non-root user for application
useradd -m -s /bin/bash freshtrack
usermod -aG sudo freshtrack

# Set password
passwd freshtrack

# Add SSH key for key-based auth
mkdir -p /home/freshtrack/.ssh
cp /root/.ssh/authorized_keys /home/freshtrack/.ssh/
chown -R freshtrack:freshtrack /home/freshtrack/.ssh
chmod 700 /home/freshtrack/.ssh
chmod 600 /home/freshtrack/.ssh/authorized_keys
```

#### Configure Firewall

```bash
# Allow SSH, HTTP, HTTPS
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp

# Enable firewall
ufw --force enable
ufw status
```

#### Configure Fail2Ban (brute-force protection)

```bash
# Enable SSH protection
systemctl enable fail2ban
systemctl start fail2ban
```

### 3. Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Add user to docker group
usermod -aG docker freshtrack

# Enable Docker service
systemctl enable docker
systemctl start docker

# Verify installation
docker --version
docker compose version
```

### 4. Create Application Directory

```bash
# Switch to application user
su - freshtrack

# Create directory structure
mkdir -p /opt/freshtrack-pro
cd /opt/freshtrack-pro

# Set permissions
sudo chown -R freshtrack:freshtrack /opt/freshtrack-pro
```

### 5. Clone Repository

```bash
cd /opt/freshtrack-pro

# Clone via HTTPS (recommended for production)
git clone https://github.com/your-org/freshtrack-pro.git .

# Or via SSH (if you've set up deploy keys)
git clone git@github.com:your-org/freshtrack-pro.git .

# Checkout production branch or tag
git checkout main  # or specific tag: v1.0.0
```

---

## Configuration

### 1. Generate Secrets

```bash
cd /opt/freshtrack-pro

# Generate all required secrets
openssl rand -base64 32 > secrets/postgres_password.txt
openssl rand -base64 32 > secrets/jwt_secret.txt
openssl rand -base64 32 > secrets/minio_password.txt
openssl rand -base64 32 > secrets/grafana_password.txt
echo "freshtrack-minio-admin" > secrets/minio_user.txt

# Add Stack Auth secret (from Stack Auth dashboard)
echo "YOUR_STACK_AUTH_SECRET" > secrets/stack_auth_secret.txt

# Set secure permissions
chmod 600 secrets/*.txt

# Verify
ls -la secrets/
```

**Expected output:**

```
-rw------- 1 freshtrack freshtrack   45 Jan 23 10:00 grafana_password.txt
-rw------- 1 freshtrack freshtrack   45 Jan 23 10:00 jwt_secret.txt
-rw------- 1 freshtrack freshtrack   45 Jan 23 10:00 minio_password.txt
-rw------- 1 freshtrack freshtrack   30 Jan 23 10:00 minio_user.txt
-rw------- 1 freshtrack freshtrack   45 Jan 23 10:00 postgres_password.txt
-rw------- 1 freshtrack freshtrack   45 Jan 23 10:00 stack_auth_secret.txt
```

### 2. Configure Environment Variables

```bash
cd /opt/freshtrack-pro

# Copy template
cp .env.production.example .env.production

# Edit with your values
nano .env.production
```

**Update these critical values:**

```bash
# Domain configuration
DOMAIN=freshtrackpro.com
FRONTEND_URL=https://app.freshtrackpro.com
API_URL=https://api.freshtrackpro.com
APP_URL=https://app.freshtrackpro.com
MONITORING_URL=https://monitoring.freshtrackpro.com
STATUS_URL=https://status.freshtrackpro.com

# Stack Auth (REQUIRED - compose will fail without these)
STACK_AUTH_PROJECT_ID=your-actual-project-id
STACK_AUTH_PUBLISHABLE_KEY=your-actual-publishable-key

# Database credentials (read from secrets files)
POSTGRES_PASSWORD=$(cat secrets/postgres_password.txt)

# Grafana (REQUIRED - compose will fail without this)
GF_SECURITY_ADMIN_PASSWORD=$(cat secrets/grafana_password.txt)

# TTN (if using IoT devices)
TTN_APPLICATION_ID=your-ttn-app-id
TTN_API_URL=https://eu1.cloud.thethings.network
TTN_API_KEY=your-ttn-api-key
TTN_WEBHOOK_URL=https://api.freshtrackpro.com/api/webhooks/ttn

# Stripe (if using payments)
STRIPE_SECRET_KEY=sk_live_your-stripe-key
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret

# Resend (if using email notifications)
RESEND_API_KEY=re_your-resend-api-key
EMAIL_FROM_ADDRESS=noreply@freshtrackpro.com

# Telnyx (if using SMS)
TELNYX_API_KEY=your-telnyx-api-key
TELNYX_MESSAGING_PROFILE_ID=your-messaging-profile-id
TELNYX_PHONE_NUMBER=+15551234567

# CORS
CORS_ORIGINS=https://app.freshtrackpro.com,https://freshtrackpro.com
```

Save and exit (Ctrl+O, Ctrl+X in nano).

**Note:** `STACK_AUTH_PROJECT_ID`, `STACK_AUTH_PUBLISHABLE_KEY`, `POSTGRES_PASSWORD`, and `GF_SECURITY_ADMIN_PASSWORD` are **required** - Docker Compose will fail to start if these are missing.

### 3. Configure Caddy (Reverse Proxy)

Caddy configuration exists in `docker/caddy/Caddyfile`. The configuration uses the `DOMAIN` environment variable for dynamic domain configuration.

```bash
# Verify the Caddyfile exists
cat docker/caddy/Caddyfile
```

**Key features of the Caddyfile:**

- Uses `{$DOMAIN:localhost}` pattern for environment-based domain configuration
- Automatic HTTPS via Let's Encrypt
- WebSocket support for real-time features
- Security headers (HSTS, CSP, X-Frame-Options, etc.)

**To set your production domain:**

```bash
# Set in .env.production
echo "DOMAIN=freshtrackpro.com" >> .env.production
echo "ADMIN_EMAIL=admin@freshtrackpro.com" >> .env.production
```

**If you need to generate basicauth hash for Grafana:**

```bash
docker run --rm caddy caddy hash-password --plaintext "your-password"
```

**Note:** The Caddy service is defined in `compose.production.yaml` and handles all external HTTPS traffic, proxying to internal services.

### 4. Configure DNS

Point your domains to the server IP:

**In your DNS provider (e.g., Cloudflare):**

| Type | Name       | Value          | TTL |
| ---- | ---------- | -------------- | --- |
| A    | @          | 159.89.123.456 | 300 |
| A    | api        | 159.89.123.456 | 300 |
| A    | monitoring | 159.89.123.456 | 300 |
| A    | status     | 159.89.123.456 | 300 |

**TTL set to 300s (5 minutes) for initial deployment** - allows quick changes if needed. Increase to 86400s (24h) after stability confirmed.

**Verify DNS propagation:**

```bash
# Test from your local machine
dig freshtrackpro.com +short
dig api.freshtrackpro.com +short
```

Wait for DNS to propagate (5-15 minutes typically).

### 5. Configure Uptime Kuma (Optional - First Run Only)

After first deployment, Uptime Kuma needs initial setup:

1. Visit: https://status.freshtrackpro.com
2. Create admin account (first user becomes admin)
3. Add monitors:
   - **Backend API Health**: https://api.freshtrackpro.com/health (every 60s)
   - **Frontend**: https://freshtrackpro.com (every 60s)
   - **Database**: Add a heartbeat monitor for critical processes
4. Configure status page:
   - Settings > Status Page > Create New
   - Make public or password-protected
   - Add all monitors to status page

---

## Deployment

### 1. Build Images (Production)

```bash
cd /opt/freshtrack-pro

# Build backend production image
docker build -t freshtrack-backend:latest --target production ./backend

# Verify build
docker images | grep freshtrack-backend
```

### 2. Start Services

```bash
cd /opt/freshtrack-pro

# Load environment variables
set -a
source .env.production
set +a

# Start all services (production configuration)
docker compose -f docker-compose.yml -f compose.production.yaml up -d

# This starts:
# - PostgreSQL database (internal network only)
# - Redis cache (internal network only)
# - MinIO object storage (localhost:9000)
# - Backend API (localhost:3000)
# - Worker (background job processor)
# - Caddy reverse proxy (ports 80, 443 - auto HTTPS)
# - Uptime Kuma status page
# - Prometheus, Loki, Promtail, Grafana (monitoring stack)
# - Node Exporter, Blackbox Exporter (metrics)
```

### 3. Verify Deployment

```bash
# Check all containers running
docker compose -f docker-compose.yml -f compose.production.yaml ps

# Expected output:
# NAME                          STATUS      PORTS
# frostguard-backend            Up          127.0.0.1:3000->3000/tcp
# frostguard-postgres           Up          (internal only)
# frostguard-redis              Up          (internal only)
# frostguard-minio              Up          127.0.0.1:9000->9000/tcp
# frostguard-caddy              Up          0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
# frostguard-worker             Up          (no ports)
# frostguard-uptime-kuma        Up          127.0.0.1:3002->3001/tcp
# frostguard-grafana            Up          127.0.0.1:3001->3000/tcp
# frostguard-prometheus         Up          127.0.0.1:9090->9090/tcp
# frostguard-loki               Up          127.0.0.1:3100->3100/tcp
# frostguard-promtail           Up          (no ports)
# frostguard-node-exporter      Up          127.0.0.1:9100->9100/tcp
# frostguard-blackbox           Up          127.0.0.1:9115->9115/tcp

# Check backend health
docker compose -f docker-compose.yml -f compose.production.yaml exec backend curl -f http://localhost:3000/health

# Check logs
docker compose -f docker-compose.yml -f compose.production.yaml logs -f backend
```

**Note:** PostgreSQL and Redis ports are internal-only in production for security. Access them via Docker exec if needed.

### 4. Database Initialization

**If this is first deployment (not migration from Supabase):**

```bash
# Run database migrations
docker compose exec backend npm run db:migrate

# Verify database schema
docker compose exec postgres psql -U frostguard -d frostguard -c "\dt"
```

**If migrating from Supabase:**

See `CUTOVER_CHECKLIST.md` for full migration procedure.

### 5. Verify HTTPS

```bash
# Test from external network (your local machine)
curl https://api.freshtrackpro.com/health

# Expected output (200 OK):
# {"status":"healthy","database":"connected","timestamp":"2026-01-23T10:00:00.000Z"}

# Test frontend
curl -I https://freshtrackpro.com

# Expected: 200 OK with TLS certificate
```

Caddy automatically provisions Let's Encrypt certificates. First request may take 10-30 seconds while certificates are obtained.

### 6. Create Admin User

```bash
# If using Stack Auth, create first user via frontend signup
# Visit: https://freshtrackpro.com/signup

# Or create via backend CLI (if available)
docker compose exec backend npm run user:create-admin
```

---

## Monitoring

### Grafana Dashboard

**Access:** https://monitoring.freshtrackpro.com

**Default credentials:** admin / admin (change on first login)

**Available Dashboards:**

1. **Application Metrics**: Request rates, error rates, response times
2. **Database Performance**: Connection pool, query times, table sizes
3. **System Resources**: CPU, memory, disk usage
4. **Logs**: Aggregated logs from all services (via Loki)

**Key Metrics to Watch:**

- Backend API error rate (should be < 1%)
- Database connection pool usage (should be < 80%)
- Disk usage (alert at 80% full)
- Response time p95 (should be < 500ms)

### Uptime Kuma Status Page

**Access:** https://status.freshtrackpro.com

**Monitors:**

- Backend API health endpoint
- Frontend availability
- Database uptime
- TTN webhook endpoint (if applicable)

**Notifications:** Configure in Uptime Kuma settings:

- Email (SMTP)
- Slack webhook
- Discord webhook
- Telegram bot

### Manual Health Checks

```bash
# Backend health
curl https://api.freshtrackpro.com/health

# Database connectivity
docker compose exec backend npm run db:ping

# Redis connectivity
docker compose exec redis redis-cli ping

# MinIO health
curl http://localhost:9000/minio/health/live
```

### Log Monitoring

```bash
# View real-time logs
docker compose logs -f backend

# View last 100 lines
docker compose logs --tail=100 backend

# Search logs for errors
docker compose logs backend | grep -i error

# View logs for specific service
docker compose logs grafana
docker compose logs postgres
```

---

## Maintenance

### Daily Operations

**Automated (via cron or systemd timers):**

- Database backups (daily at 2 AM)
- Log rotation (daily)
- Disk usage alerts (hourly)

**Manual checks:**

- Review error logs in Grafana
- Check Uptime Kuma for any downtime
- Monitor disk space: `df -h`

### Weekly Operations

**Every Monday morning:**

- Review weekly metrics in Grafana
- Check for security updates: `sudo apt update && sudo apt list --upgradable`
- Test backup restoration (once a week)
- Review and archive old logs

### Monthly Operations

**First of each month:**

- Review and optimize database performance
- Update dependencies (npm, Docker images)
- Review and update SSL certificates (if manual renewal)
- Security audit (review access logs for anomalies)

### Backups

#### Automated Database Backups

Create a backup script:

```bash
# Create script
sudo nano /opt/freshtrack-pro/scripts/backup-db.sh
```

**Script content:**

```bash
#!/bin/bash
set -e

BACKUP_DIR="/opt/freshtrack-pro/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/frostguard_$TIMESTAMP.sql.gz"

# Create backup directory if not exists
mkdir -p $BACKUP_DIR

# Run pg_dump and compress
docker compose -f /opt/freshtrack-pro/docker-compose.yml \
  exec -T postgres pg_dump -U frostguard frostguard | gzip > $BACKUP_FILE

# Keep only last 7 days of backups
find $BACKUP_DIR -name "frostguard_*.sql.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_FILE"
```

**Make executable:**

```bash
chmod +x /opt/freshtrack-pro/scripts/backup-db.sh
```

**Add to crontab:**

```bash
crontab -e
```

**Add line:**

```
0 2 * * * /opt/freshtrack-pro/scripts/backup-db.sh >> /var/log/freshtrack-backup.log 2>&1
```

#### Manual Backup

```bash
# Create manual backup
docker compose exec postgres pg_dump -U frostguard frostguard > backup_$(date +%Y%m%d).sql

# Compress
gzip backup_$(date +%Y%m%d).sql

# Upload to S3 or external storage (recommended)
aws s3 cp backup_$(date +%Y%m%d).sql.gz s3://your-backup-bucket/
```

#### Restore from Backup

```bash
# Stop backend (prevent writes during restore)
docker compose stop backend

# Restore database
gunzip -c backup_20260123.sql.gz | docker compose exec -T postgres psql -U frostguard frostguard

# Restart backend
docker compose start backend

# Verify restoration
curl https://api.freshtrackpro.com/health
```

### Log Rotation

Docker automatically rotates logs, but verify configuration:

```bash
# Check Docker daemon.json
cat /etc/docker/daemon.json
```

**Should contain:**

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

**If not present, add and restart Docker:**

```bash
sudo systemctl restart docker
```

### Updates and Deployments

**To deploy new version:**

```bash
cd /opt/freshtrack-pro

# Pull latest code
git fetch origin
git checkout tags/v1.1.0  # or git pull origin main

# Load environment variables
set -a
source .env.production
set +a

# Rebuild backend and worker images
docker build -t freshtrack-backend:latest --target production ./backend
docker build -f backend/Dockerfile.worker -t freshtrack-worker:latest --target production ./backend

# Restart services (rolling restart)
docker compose -f docker-compose.yml -f compose.production.yaml up -d

# Verify health
curl https://api.freshtrackpro.com/health

# Check logs for errors
docker compose -f docker-compose.yml -f compose.production.yaml logs -f backend
```

**Zero-downtime deployment (advanced):**
For true zero-downtime, use Docker Swarm or Kubernetes orchestration.

---

## Troubleshooting

### Service Won't Start

**Symptom:** Container exits immediately after starting

**Debug steps:**

```bash
# Check container status
docker compose ps

# View container logs
docker compose logs backend

# Check resource usage
docker stats

# Verify secrets exist
ls -la secrets/

# Test configuration
docker compose -f docker-compose.yml -f compose.production.yaml config
```

**Common causes:**

- Missing secrets files
- Invalid environment variables
- Database not ready (increase `start_period` in healthcheck)
- Port already in use

### Database Connection Errors

**Symptom:** Backend logs show "connection refused" or "ECONNREFUSED"

**Debug steps:**

```bash
# Check if PostgreSQL is running
docker compose ps postgres

# Check PostgreSQL logs
docker compose logs postgres

# Test database connectivity
docker compose exec postgres psql -U frostguard -d frostguard -c "SELECT 1"

# Verify DATABASE_URL format
docker compose exec backend env | grep DATABASE_URL
```

**Common causes:**

- Incorrect DATABASE_URL in .env.production
- Wrong password in secrets/postgres_password.txt
- PostgreSQL hasn't finished initializing (wait 30-60 seconds)

### HTTPS Certificate Issues

**Symptom:** "Certificate error" or "ERR_CERT_AUTHORITY_INVALID"

**Debug steps:**

```bash
# Check Caddy logs
docker compose logs caddy

# Verify DNS points to server
dig api.freshtrackpro.com +short

# Test Let's Encrypt challenge (HTTP-01)
curl http://api.freshtrackpro.com/.well-known/acme-challenge/test
```

**Common causes:**

- DNS not propagated yet (wait 15 minutes)
- Firewall blocking port 80 or 443
- Caddy unable to reach Let's Encrypt (check outbound firewall)
- Rate limit exceeded (use staging Let's Encrypt for testing)

### High Memory Usage

**Symptom:** Server becomes slow, OOM killer terminates processes

**Debug steps:**

```bash
# Check memory usage by container
docker stats

# Check system memory
free -h

# Identify memory hogs
docker compose exec backend ps aux --sort=-%mem | head
```

**Solutions:**

- Reduce resource limits in compose.production.yaml
- Increase server RAM
- Optimize database queries (add indexes)
- Reduce connection pool size (DB_POOL_MAX)

### Slow API Responses

**Symptom:** Requests take > 1 second

**Debug steps:**

```bash
# Check response time
curl -w "@curl-format.txt" -o /dev/null -s https://api.freshtrackpro.com/api/readings

# Check database slow queries
docker compose exec postgres psql -U frostguard -d frostguard -c "
  SELECT query, calls, mean_exec_time
  FROM pg_stat_statements
  ORDER BY mean_exec_time DESC
  LIMIT 10;
"

# Check CPU usage
docker stats

# Review logs for N+1 queries or missing indexes
docker compose logs backend | grep "slow query"
```

**Solutions:**

- Add database indexes
- Implement caching (Redis)
- Optimize frontend to reduce API calls
- Increase backend resource limits

### Logs Not Appearing in Grafana

**Symptom:** Loki/Grafana shows no logs

**Debug steps:**

```bash
# Check Promtail is running
docker compose -f docker-compose.yml -f compose.production.yaml ps promtail

# Check Promtail logs
docker compose -f docker-compose.yml -f compose.production.yaml logs promtail

# Verify Loki endpoint
curl http://localhost:3100/ready

# Check Grafana data source configuration
# Visit: https://monitoring.freshtrackpro.com/datasources
```

**Common causes:**

- Promtail can't read Docker logs (permissions issue)
- Loki not configured as Grafana data source
- Log paths misconfigured in promtail config

### Environment Variable Errors

**Symptom:** Docker Compose fails with "variable is required" error

**Example error:**

```
ERROR: Missing required variable: STACK_AUTH_PROJECT_ID is required
```

**Solution:**

```bash
# Ensure .env.production is loaded
set -a
source .env.production
set +a

# Verify required variables are set
echo $STACK_AUTH_PROJECT_ID
echo $STACK_AUTH_PUBLISHABLE_KEY
echo $POSTGRES_PASSWORD
echo $GF_SECURITY_ADMIN_PASSWORD

# Then retry compose command
docker compose -f docker-compose.yml -f compose.production.yaml up -d
```

**Required variables (compose will fail without these):**

- `STACK_AUTH_PROJECT_ID` - Stack Auth project ID
- `STACK_AUTH_PUBLISHABLE_KEY` - Stack Auth publishable key
- `POSTGRES_PASSWORD` - PostgreSQL password
- `GF_SECURITY_ADMIN_PASSWORD` - Grafana admin password

### Caddy Certificate Issues

**Symptom:** Caddy fails to obtain Let's Encrypt certificate

**Debug steps:**

```bash
# Check Caddy logs
docker compose -f docker-compose.yml -f compose.production.yaml logs caddy

# Verify DOMAIN environment variable is set
docker compose -f docker-compose.yml -f compose.production.yaml exec caddy printenv DOMAIN

# Test DNS resolution from server
dig api.freshtrackpro.com +short
```

**Common causes:**

- DNS not pointing to server IP
- Firewall blocking port 80 (Let's Encrypt HTTP-01 challenge)
- Rate limited (too many certificate requests)
- DOMAIN environment variable not set correctly

---

## Rollback Procedures

### When to Rollback

**Immediate rollback if:**

- Application completely non-functional (> 50% error rate)
- Critical data loss detected
- Security breach discovered
- Database corruption confirmed

**Fix forward if:**

- Minor bugs affecting < 10% of users
- Performance degradation < 50%
- Non-critical feature broken
- Cosmetic issues

### Rollback to Previous Version

**Scenario:** New deployment has critical bug, need to rollback to previous working version.

**Steps:**

1. **Stop current deployment:**

   ```bash
   cd /opt/freshtrack-pro
   # Stop services but preserve volumes (database data)
   docker compose -f docker-compose.yml -f compose.production.yaml stop
   # Or completely remove containers (keeps volumes):
   docker compose -f docker-compose.yml -f compose.production.yaml down
   ```

2. **Revert code to previous version:**

   ```bash
   # Check current version
   git log --oneline -5

   # Rollback to previous tag
   git checkout tags/v1.0.0  # Replace with last known good version
   ```

3. **Rebuild images:**

   ```bash
   docker build -t freshtrack-backend:latest --target production ./backend
   ```

4. **Restore database (if schema changed):**

   ```bash
   # Restore from backup taken before deployment
   gunzip -c backups/frostguard_20260123_020000.sql.gz | \
     docker compose exec -T postgres psql -U frostguard frostguard
   ```

5. **Restart services:**

   ```bash
   docker compose -f docker-compose.yml -f compose.production.yaml up -d
   ```

6. **Verify rollback:**

   ```bash
   curl https://api.freshtrackpro.com/health
   docker compose logs -f backend
   ```

7. **Communicate to users:**
   - Update status page
   - Send notification email
   - Document incident in post-mortem

### Rollback During Migration (Cutover)

**Scenario:** Migration from Supabase failed, need to revert to old system.

See `CUTOVER_CHECKLIST.md` for detailed rollback procedure.

**Quick steps:**

1. Revert DNS to point to old Supabase backend
2. Stop new Docker services
3. Re-enable old frontend (if needed)
4. Notify users of rollback
5. Investigate root cause before retrying

**Time to rollback:** < 15 minutes (DNS TTL permitting)

---

## Security Hardening

### Additional Recommendations

**Server-level:**

- [ ] Enable automatic security updates: `sudo dpkg-reconfigure -plow unattended-upgrades`
- [ ] Disable root SSH: Edit `/etc/ssh/sshd_config`, set `PermitRootLogin no`
- [ ] Use SSH keys only (disable password auth)
- [ ] Install intrusion detection: `sudo apt install aide`
- [ ] Regular security audits: `sudo lynis audit system`

**Application-level:**

- [ ] Rotate secrets quarterly
- [ ] Implement rate limiting (already in backend)
- [ ] Enable CORS restrictions (already configured)
- [ ] Regular dependency updates: `npm audit fix`
- [ ] Monitor for CVEs: GitHub Dependabot

**Database-level:**

- [ ] Restrict PostgreSQL to localhost (already done)
- [ ] Use separate database user per service
- [ ] Enable query logging for audit
- [ ] Implement backup encryption

**Network-level:**

- [ ] Use Cloudflare for DDoS protection (optional)
- [ ] Implement VPN for admin access (optional)
- [ ] Restrict monitoring dashboards to VPN or IP whitelist

---

## Performance Tuning

### Database Optimization

```sql
-- Add indexes for frequently queried columns
CREATE INDEX idx_readings_unit_timestamp
  ON temperature_readings(unit_id, timestamp DESC);

CREATE INDEX idx_alerts_status
  ON alert_instances(status, created_at DESC);

-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM temperature_readings
  WHERE unit_id = 'uuid' ORDER BY timestamp DESC LIMIT 100;
```

### Backend Scaling

**If single server can't handle load:**

1. **Vertical scaling:** Upgrade server (more CPU/RAM)
2. **Horizontal scaling:** Add load balancer + multiple backend instances
3. **Database read replicas:** Separate read and write operations
4. **Caching:** Implement Redis caching for frequent queries

**Example horizontal scaling:**

```yaml
# docker-compose.scale.yaml
services:
  backend:
    deploy:
      replicas: 3 # Run 3 backend instances

  nginx: # Add load balancer
    image: nginx:alpine
    volumes:
      - ./nginx-lb.conf:/etc/nginx/nginx.conf
```

---

## Additional Resources

**Documentation:**

- [Caddy Documentation](https://caddyserver.com/docs/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [PostgreSQL Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [Grafana Getting Started](https://grafana.com/docs/grafana/latest/getting-started/)

**Support:**

- FreshTrack Pro GitHub Issues: https://github.com/your-org/freshtrack-pro/issues
- Stack Auth Support: support@stack-auth.com
- Community Forum: (if available)

**Last Updated:** 2026-01-24
