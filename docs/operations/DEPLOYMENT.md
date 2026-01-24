# Deployment Documentation

> Complete guide for deploying, maintaining, and troubleshooting FrostGuard production environments

---

## Table of Contents

1. [VPS Setup Requirements](#vps-setup-requirements)
2. [Initial Deployment](#initial-deployment)
3. [Automated CI/CD Pipeline](#automated-cicd-pipeline)
4. [Rollback Procedures](#rollback-procedures)
5. [Troubleshooting](#troubleshooting)
6. [Backup and Restore](#backup-and-restore)
7. [Maintenance Tasks](#maintenance-tasks)

---

## VPS Setup Requirements

### Minimum Hardware Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Storage | 40 GB SSD | 100 GB SSD |
| Network | 1 Gbps | 1 Gbps |

### Operating System

- **Ubuntu 22.04 LTS** (recommended)
- Ubuntu 24.04 LTS (supported)
- Debian 12 (supported)

### Required Software

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sudo sh

# Add user to docker group
sudo usermod -aG docker $USER

# Install Docker Compose plugin
sudo apt install -y docker-compose-plugin

# Verify installations
docker --version        # Docker version 24.0+
docker compose version  # Docker Compose version v2.20+
```

### Additional Tools

```bash
# Install essential utilities
sudo apt install -y \
  curl \
  git \
  htop \
  ncdu \
  unzip \
  jq

# Install certbot for manual SSL (optional, Traefik handles SSL)
sudo apt install -y certbot
```

### Firewall Configuration

```bash
# Install and enable UFW
sudo apt install -y ufw

# Allow SSH (change port if using non-standard)
sudo ufw allow 22/tcp

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Verify status
sudo ufw status
```

### Directory Structure

```bash
# Create application directory
sudo mkdir -p /opt/frostguard
sudo chown $USER:$USER /opt/frostguard

# Create secrets directory
mkdir -p /opt/frostguard/secrets
chmod 700 /opt/frostguard/secrets

# Create backup directory
sudo mkdir -p /var/backups/frostguard
sudo chown $USER:$USER /var/backups/frostguard
```

### GitHub Container Registry Access

```bash
# Create a personal access token at https://github.com/settings/tokens
# Scopes needed: read:packages

# Login to GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u <username> --password-stdin
```

---

## Initial Deployment

### Step 1: Clone Repository

```bash
cd /opt/frostguard
git clone https://github.com/getdatasurge/freshtrack-pro.git .
```

### Step 2: Create Secrets

```bash
# Generate strong passwords
openssl rand -base64 32 > secrets/postgres_password.txt
openssl rand -base64 32 > secrets/minio_password.txt
echo "minio_admin" > secrets/minio_user.txt

# Set restrictive permissions
chmod 600 secrets/*.txt
```

### Step 3: Configure Environment

```bash
# Copy example environment file
cp .env.production.example .env

# Edit with your values
nano .env
```

**Required environment variables:**

```bash
# Domain (REQUIRED)
DOMAIN=app.yourdomain.com
ACME_EMAIL=admin@yourdomain.com

# Database (REQUIRED)
POSTGRES_USER=frostguard
POSTGRES_DB=frostguard
# Password is loaded from secrets/postgres_password.txt

# Stack Auth (REQUIRED)
STACK_AUTH_PROJECT_ID=your-project-id
STACK_AUTH_PUBLISHABLE_KEY=your-publishable-key
STACK_AUTH_SECRET_KEY=your-secret-key

# CORS (REQUIRED)
CORS_ORIGINS=https://app.yourdomain.com

# Optional integrations
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
TELNYX_API_KEY=KEY_...
TTN_WEBHOOK_SECRET=your-secret
```

### Step 4: Configure DNS

Create the following DNS records pointing to your VPS IP:

| Type | Name | Value |
|------|------|-------|
| A | app.yourdomain.com | YOUR_VPS_IP |
| A | traefik.yourdomain.com | YOUR_VPS_IP (optional, for dashboard) |

### Step 5: Deploy Services

```bash
# Pull images
docker compose -f docker-compose.prod.yml pull

# Start all services
docker compose -f docker-compose.prod.yml up -d

# Verify services are running
docker compose -f docker-compose.prod.yml ps
```

### Step 6: Run Database Migrations

```bash
# Run migrations using the backend container
docker compose -f docker-compose.prod.yml exec backend \
  node dist/src/db/migrate.js
```

### Step 7: Verify Deployment

```bash
# Check backend health
curl -s https://app.yourdomain.com/health | jq

# Expected response:
{
  "status": "healthy",
  "checks": {
    "database": "healthy",
    "redis": "healthy"
  }
}

# Check frontend
curl -I https://app.yourdomain.com

# Check SSL certificate
openssl s_client -connect app.yourdomain.com:443 -servername app.yourdomain.com </dev/null 2>/dev/null | openssl x509 -noout -dates
```

---

## Automated CI/CD Pipeline

The deployment is fully automated via GitHub Actions.

### Trigger Conditions

- **Automatic:** Push to `main` branch triggers deployment
- **Manual:** Workflow can be triggered manually from GitHub Actions tab

### Pipeline Stages

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   CI Tests  │───▶│ Build Images│───▶│  Migrations │───▶│   Deploy    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                          │                                     │
                          ▼                                     ▼
                   Push to GHCR                          Health Checks
```

### Required GitHub Secrets

Configure these in **Settings → Secrets and variables → Actions**:

| Secret | Description |
|--------|-------------|
| `VPS_HOST` | VPS IP address or hostname |
| `VPS_USER` | SSH username (e.g., `deploy`) |
| `VPS_SSH_KEY` | SSH private key for VPS access |
| `VPS_PORT` | SSH port (default: 22) |

### Image Tagging Strategy

- `ghcr.io/getdatasurge/frostguard-backend:latest` - Latest main branch
- `ghcr.io/getdatasurge/frostguard-backend:<sha>` - Specific commit
- `ghcr.io/getdatasurge/frostguard-frontend:latest` - Latest main branch
- `ghcr.io/getdatasurge/frostguard-frontend:<sha>` - Specific commit

### Monitoring Deployments

```bash
# Watch deployment progress
watch -n 5 'docker compose -f docker-compose.prod.yml ps'

# View deployment logs
docker compose -f docker-compose.prod.yml logs -f --tail 100

# Check GitHub Actions
# Visit: https://github.com/getdatasurge/freshtrack-pro/actions
```

---

## Rollback Procedures

### Quick Rollback (Recommended)

Roll back to the previous working image:

```bash
cd /opt/frostguard

# List available image tags
docker images | grep frostguard

# Rollback to specific commit SHA
export IMAGE_TAG=abc1234  # Previous working commit
export BACKEND_IMAGE=ghcr.io/getdatasurge/frostguard-backend:$IMAGE_TAG
export FRONTEND_IMAGE=ghcr.io/getdatasurge/frostguard-frontend:$IMAGE_TAG

# Deploy previous version
docker compose -f docker-compose.prod.yml up -d --no-build

# Verify rollback
curl -s https://app.yourdomain.com/health | jq
```

### Full Rollback with Database

If database migrations need to be reverted:

```bash
# 1. Stop the application
docker compose -f docker-compose.prod.yml stop backend frontend

# 2. Restore database from backup (see Backup section)
./scripts/restore-db.sh /var/backups/frostguard/pg_backup_YYYYMMDD.sql.gz

# 3. Deploy previous version
export IMAGE_TAG=abc1234
export BACKEND_IMAGE=ghcr.io/getdatasurge/frostguard-backend:$IMAGE_TAG
export FRONTEND_IMAGE=ghcr.io/getdatasurge/frostguard-frontend:$IMAGE_TAG
docker compose -f docker-compose.prod.yml up -d

# 4. Verify services
docker compose -f docker-compose.prod.yml ps
curl -s https://app.yourdomain.com/health | jq
```

### Emergency Rollback

If services are completely unresponsive:

```bash
# Force stop all containers
docker compose -f docker-compose.prod.yml down

# Pull known good images
docker pull ghcr.io/getdatasurge/frostguard-backend:v1.0.0
docker pull ghcr.io/getdatasurge/frostguard-frontend:v1.0.0

# Tag as deploy
docker tag ghcr.io/getdatasurge/frostguard-backend:v1.0.0 ghcr.io/getdatasurge/frostguard-backend:deploy
docker tag ghcr.io/getdatasurge/frostguard-frontend:v1.0.0 ghcr.io/getdatasurge/frostguard-frontend:deploy

# Start services
docker compose -f docker-compose.prod.yml up -d

# Monitor startup
docker compose -f docker-compose.prod.yml logs -f
```

### Git-Based Rollback

Revert the main branch to trigger redeployment:

```bash
# Find the last working commit
git log --oneline -10

# Revert to specific commit
git revert HEAD~3..HEAD  # Revert last 3 commits

# Push to trigger CI/CD
git push origin main
```

---

## Troubleshooting

### Service Health Checks

```bash
# Overall status
docker compose -f docker-compose.prod.yml ps

# Individual service health
docker inspect --format='{{.State.Health.Status}}' frostguard-backend
docker inspect --format='{{.State.Health.Status}}' frostguard-frontend
docker inspect --format='{{.State.Health.Status}}' frostguard-postgres
docker inspect --format='{{.State.Health.Status}}' frostguard-redis
```

### Container Logs

```bash
# All services (last 100 lines)
docker compose -f docker-compose.prod.yml logs --tail 100

# Specific service (follow mode)
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f postgres
docker compose -f docker-compose.prod.yml logs -f traefik

# Search logs for errors
docker compose -f docker-compose.prod.yml logs 2>&1 | grep -i error
```

### Common Issues

#### Backend Won't Start

```bash
# Check for port conflicts
ss -tlnp | grep 3000

# Check environment variables
docker compose -f docker-compose.prod.yml config | grep -A 20 backend

# Start in foreground for debugging
docker compose -f docker-compose.prod.yml up backend
```

#### Database Connection Failures

```bash
# Check PostgreSQL is running
docker exec frostguard-postgres pg_isready -U frostguard

# Test connection from backend container
docker exec frostguard-backend \
  node -e "const pg = require('pg'); const c = new pg.Client(process.env.DATABASE_URL); c.connect().then(() => console.log('OK')).catch(console.error)"

# Check DATABASE_URL is correct
docker exec frostguard-backend printenv DATABASE_URL
```

#### Redis Connection Issues

```bash
# Test Redis
docker exec frostguard-redis redis-cli ping

# Check Redis memory
docker exec frostguard-redis redis-cli info memory

# View Redis clients
docker exec frostguard-redis redis-cli client list
```

#### SSL Certificate Issues

```bash
# Check Traefik logs for ACME errors
docker compose -f docker-compose.prod.yml logs traefik | grep -i acme

# Verify certificate
echo | openssl s_client -connect app.yourdomain.com:443 2>/dev/null | openssl x509 -text

# Force certificate renewal (delete and restart)
docker volume rm frostguard_traefik_letsencrypt
docker compose -f docker-compose.prod.yml restart traefik
```

#### Disk Space Issues

```bash
# Check disk usage
df -h

# Check Docker disk usage
docker system df

# Cleanup unused resources
docker system prune -a --volumes

# Cleanup old logs
truncate -s 0 /var/lib/docker/containers/*/*-json.log
```

#### Memory Issues

```bash
# Check memory usage
free -h
docker stats --no-stream

# Check for OOM kills
dmesg | grep -i "killed process"

# Restart memory-intensive containers
docker compose -f docker-compose.prod.yml restart backend
```

### Debug Mode

Start backend in debug mode for detailed logging:

```bash
# Temporarily set debug log level
docker compose -f docker-compose.prod.yml stop backend
LOG_LEVEL=debug docker compose -f docker-compose.prod.yml up backend

# View structured logs
docker compose -f docker-compose.prod.yml logs backend | jq -R 'fromjson? // .'
```

---

## Backup and Restore

### Automated Backups

Create a backup script:

```bash
#!/bin/bash
# /opt/frostguard/scripts/backup.sh

set -e

BACKUP_DIR="/var/backups/frostguard"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

echo "Starting backup at $DATE..."

# Backup PostgreSQL
docker exec frostguard-postgres pg_dump -U frostguard frostguard | gzip > "$BACKUP_DIR/pg_backup_$DATE.sql.gz"
echo "✅ PostgreSQL backup complete"

# Backup Redis (RDB snapshot)
docker exec frostguard-redis redis-cli BGSAVE
sleep 5  # Wait for save to complete
docker cp frostguard-redis:/data/dump.rdb "$BACKUP_DIR/redis_backup_$DATE.rdb"
echo "✅ Redis backup complete"

# Backup MinIO data
docker run --rm \
  --volumes-from frostguard-minio \
  -v "$BACKUP_DIR":/backup \
  alpine tar czf /backup/minio_backup_$DATE.tar.gz /data
echo "✅ MinIO backup complete"

# Backup environment and secrets
tar czf "$BACKUP_DIR/config_backup_$DATE.tar.gz" \
  /opt/frostguard/.env \
  /opt/frostguard/secrets/
echo "✅ Config backup complete"

# Remove old backups
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "*.rdb" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete
echo "✅ Old backups cleaned up"

echo "Backup completed successfully!"
ls -lh "$BACKUP_DIR"/*$DATE*
```

```bash
# Make executable
chmod +x /opt/frostguard/scripts/backup.sh

# Add to crontab (daily at 2am)
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/frostguard/scripts/backup.sh >> /var/log/frostguard-backup.log 2>&1") | crontab -
```

### Manual Backup

```bash
# Quick PostgreSQL backup
docker exec frostguard-postgres pg_dump -U frostguard frostguard > backup.sql

# Compressed backup
docker exec frostguard-postgres pg_dump -U frostguard frostguard | gzip > backup.sql.gz
```

### Restore Procedures

#### Restore PostgreSQL

```bash
#!/bin/bash
# /opt/frostguard/scripts/restore-db.sh

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: ./restore-db.sh /path/to/backup.sql.gz"
  exit 1
fi

echo "⚠️  WARNING: This will overwrite the current database!"
read -p "Continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "Aborted"
  exit 1
fi

# Stop backend to prevent connections
docker compose -f docker-compose.prod.yml stop backend

# Drop and recreate database
docker exec frostguard-postgres psql -U frostguard -d postgres -c "DROP DATABASE IF EXISTS frostguard;"
docker exec frostguard-postgres psql -U frostguard -d postgres -c "CREATE DATABASE frostguard;"

# Restore from backup
if [[ "$BACKUP_FILE" == *.gz ]]; then
  gunzip -c "$BACKUP_FILE" | docker exec -i frostguard-postgres psql -U frostguard frostguard
else
  docker exec -i frostguard-postgres psql -U frostguard frostguard < "$BACKUP_FILE"
fi

# Restart backend
docker compose -f docker-compose.prod.yml start backend

echo "✅ Database restored successfully"
```

#### Restore Redis

```bash
# Stop Redis
docker compose -f docker-compose.prod.yml stop redis

# Copy backup
docker cp /var/backups/frostguard/redis_backup_YYYYMMDD.rdb frostguard-redis:/data/dump.rdb

# Start Redis
docker compose -f docker-compose.prod.yml start redis
```

#### Restore MinIO

```bash
# Stop MinIO
docker compose -f docker-compose.prod.yml stop minio

# Restore data
docker run --rm \
  --volumes-from frostguard-minio \
  -v /var/backups/frostguard:/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/minio_backup_YYYYMMDD.tar.gz -C /"

# Start MinIO
docker compose -f docker-compose.prod.yml start minio
```

### Offsite Backup

Send backups to remote storage:

```bash
# Install rclone
curl https://rclone.org/install.sh | sudo bash

# Configure rclone for your provider (S3, GCS, B2, etc.)
rclone config

# Sync backups to remote
rclone sync /var/backups/frostguard remote:frostguard-backups/
```

---

## Maintenance Tasks

### SSL Certificate Renewal

Traefik handles automatic renewal via Let's Encrypt. To manually renew:

```bash
# Check certificate expiry
echo | openssl s_client -connect app.yourdomain.com:443 2>/dev/null | openssl x509 -noout -enddate

# Force renewal
docker compose -f docker-compose.prod.yml restart traefik
```

### Database Maintenance

```bash
# Run VACUUM ANALYZE (weekly recommended)
docker exec frostguard-postgres psql -U frostguard frostguard -c "VACUUM ANALYZE;"

# Check table sizes
docker exec frostguard-postgres psql -U frostguard frostguard -c "
  SELECT relname AS table,
         pg_size_pretty(pg_total_relation_size(relid)) AS size
  FROM pg_catalog.pg_statio_user_tables
  ORDER BY pg_total_relation_size(relid) DESC
  LIMIT 10;"

# Check for bloat
docker exec frostguard-postgres psql -U frostguard frostguard -c "
  SELECT schemaname, tablename,
         pg_size_pretty(pg_table_size(schemaname || '.' || tablename)) as size
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY pg_table_size(schemaname || '.' || tablename) DESC;"
```

### Log Rotation

Docker logs are automatically rotated by Docker daemon. To configure:

```bash
# Edit Docker daemon config
sudo nano /etc/docker/daemon.json

{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}

# Restart Docker
sudo systemctl restart docker
```

### Update Docker Images

```bash
# Pull latest images
docker compose -f docker-compose.prod.yml pull

# Recreate containers with new images
docker compose -f docker-compose.prod.yml up -d --force-recreate

# Cleanup old images
docker image prune -f
```

### System Updates

```bash
# Update system packages (schedule during maintenance window)
sudo apt update && sudo apt upgrade -y

# Update Docker
sudo apt update && sudo apt install docker-ce docker-ce-cli containerd.io

# Reboot if kernel was updated
sudo reboot
```

---

## Related Documentation

- [RUNBOOKS.md](./RUNBOOKS.md) — Incident response procedures
- [MONITORING.md](../../backend/docs/MONITORING.md) — Logging and observability
- [ALERTING.md](./ALERTING.md) — Alert configuration
- [DATABASE_MIGRATION_PLAN.md](../DATABASE_MIGRATION_PLAN.md) — Migration procedures

---

*Last Updated: January 2026*
