# Operations Manual: FreshTrack Pro

Complete guide for ongoing operations after deployment.

## Table of Contents

1. [Daily Operations](#daily-operations)
2. [Application Updates](#application-updates)
3. [Database Backups](#database-backups)
4. [Disaster Recovery](#disaster-recovery)
5. [Scaling](#scaling)
6. [Monitoring](#monitoring)
7. [Security Maintenance](#security-maintenance)
8. [Service Management](#service-management)

---

## Daily Operations

### Health Checks

Run daily verification to ensure all services are healthy:

```bash
./scripts/verify-deployment.sh your-domain.com
```

Or check manually:

```bash
# Quick health check
curl -sf https://your-domain.com/api/health && echo "OK" || echo "FAILED"

# Container status
docker compose ps

# Resource usage
docker stats --no-stream
```

### Log Review

Review logs for errors:

```bash
# All logs (last hour)
docker compose logs --since 1h

# Backend errors only
docker compose logs backend 2>&1 | grep -i error

# Caddy access logs
docker compose logs caddy | grep -E "\"(4|5)[0-9]{2}"
```

### Disk Space

Monitor disk usage:

```bash
# System disk
df -h /

# Docker disk usage
docker system df

# Clean up if needed (removes unused images/containers)
docker system prune -a --volumes
```

---

## Application Updates

### Standard Update Procedure

To update FreshTrack Pro to a new version:

```bash
cd /opt/freshtrack-pro

# 1. Pull latest code
git fetch origin
git checkout main
git pull origin main

# 2. Re-run deployment (handles migrations, rebuilds, restarts)
sudo ./scripts/deploy-automated.sh

# 3. Verify update succeeded
./scripts/verify-deployment.sh your-domain.com
```

**How it works:**

- Deployment script detects existing installation
- Skips pre-flight and prerequisites (checkpoints exist)
- Rebuilds images with new code
- Runs database migrations automatically
- Restarts services with zero downtime (rolling restart)
- Verifies health before completing

### Updating to Specific Version

To update to a specific version (e.g., v1.2.0):

```bash
cd /opt/freshtrack-pro

# 1. List available versions
git tag -l

# 2. Checkout specific version
git fetch --tags
git checkout v1.2.0

# 3. Deploy
sudo ./scripts/deploy-automated.sh

# 4. Verify
./scripts/verify-deployment.sh your-domain.com
```

### Rollback Procedure

If an update causes issues, rollback to previous version:

```bash
cd /opt/freshtrack-pro

# 1. Stop current deployment
docker compose down --timeout 30

# 2. Checkout previous version
git checkout v1.1.0  # or previous known-good version

# 3. Clear deployment checkpoints
sudo ./scripts/deploy-automated.sh --reset

# 4. Redeploy
sudo ./scripts/deploy-automated.sh

# 5. Verify rollback
./scripts/verify-deployment.sh your-domain.com
```

**Important:** Database migrations are forward-only. If the new version ran migrations, the rolled-back code must be compatible with the updated schema.

---

## Database Backups

### Automated Backups

FreshTrack Pro includes automated daily backups to MinIO:

- **Schedule:** Daily at 2 AM UTC
- **Retention:** 30 days
- **Format:** pg_dump custom format, compressed
- **Storage:** MinIO S3-compatible bucket

Verify automated backups are running:

```bash
docker compose logs postgres_backup | grep "Backup completed"
```

### Manual Backup

Create a manual backup before major changes:

```bash
# Create backup with timestamp
docker compose exec -T postgres pg_dump -U frostguard -Fc frostguard > \
  backup_$(date +%Y%m%d_%H%M%S).dump

# Verify backup file
ls -lh backup_*.dump
```

### Backup to External Storage

For additional safety, copy backups to external storage:

```bash
# To S3-compatible storage
aws s3 cp backup_20260129.dump s3://your-backup-bucket/freshtrack/

# To another server via SCP
scp backup_20260129.dump user@backup-server:/backups/

# To local machine
scp root@your-server:/opt/freshtrack-pro/backup_20260129.dump ./
```

### Restore from Backup

**Warning:** Restoration is destructive. Always test on a separate instance first.

```bash
# 1. Stop backend (prevent writes during restore)
docker compose stop backend worker

# 2. Drop and recreate database
docker compose exec -T postgres psql -U postgres -c "DROP DATABASE IF EXISTS frostguard;"
docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE frostguard OWNER frostguard;"

# 3. Restore from backup
docker compose exec -T postgres pg_restore -U frostguard -d frostguard < backup_20260129.dump

# 4. Restart services
docker compose start backend worker

# 5. Verify restoration
./scripts/verify-deployment.sh your-domain.com
```

### Test Restoration (Non-Destructive)

Test backup integrity without affecting production:

```bash
# Create test database
docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE frostguard_test OWNER frostguard;"

# Restore to test database
docker compose exec -T postgres pg_restore -U frostguard -d frostguard_test < backup_20260129.dump

# Verify table count
docker compose exec -T postgres psql -U frostguard -d frostguard_test -c "\dt" | wc -l

# Drop test database
docker compose exec -T postgres psql -U postgres -c "DROP DATABASE frostguard_test;"

echo "Backup verification complete"
```

---

## Disaster Recovery

### Recovery Time Objective (RTO)

- **Full system restore:** 30-60 minutes
- **Database restore only:** 15-30 minutes
- **Rollback to previous version:** 5-10 minutes

### Recovery Point Objective (RPO)

- **With daily backups:** Up to 24 hours of data loss
- **With hourly backups:** Up to 1 hour of data loss

### Complete Server Recovery

If server is lost and you need to start fresh:

1. **Provision new server** (same specs as original)

2. **Restore from backup:**

   ```bash
   # Clone repository
   git clone https://github.com/your-org/freshtrack-pro.git /opt/freshtrack-pro
   cd /opt/freshtrack-pro

   # Run deployment
   sudo ./scripts/deploy-automated.sh

   # After deployment, restore database
   docker compose stop backend worker
   docker compose exec -T postgres psql -U postgres -c "DROP DATABASE IF EXISTS frostguard;"
   docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE frostguard OWNER frostguard;"

   # Copy backup from external storage
   aws s3 cp s3://your-backup-bucket/freshtrack/latest.dump ./

   # Restore
   docker compose exec -T postgres pg_restore -U frostguard -d frostguard < latest.dump
   docker compose start backend worker
   ```

3. **Update DNS** (if server IP changed)

4. **Verify restoration:**
   ```bash
   ./scripts/verify-deployment.sh your-domain.com
   ```

---

## Scaling

### Vertical Scaling (Upgrade Server)

When you need more capacity:

1. **Backup current state:**

   ```bash
   docker compose exec -T postgres pg_dump -U frostguard -Fc frostguard > pre-scale-backup.dump
   ```

2. **Resize server** (provider-specific):
   - DigitalOcean: Droplet > Resize > Choose larger size
   - AWS: Stop instance > Change instance type > Start
   - Most providers: Requires reboot

3. **Verify after resize:**

   ```bash
   # Check new resources
   free -h
   nproc
   df -h

   # Verify services restarted
   docker compose ps
   ./scripts/verify-deployment.sh your-domain.com
   ```

### Horizontal Scaling (Multiple Instances)

For high availability, deploy behind a load balancer:

**Note:** Horizontal scaling requires additional infrastructure (load balancer, shared database, shared Redis). This is an advanced topic.

**Basic architecture:**

```
                    +-------------+
                    | Load        |
                    | Balancer    |
                    +------+------+
               +-----------+-----------+
               v           v           v
        +----------+ +----------+ +----------+
        | Backend  | | Backend  | | Backend  |
        | Instance | | Instance | | Instance |
        +----+-----+ +----+-----+ +----+-----+
             |            |            |
             +------------+------------+
                          v
                   +--------------+
                   |  PostgreSQL  |
                   |   (shared)   |
                   +--------------+
```

**Requirements for horizontal scaling:**

- External PostgreSQL (RDS, Cloud SQL, or dedicated server)
- External Redis (ElastiCache, Memorystore, or dedicated)
- Shared file storage (S3, MinIO cluster)
- Load balancer (nginx, HAProxy, cloud LB)

### Database Scaling

**Increase connection pool:**

Edit `.env.production`:

```bash
# Default is 10, increase for more concurrent users
DB_POOL_SIZE=20
```

Restart backend:

```bash
docker compose restart backend
```

**Add read replicas** (advanced):

For read-heavy workloads, add PostgreSQL read replicas and configure application to use them for read queries.

---

## Monitoring

### Grafana Dashboards

Access Grafana at `https://your-domain.com/grafana`

**Pre-configured dashboards:**

- **FreshTrack Pro Overview:** System metrics, request rates, error rates
- **FreshTrack Sensor Metrics:** Temperature data, alert counts, sensor status

**Key metrics to watch:**

| Metric              | Warning Threshold | Critical Threshold |
| ------------------- | ----------------- | ------------------ |
| CPU Usage           | > 70% sustained   | > 90%              |
| Memory Usage        | > 80%             | > 95%              |
| Disk Usage          | > 70%             | > 85%              |
| API Error Rate      | > 1%              | > 5%               |
| Response Time (p95) | > 500ms           | > 2000ms           |

### Prometheus Alerts

Prometheus is configured with default alerts. View at `https://your-domain.com/prometheus/alerts`

**Default alerts:**

- Service down (any container not running)
- High memory usage (> 90%)
- High CPU usage (> 90%)
- SSL certificate expiring (< 30 days)
- Disk space low (< 15% free)

### Setting Up External Alerting

Configure alert notifications in Grafana:

1. Go to Grafana > Alerting > Contact points
2. Add notification channel (Email, Slack, Discord, PagerDuty)
3. Test notification
4. Assign to alert rules

**Slack webhook example:**

```
https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXX
```

### Log Analysis

View aggregated logs in Grafana > Explore > Loki

**Useful log queries:**

```logql
# Backend errors
{container="freshtrack-backend"} |= "error"

# Slow requests (> 1s)
{container="freshtrack-backend"} | json | response_time > 1000

# Authentication failures
{container="freshtrack-backend"} |= "authentication failed"

# Database errors
{container="freshtrack-backend"} |= "database" |= "error"
```

---

## Security Maintenance

### SSL Certificate Renewal

Caddy handles SSL renewal automatically. Verify certificates:

```bash
# Check certificate expiry
echo | openssl s_client -connect your-domain.com:443 2>/dev/null | openssl x509 -noout -dates

# Check Caddy certificate status
docker compose logs caddy | grep -i "certificate"
```

### System Updates

**Monthly security updates:**

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Check if reboot required
if [ -f /var/run/reboot-required ]; then
  echo "Reboot required"
fi

# Reboot if needed (services auto-start)
sudo reboot
```

### Docker Updates

**Update Docker images monthly:**

```bash
# Pull latest base images
docker compose pull

# Redeploy with new images
sudo ./scripts/deploy-automated.sh
```

### Secret Rotation

**Rotate secrets quarterly:**

1. Generate new secrets:

   ```bash
   openssl rand -base64 32 > secrets/postgres_password_new.txt
   openssl rand -base64 32 > secrets/jwt_secret_new.txt
   ```

2. Update `.env.production` with new values

3. Update database password:

   ```bash
   docker compose exec -T postgres psql -U postgres -c \
     "ALTER USER frostguard PASSWORD '$(cat secrets/postgres_password_new.txt)';"
   ```

4. Restart services:

   ```bash
   docker compose down
   mv secrets/postgres_password_new.txt secrets/postgres_password.txt
   mv secrets/jwt_secret_new.txt secrets/jwt_secret.txt
   docker compose up -d
   ```

5. Verify:
   ```bash
   ./scripts/verify-deployment.sh your-domain.com
   ```

### Firewall Management (UFW)

**Check firewall status:**

```bash
sudo ufw status verbose
```

**Default rules (configured by deployment):**

- SSH (22): Allow
- HTTP (80): Allow
- HTTPS (443): Allow
- All other inbound: Deny

**Add custom rule:**

```bash
sudo ufw allow from 10.0.0.0/8 to any port 5432 proto tcp comment 'PostgreSQL from internal'
```

### Fail2ban Management

**Check banned IPs:**

```bash
sudo fail2ban-client status sshd
```

**Unban an IP:**

```bash
sudo fail2ban-client set sshd unbanip 192.168.1.100
```

**Check fail2ban logs:**

```bash
sudo tail -f /var/log/fail2ban.log
```

---

## Service Management

### Starting and Stopping

```bash
# Start all services
docker compose up -d

# Stop all services (preserves data)
docker compose down

# Restart specific service
docker compose restart backend

# Stop specific service
docker compose stop backend

# View running services
docker compose ps
```

### Viewing Logs

```bash
# All logs, follow mode
docker compose logs -f

# Specific service logs
docker compose logs -f backend

# Last N lines
docker compose logs --tail=100 backend

# Since timestamp
docker compose logs --since 2h backend
```

### Accessing Containers

```bash
# Shell into backend
docker compose exec backend sh

# Shell into postgres
docker compose exec postgres psql -U frostguard -d frostguard

# Run command in container
docker compose exec backend npm run db:migrate
```

### Resource Limits

Default resource limits (from compose.production.yaml):

| Service  | CPU | Memory |
| -------- | --- | ------ |
| backend  | 2   | 2048M  |
| worker   | 1   | 1024M  |
| postgres | 2   | 2048M  |
| redis    | 0.5 | 512M   |
| caddy    | 0.5 | 512M   |

To adjust limits, edit `compose.production.yaml` and restart:

```bash
docker compose down
docker compose up -d
```

---

## Troubleshooting

### Common Issues

#### "Bad Gateway" (502)

Usually means the backend is not running or not reachable by Caddy.

1. Check backend logs: `docker compose logs backend`
2. Check Caddy logs: `docker compose logs caddy`
3. Verify backend is running: `docker compose ps backend`

#### "Database Connection Error"

1. Check Postgres status: `docker compose ps postgres`
2. Check connection logs: `docker compose logs backend | grep -i "database\|postgres"`
3. Verify database is accepting connections: `docker compose exec postgres pg_isready`

#### High Memory Usage

1. Check which container is consuming memory: `docker stats --no-stream`
2. Review backend for memory leaks: `docker compose logs backend | grep -i "memory\|heap"`
3. Consider increasing server memory or optimizing queries

#### Slow Response Times

1. Check database query performance: Enable slow query logging
2. Check container resource limits: `docker stats --no-stream`
3. Review API logs for slow endpoints

### Emergency Procedures

#### Emergency Stop

```bash
docker compose down --timeout 5
```

#### Emergency Restart

```bash
docker compose down --timeout 10 && docker compose up -d
```

#### Force Rebuild

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

---

## Quick Reference

### Essential Commands

```bash
# Deploy/update
sudo ./scripts/deploy-automated.sh

# Verify deployment
./scripts/verify-deployment.sh your-domain.com

# Complete setup
./scripts/post-deploy.sh your-domain.com

# View logs
docker compose logs -f

# Check status
docker compose ps

# Restart
docker compose restart

# Backup database
docker compose exec -T postgres pg_dump -U frostguard -Fc frostguard > backup.dump

# Restore database
docker compose exec -T postgres pg_restore -U frostguard -d frostguard < backup.dump
```

### Important Paths

```
/opt/freshtrack-pro/           # Application root
├── .env.production            # Environment configuration
├── secrets/                   # Secret files (600 permissions)
├── .deploy-state/             # Deployment checkpoints
├── docker-compose.yml         # Base compose file
├── compose.production.yaml    # Production overrides
└── scripts/
    ├── deploy-automated.sh    # Main deployment script
    ├── verify-deployment.sh   # Verification script
    └── post-deploy.sh         # Post-deployment setup
```

### Support Resources

- **Deployment Guide:** docs/SELFHOSTED_DEPLOYMENT.md
- **Troubleshooting:** docs/SELFHOSTED_DEPLOYMENT.md#troubleshooting
- **Environment Variables:** docs/ENVIRONMENT_VARIABLES.md
- **GitHub Issues:** https://github.com/your-org/freshtrack-pro/issues

---

_Last updated: 2026-01-29_
_Version: 2.3_
