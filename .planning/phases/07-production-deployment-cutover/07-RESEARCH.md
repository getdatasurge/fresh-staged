# Phase 7: Production Deployment & Cutover - Research

**Researched:** 2026-01-23
**Domain:** Production infrastructure, Docker Compose deployment, database cutover, observability
**Confidence:** HIGH

## Summary

Production deployment of a self-hosted Docker Compose stack with managed PostgreSQL requires careful attention to configuration layering, resource constraints, health checks, secrets management, and cutover procedures. The standard approach uses environment-specific compose files, Docker secrets for sensitive data, comprehensive health checks, and a dual-write pattern for zero-downtime database migration.

For the FreshTrack Pro migration from Supabase, the recommended approach is:
- **Infrastructure**: DigitalOcean Droplets (cost-effective, simpler than AWS) with managed PostgreSQL, self-hosted Docker Compose for Redis/MinIO
- **Load balancing**: Caddy for single-server simplicity (50-500 users), or Traefik if future Kubernetes migration likely
- **Observability**: Grafana + Loki + Prometheus stack via Docker Compose
- **Cutover**: DNS-based with dual-write fallback capability, full staging rehearsal, 1-week rollback window

**Primary recommendation:** Use DigitalOcean for cost-effective managed PostgreSQL, Caddy for automatic HTTPS and simple configuration, Docker Compose with production-specific overrides, and Grafana observability stack. Cutover via DNS switch with comprehensive pre-flight checks and rollback procedures.

## Standard Stack

### Core Infrastructure

| Component | Version/Provider | Purpose | Why Standard |
|-----------|------------------|---------|--------------|
| Docker Compose | v2.x (Compose Spec v3.8+) | Container orchestration | Industry standard for single-server deployments, native deploy.resources support |
| DigitalOcean Managed PostgreSQL | v15+ | Primary database | $15/month baseline, predictable pricing, SSL by default, automated backups |
| DigitalOcean Droplets | Ubuntu 24.04 LTS | Application hosting | Simple, cost-effective ($12-24/month for 2-4GB RAM), good Docker support |
| Docker Secrets | Built-in | Secrets management | Native Compose integration, mounted at /run/secrets/, encrypted at rest |

### Reverse Proxy / Load Balancer

| Option | Version | Purpose | When to Use |
|--------|---------|---------|-------------|
| Caddy | v2.x | Reverse proxy, auto-HTTPS | Best for single-server, simplicity priority (recommended for 50-500 users) |
| Traefik | v3.x | Dynamic routing, load balancing | Best for microservices, Docker label-based config, future k8s migration |
| Nginx | Latest | Traditional reverse proxy | Most performant, complex config, non-containerized environments |

### Observability Stack

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| Prometheus | v2.x | Metrics collection | De facto metrics standard, time-series DB, 2026 industry leader |
| Grafana | v10.x | Visualization, dashboards | Universal observability platform, integrates Prometheus/Loki/Jaeger |
| Loki | v2.x | Log aggregation | Lightweight logs, pairs with Promtail, Grafana native |
| Promtail | v2.x | Log shipper | Discovers Docker logs, labels, pushes to Loki |

### Supporting Tools

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| PgBouncer | v1.25+ | Connection pooling | Optional but recommended for production (200+ concurrent users) |
| Uptime Kuma | v1.x | Status page | Self-hosted, 95+ notification channels, 20s monitoring intervals |
| fastify-healthcheck | v5.x | Fastify health endpoint | Integrates @fastify/under-pressure, Docker health checks |

**Installation (DigitalOcean):**
```bash
# Create managed PostgreSQL database first via DO dashboard
# Then create Droplet (Ubuntu 24.04, 2GB+ RAM)

# On Droplet:
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
apt install docker-compose-plugin

# Deploy application
docker compose -f compose.yaml -f compose.production.yaml up -d
```

## Architecture Patterns

### Recommended Project Structure

```
project-root/
├── compose.yaml                    # Base configuration (all environments)
├── compose.production.yaml         # Production overrides (resources, secrets, replicas)
├── compose.staging.yaml            # Staging overrides (mirrors production)
├── .env.production                 # Non-secret production env vars
├── secrets/                        # Secrets (gitignored)
│   ├── postgres_password.txt
│   ├── redis_password.txt
│   ├── stack_auth_secret.txt
│   └── minio_credentials.txt
├── backend/
│   ├── Dockerfile                  # Multi-stage build
│   └── src/
├── docker/                         # Production config files
│   ├── caddy/
│   │   └── Caddyfile              # Reverse proxy config
│   ├── prometheus/
│   │   └── prometheus.yml
│   ├── grafana/
│   │   └── dashboards/
│   └── loki/
│       └── loki.yml
└── scripts/
    ├── deploy.sh                   # Deployment automation
    ├── health-check.sh             # Pre-deployment validation
    └── rollback.sh                 # Rollback automation
```

### Pattern 1: Environment-Specific Compose Files

**What:** Layer compose configurations for environment-specific overrides without duplicating base config

**When to use:** Always in production deployments - separates dev and prod concerns

**Example:**
```yaml
# compose.yaml (base)
services:
  backend:
    build: ./backend
    environment:
      NODE_ENV: development
    volumes:
      - ./backend/src:/app/src  # Dev hot-reload

# compose.production.yaml (override)
services:
  backend:
    build:
      context: ./backend
      target: production
    environment:
      NODE_ENV: production
    volumes: []  # Remove dev volumes
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
      restart_policy:
        condition: any
        delay: 5s
        max_attempts: 3
    secrets:
      - postgres_password
      - jwt_secret
```

Source: [Docker Compose Production Documentation](https://docs.docker.com/compose/how-tos/production/)

### Pattern 2: File-Based Docker Secrets

**What:** Mount secrets as files in /run/secrets/ instead of environment variables

**When to use:** Always in production for passwords, API keys, certificates

**Example:**
```yaml
# Source: https://docs.docker.com/compose/how-tos/use-secrets/
services:
  backend:
    image: backend:latest
    secrets:
      - postgres_password
      - jwt_secret
    environment:
      # Use _FILE suffix convention (PostgreSQL, MySQL compatible)
      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password
      JWT_SECRET_FILE: /run/secrets/jwt_secret

secrets:
  postgres_password:
    file: ./secrets/postgres_password.txt
  jwt_secret:
    file: ./secrets/jwt_secret.txt
```

**Benefits:**
- Not exposed in environment variables or logs
- Standard file permissions protect access
- Never committed to images
- Granular service-level access control

### Pattern 3: Comprehensive Health Checks

**What:** Define health checks at container level with proper intervals, retries, and dependencies

**When to use:** All production services - enables proper startup ordering and failure detection

**Example:**
```yaml
# Source: https://last9.io/blog/docker-compose-health-checks/
services:
  postgres:
    image: postgres:15-alpine
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "${POSTGRES_USER}", "-d", "${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  backend:
    build: ./backend
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

**Fastify Health Check:**
```typescript
// Source: https://context7.com/fastify/fastify
import Fastify from 'fastify';
import healthcheck from 'fastify-healthcheck';

const app = Fastify({ logger: true });

// Register health check plugin with under-pressure monitoring
await app.register(healthcheck, {
  healthcheckUrl: '/health',
  exposeUptime: true,
  underPressureOptions: {
    maxEventLoopDelay: 1000,
    maxHeapUsedBytes: 1000000000, // 1GB
    maxRssBytes: 1000000000,
    maxEventLoopUtilization: 0.98
  }
});

// Graceful shutdown for Docker SIGTERM
process.on('SIGTERM', async () => {
  app.log.info('SIGTERM received, shutting down gracefully');
  await app.close();
  process.exit(0);
});
```

### Pattern 4: Zero-Downtime DNS Cutover

**What:** Switch traffic via DNS change while maintaining dual-write capability for rollback

**When to use:** Production cutover from Supabase to self-hosted

**Phases:**
```
1. Pre-Cutover (T-24h):
   - Staging rehearsal complete
   - All health checks green
   - Monitoring dashboards ready
   - Communication sent to users

2. Cutover Window (T-0):
   - Lower DNS TTL to 60 seconds (if not already low)
   - Update DNS records to point to new infrastructure
   - Monitor new system for errors (first 15 minutes critical)
   - Keep Supabase read-only but available

3. Validation (T+15m to T+2h):
   - Verify sensor data flowing correctly
   - Check alert generation working
   - Monitor error rates, response times
   - Confirm user logins successful

4. Stabilization (T+2h to T+24h):
   - Continue monitoring
   - Address any non-critical issues
   - Supabase remains available (read-only)

5. Post-Cutover (T+24h to T+7d):
   - Daily reconciliation checks
   - Monitor for delayed issues
   - Supabase available for rollback if needed
   - After 7 days: Supabase decommissioned
```

**Rollback Decision Tree:**
```
Critical Data Loss? (readings/alerts not captured)
  YES → Immediate rollback
  NO → Continue

User-facing errors?
  YES → High volume (>10% requests)?
    YES → Rollback
    NO → Fix forward
  NO → Continue

Performance degradation?
  YES → Severe (>2x response time)?
    YES → Rollback
    NO → Scale up resources, monitor
  NO → Continue
```

Source: [Zero-Downtime Database Migration Guide](https://dev.to/ari-ghosh/zero-downtime-database-migration-the-definitive-guide-5672), [Blue-Green Deployment Best Practices](https://octopus.com/devops/software-deployments/blue-green-deployment-best-practices/)

### Pattern 5: Dual-Write Fallback (Rollback Scenario)

**What:** Handle data created after cutover during a rollback scenario

**When to use:** Only if rollback triggered within 7-day window

**Strategy:**
```
If rollback needed:

1. Immediately stop writes to new system
2. Switch DNS back to Supabase
3. Export data created after cutover (T+cutover to T+rollback)
4. Analyze data for conflicts/duplicates
5. Manual import critical data to Supabase
6. Notify users of gap period if any data lost
7. Investigate root cause before re-attempting cutover

Data handling:
- Sensor readings: Can be re-imported (append-only, timestamped)
- Alerts: Need manual review (may have already triggered actions)
- User actions: Most critical - need careful reconciliation
- Password resets: Users may need to re-reset passwords

Trade-off: Brief data gap acceptable per user decision, but:
- Capture all post-cutover data in export
- Provide clear communication about gap
- Prioritize critical data (alerts, user changes)
```

### Anti-Patterns to Avoid

- **Environment variables for secrets in production:** Exposed in logs, process lists, container inspections. Use Docker secrets.

- **No resource limits:** Containers can consume all host resources. Always set deploy.resources limits.

- **Single compose file for all environments:** Leads to if/else logic, dev/prod drift. Use compose file layering.

- **DNS cutover without lowering TTL first:** Old DNS entries cached for hours/days. Lower TTL 24-48h before cutover.

- **No staging rehearsal:** Production cutover is not the time to discover issues. Full rehearsal on staging mandatory.

- **Manual deployment steps:** Human error during stress. Automate with scripts, use checklists.

- **Load balancer changes instead of DNS (for single server):** Adds complexity without benefit. DNS is simpler for single-server deployments.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Metrics collection | Custom stats endpoints | Prometheus + node-exporter | Industry standard, built-in alerting, visualization, 1000s of exporters |
| Log aggregation | File tailing scripts | Loki + Promtail | Automatic Docker log discovery, label-based indexing, Grafana integration |
| Health checks | Custom /ping endpoints | fastify-healthcheck + under-pressure | Handles process metrics, memory pressure, event loop monitoring out of box |
| Connection pooling | Manual connection management | PgBouncer | Handles session/transaction pooling, connection limits, auth, failover |
| Status page | Custom status dashboard | Uptime Kuma | 95+ notification channels, SSL monitoring, multi-protocol support, Docker-native |
| SSL certificates | Manual cert management | Caddy auto-HTTPS | Automatic Let's Encrypt, renewal, OCSP stapling, HTTP/3 support |
| Secrets rotation | Custom secret scripts | Cloud provider secret managers | Automated rotation, audit logs, IAM integration, encryption at rest |
| Container restarts | Cron job health checks | Docker restart policies + health checks | Native container orchestration, exponential backoff, health-aware |

**Key insight:** Production operations have been solved repeatedly. The observability stack (Prometheus/Grafana/Loki) is the 2026 industry standard, used from startups to FAANG. Custom solutions miss edge cases and create maintenance burden.

## Common Pitfalls

### Pitfall 1: Inadequate Resource Limits Lead to OOM Kills

**What goes wrong:** Container consumes all available memory, Docker OOM killer terminates it, data loss or service disruption

**Why it happens:** Docker containers have no resource limits by default, memory leaks or traffic spikes can consume all host RAM

**How to avoid:**
- Set memory limits based on observed usage + 50% buffer
- Set memory reservations to guarantee minimum resources
- Monitor actual usage with `docker stats` before setting production limits
- Use health checks to detect before OOM occurs

**Warning signs:**
- Container restarts without obvious errors in logs
- "Killed" messages in `docker logs`
- Host system becomes unresponsive
- `dmesg` shows OOM killer activity

**Example configuration:**
```yaml
# Source: https://docs.docker.com/reference/compose-file/deploy/
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '1.0'      # Hard limit: cannot exceed 1 CPU core
          memory: 1G        # Hard limit: OOM kill if exceeds 1GB
        reservations:
          cpus: '0.25'     # Guaranteed minimum: 25% of 1 core
          memory: 256M      # Guaranteed minimum: 256MB
```

### Pitfall 2: Health Check False Positives (curl Not Installed)

**What goes wrong:** Health check configured to use `curl`, but curl not in container image, Docker marks as unhealthy, container restart loops

**Why it happens:** Minimal container images (alpine) don't include curl/wget by default

**How to avoid:**
- Use CMD form without shell: `["CMD", "executable", "arg"]` to get clear error messages
- Install curl/wget in Dockerfile if needed: `RUN apk add --no-cache curl`
- Or use language-native health checks: `node healthcheck.js`, `python health.py`
- Or use TCP/HTTP checks external to container if application-level endpoint exists

**Warning signs:**
- Container marked unhealthy immediately on start
- No obvious errors in application logs
- Health check logs show "command not found"

**Better alternatives:**
```yaml
# For Node.js/Fastify apps
healthcheck:
  test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health')"]

# For PostgreSQL
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]

# For Redis
healthcheck:
  test: ["CMD", "redis-cli", "ping"]
```

### Pitfall 3: DNS Cutover Without TTL Pre-Lowering

**What goes wrong:** DNS records updated, but old DNS entries cached for hours/days, users split between old and new systems

**Why it happens:** DNS TTL (time-to-live) often set to 3600s (1h) or 86400s (24h), caches don't refresh until TTL expires

**How to avoid:**
- 24-48 hours before cutover: Lower DNS TTL to 60 seconds
- After cutover stabilizes (24h): Raise TTL back to normal (3600s)
- Monitor both old and new systems during propagation window
- Accept brief period of split traffic (expected, not a bug)

**Warning signs:**
- Some users see new system, others see old system
- Duplicate data entries (both systems receiving writes)
- Support tickets about "site looks different"
- Old system still receiving traffic hours after DNS change

**Timeline:**
```
T-48h: Lower TTL from 3600s → 60s
T-24h: Verify TTL propagated (dig +noall +answer domain.com)
T-0:   Update DNS A/AAAA records to new IP
T+1h:  Majority of traffic on new system
T+4h:  Old system traffic negligible
T+24h: Raise TTL back to 3600s
```

Source: [Blue-Green Deployment DNS Considerations](https://moss.sh/deployment/blue-green-deployment-complete-guide/)

### Pitfall 4: Production Data in Staging Rehearsal

**What goes wrong:** Staging rehearsal uses production data, rehearsal notifications/alerts reach real users, confusion and false alarms

**Why it happens:** Easiest way to get "production-like data" is to copy production database

**How to avoid:**
- Use anonymized production data: scramble PII, email addresses, phone numbers
- Disable external integrations in staging: email, SMS, webhooks
- Use separate credentials for staging: Telnyx test numbers, separate TTN orgs
- Clear "this is staging" indicators in UI
- Prefix all staging alerts with [STAGING] in notification channels

**Warning signs:**
- Users receiving test alerts during rehearsal
- Production support tickets about "weird notifications"
- Real sensors showing up in staging dashboard
- External API quota consumed by staging tests

**Staging configuration checklist:**
```bash
# Staging .env differences from production:
NODE_ENV=staging  # Not production
EMAIL_ENABLED=false
SMS_ENABLED=false
ALERT_PREFIX="[STAGING] "
DATABASE_URL=staging-db-url  # Not production
FRONTEND_URL=staging.example.com
```

### Pitfall 5: No Rollback Testing Before Cutover

**What goes wrong:** Critical production issue requires rollback, rollback procedure fails, extended outage

**Why it happens:** Rollback procedures written but never tested, assumptions about data/system state incorrect

**How to avoid:**
- Include rollback test in staging rehearsal
- Perform "cutover then rollback" dry run 48h before real cutover
- Automate rollback with script (with confirmation prompts)
- Document manual steps for script failure scenario
- Test data export/import during rollback

**Warning signs:**
- Rollback script written day-of cutover
- Manual procedure with 15+ steps
- Rollback never practiced
- No backup plan if automation fails

**Rollback automation example:**
```bash
#!/bin/bash
# rollback.sh - Automated rollback with confirmation prompts

set -e

echo "=== ROLLBACK PROCEDURE ==="
echo "This will:"
echo "1. Stop new system"
echo "2. Export data created after cutover"
echo "3. Switch DNS back to Supabase"
echo "4. Notify users"
echo ""
read -p "Continue with rollback? (yes/no): " confirm
[[ "$confirm" != "yes" ]] && exit 1

echo "Step 1: Stopping new system..."
docker compose -f compose.production.yaml stop

echo "Step 2: Exporting post-cutover data..."
./scripts/export-cutover-data.sh

echo "Step 3: Update DNS records"
echo "MANUAL STEP: Update DNS A record to old IP: 1.2.3.4"
read -p "Press enter after DNS updated..."

echo "Step 4: Notification"
curl -X POST $SLACK_WEBHOOK -d '{"text":"ROLLBACK COMPLETE"}'

echo "Rollback complete. Review ./exports/cutover-data.json"
```

## Code Examples

Verified patterns from official sources:

### Production Compose File Structure

```yaml
# compose.yaml - Base configuration
# Source: https://docs.docker.com/compose/how-tos/production/
services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
      target: development
    volumes:
      - ./backend/src:/app/src
    environment:
      NODE_ENV: development
      LOG_LEVEL: debug
    ports:
      - "3000:3000"

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-frostguard}
      POSTGRES_DB: ${POSTGRES_DB:-frostguard}
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes

volumes:
  postgres_data:
```

```yaml
# compose.production.yaml - Production overrides
# Source: https://docs.docker.com/compose/how-tos/production/
services:
  backend:
    build:
      target: production  # Use production stage
    volumes: []  # Remove dev hot-reload volumes
    environment:
      NODE_ENV: production
      LOG_LEVEL: info
    ports:
      - "127.0.0.1:3000:3000"  # Bind to localhost only (Caddy will proxy)
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
      restart_policy:
        condition: any
        delay: 5s
        max_attempts: 3
        window: 120s
    secrets:
      - postgres_password
      - jwt_secret
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password
    secrets:
      - postgres_password
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "${POSTGRES_USER}"]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s

  redis:
    deploy:
      resources:
        limits:
          memory: 256M
        reservations:
          memory: 128M
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

secrets:
  postgres_password:
    file: ./secrets/postgres_password.txt
  jwt_secret:
    file: ./secrets/jwt_secret.txt
```

**Deploy command:**
```bash
docker compose -f compose.yaml -f compose.production.yaml up -d
```

### Caddy Reverse Proxy Configuration

```
# docker/caddy/Caddyfile
# Source: Caddy documentation
{
    email admin@freshtrackpro.com
    # Enable access logs
    log {
        output file /var/log/caddy/access.log
        format json
    }
}

freshtrackpro.com {
    # Automatic HTTPS via Let's Encrypt

    # Reverse proxy to backend
    reverse_proxy backend:3000 {
        # Health check
        health_uri /health
        health_interval 30s
        health_timeout 10s

        # Headers
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }

    # Compress responses
    encode gzip zstd

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}

# Caddy service in compose.production.yaml
services:
  caddy:
    image: caddy:2-alpine
    container_name: caddy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
      - caddy_logs:/var/log/caddy
    restart: unless-stopped
    depends_on:
      backend:
        condition: service_healthy

volumes:
  caddy_data:
  caddy_config:
  caddy_logs:
```

### Grafana Observability Stack

```yaml
# docker/observability/compose.observability.yaml
# Source: https://github.com/mransbro/observability
services:
  prometheus:
    image: prom/prometheus:v2.45.0
    container_name: prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
    volumes:
      - ./docker/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    ports:
      - "127.0.0.1:9090:9090"
    restart: unless-stopped

  loki:
    image: grafana/loki:2.9.0
    container_name: loki
    command: -config.file=/etc/loki/loki.yml
    volumes:
      - ./docker/loki/loki.yml:/etc/loki/loki.yml:ro
      - loki_data:/loki
    ports:
      - "127.0.0.1:3100:3100"
    restart: unless-stopped

  promtail:
    image: grafana/promtail:2.9.0
    container_name: promtail
    command: -config.file=/etc/promtail/promtail.yml
    volumes:
      - ./docker/promtail/promtail.yml:/etc/promtail/promtail.yml:ro
      - /var/log:/var/log:ro
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
    depends_on:
      - loki
    restart: unless-stopped

  grafana:
    image: grafana/grafana:10.2.0
    container_name: grafana
    environment:
      GF_SECURITY_ADMIN_PASSWORD__FILE: /run/secrets/grafana_password
      GF_USERS_ALLOW_SIGN_UP: "false"
      GF_SERVER_ROOT_URL: https://monitoring.freshtrackpro.com
    secrets:
      - grafana_password
    volumes:
      - ./docker/grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
      - ./docker/grafana/datasources:/etc/grafana/provisioning/datasources:ro
      - grafana_data:/var/lib/grafana
    ports:
      - "127.0.0.1:3001:3000"
    depends_on:
      - prometheus
      - loki
    restart: unless-stopped

  node-exporter:
    image: prom/node-exporter:v1.6.0
    container_name: node-exporter
    command:
      - '--path.procfs=/host/proc'
      - '--path.sysfs=/host/sys'
      - '--path.rootfs=/rootfs'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    ports:
      - "127.0.0.1:9100:9100"
    restart: unless-stopped

secrets:
  grafana_password:
    file: ./secrets/grafana_password.txt

volumes:
  prometheus_data:
  loki_data:
  grafana_data:
```

```yaml
# docker/prometheus/prometheus.yml
# Source: Official Prometheus documentation
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']

  - job_name: 'backend'
    static_configs:
      - targets: ['backend:3000']
    metrics_path: '/metrics'
```

```yaml
# docker/loki/loki.yml
# Source: https://grafana.com/docs/loki/latest/setup/install/docker/
auth_enabled: false

server:
  http_listen_port: 3100

ingester:
  lifecycler:
    ring:
      kvstore:
        store: inmemory
      replication_factor: 1
  chunk_idle_period: 5m
  chunk_retain_period: 30s

schema_config:
  configs:
    - from: 2024-01-01
      store: boltdb-shipper
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 24h

storage_config:
  boltdb_shipper:
    active_index_directory: /loki/index
    cache_location: /loki/cache
    shared_store: filesystem
  filesystem:
    directory: /loki/chunks

limits_config:
  enforce_metric_name: false
  reject_old_samples: true
  reject_old_samples_max_age: 168h

chunk_store_config:
  max_look_back_period: 720h

table_manager:
  retention_deletes_enabled: true
  retention_period: 720h
```

### Fastify Graceful Shutdown

```typescript
// backend/src/index.ts
// Source: https://context7.com/fastify/fastify
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

const app: FastifyInstance = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty' }
      : undefined
  }
});

// Health check endpoint
app.get('/health', async (request, reply) => {
  // Check database connectivity
  const dbHealthy = await checkDatabase();
  const redisHealthy = await checkRedis();

  if (!dbHealthy || !redisHealthy) {
    return reply.code(503).send({
      status: 'unhealthy',
      checks: {
        database: dbHealthy,
        redis: redisHealthy
      }
    });
  }

  return {
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  };
});

// Graceful shutdown for Docker SIGTERM
const closeGracefully = async (signal: string) => {
  app.log.info(`Received ${signal}, closing gracefully`);

  // Stop accepting new requests
  await app.close();

  // Additional cleanup if needed
  // await db.close();
  // await redis.quit();

  process.exit(0);
};

process.on('SIGTERM', () => closeGracefully('SIGTERM'));
process.on('SIGINT', () => closeGracefully('SIGINT'));

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000');
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });
    app.log.info(`Server listening on ${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
```

### Deployment and Rollback Scripts

```bash
#!/bin/bash
# scripts/deploy.sh - Production deployment automation

set -e

echo "=== FreshTrack Pro Production Deployment ==="

# Pre-flight checks
echo "Step 1: Pre-flight checks..."
./scripts/health-check.sh || { echo "Pre-flight checks failed"; exit 1; }

# Pull latest images
echo "Step 2: Pulling latest images..."
docker compose -f compose.yaml -f compose.production.yaml pull

# Build backend
echo "Step 3: Building backend..."
docker compose -f compose.yaml -f compose.production.yaml build backend

# Run database migrations
echo "Step 4: Running database migrations..."
docker compose -f compose.yaml -f compose.production.yaml run --rm backend pnpm db:migrate

# Deploy with zero downtime (start new containers before stopping old)
echo "Step 5: Deploying..."
docker compose -f compose.yaml -f compose.production.yaml up -d --no-deps --build

# Wait for health checks
echo "Step 6: Waiting for health checks..."
timeout 120 bash -c 'until docker compose -f compose.yaml -f compose.production.yaml ps | grep "healthy"; do sleep 2; done' || {
  echo "Health checks failed, rolling back..."
  docker compose -f compose.yaml -f compose.production.yaml down
  exit 1
}

# Cleanup old images
echo "Step 7: Cleanup..."
docker image prune -f

echo "Deployment complete!"
echo "Monitor: https://monitoring.freshtrackpro.com"
```

```bash
#!/bin/bash
# scripts/health-check.sh - Pre-deployment validation

set -e

echo "=== Pre-deployment Health Checks ==="

# Check disk space (need at least 5GB free)
DISK_FREE=$(df / | tail -1 | awk '{print $4}')
if [ $DISK_FREE -lt 5242880 ]; then
  echo "ERROR: Less than 5GB disk space available"
  exit 1
fi
echo "✓ Disk space sufficient"

# Check Docker running
docker info > /dev/null 2>&1 || { echo "ERROR: Docker not running"; exit 1; }
echo "✓ Docker running"

# Check secrets exist
for secret in postgres_password jwt_secret; do
  [ -f "./secrets/${secret}.txt" ] || { echo "ERROR: Secret ${secret}.txt missing"; exit 1; }
done
echo "✓ Secrets present"

# Check database connectivity (managed PostgreSQL)
docker run --rm postgres:15-alpine pg_isready -h $DB_HOST -U $DB_USER || {
  echo "ERROR: Cannot connect to managed PostgreSQL"
  exit 1
}
echo "✓ Database reachable"

# Check DNS resolution
dig +short freshtrackpro.com > /dev/null || {
  echo "ERROR: DNS not resolving"
  exit 1
}
echo "✓ DNS resolving"

echo "All pre-flight checks passed!"
```

## State of the Art

| Old Approach | Current Approach (2026) | When Changed | Impact |
|--------------|-------------------------|--------------|--------|
| Environment variables for secrets | Docker secrets (file-based) | 2019-2020 | Secrets no longer in env vars, logs, or process lists |
| Manual SSL cert management | Automatic HTTPS (Caddy/Traefik) | 2020-2021 | Zero-config Let's Encrypt, auto-renewal |
| ELK Stack (Elasticsearch, Logstash, Kibana) | PLG Stack (Prometheus, Loki, Grafana) | 2021-2023 | Lighter weight, lower resource usage, better Docker integration |
| Docker Compose v2 format | Compose Spec v3.8+ | 2022 | deploy.resources support, better health check syntax |
| Blue-green via load balancer | DNS-based for single server | 2023-2024 | Simpler for single-server deployments (50-500 users) |
| Nginx for all reverse proxy | Caddy for simplicity, Traefik for microservices | 2024-2025 | Auto-HTTPS reduces config, Docker label-based routing |
| PgBouncer v1.x | PgBouncer v1.25+ | 2025 | LDAP auth, direct TLS, SCRAM performance, idle reporting |
| Connection pooling always | Connection pooling optional until 200+ users | 2025-2026 | Managed databases handle pooling internally for smaller scale |

**Deprecated/outdated:**
- **Docker Compose version: "3"**: Deprecated in favor of omitting version field (Compose Spec)
- **Using environment variables for secrets**: Replaced by Docker secrets
- **mem_limit syntax**: Replaced by deploy.resources.limits.memory
- **links**: Replaced by networks (automatic)
- **Using Docker Swarm for single server**: Overkill - Docker Compose sufficient for single server

## Open Questions

Things that couldn't be fully resolved:

1. **DigitalOcean Managed PostgreSQL vs Self-Hosted**
   - What we know: Managed is $15/month baseline, self-hosted requires more maintenance, backups, monitoring
   - What's unclear: Exact performance difference at 50-500 users, whether connection limit (25 on basic plan) sufficient
   - Recommendation: Start with managed PostgreSQL basic plan ($15/month), add PgBouncer if hitting connection limits, upgrade to $55/month plan (60 connections) before self-hosting

2. **When to Scale Horizontally (Multiple Droplets)**
   - What we know: Single 2-4GB Droplet sufficient for 50-500 users per industry patterns
   - What's unclear: Exact threshold where single server becomes bottleneck for FreshTrack Pro workload
   - Recommendation: Monitor CPU/memory/network. Scale up vertically first (4GB→8GB Droplet $48/month), then horizontal (multiple Droplets + load balancer) only if single 8GB Droplet saturated

3. **Post-Cutover Data Reconciliation Automation**
   - What we know: Manual reconciliation possible, automated row-count/checksum comparisons standard
   - What's unclear: Which specific tables most critical for FreshTrack Pro, acceptable reconciliation window
   - Recommendation: Build automated reconciliation script for sensor_readings (row count by sensor_id + hour), alerts (count by status), users (count by role). Run every 6 hours for first week, then daily for remainder of rollback window.

## Sources

### Primary (HIGH confidence)

- **/docker/compose** (Context7) - Compose file syntax, production patterns, secrets
- **/fastify/fastify** (Context7) - Health checks, graceful shutdown, lifecycle hooks
- [Docker Compose Production Best Practices](https://docs.docker.com/compose/how-tos/production/) - Official production guidance
- [Docker Compose Deploy Specification](https://docs.docker.com/reference/compose-file/deploy/) - Resource limits, restart policies
- [Docker Secrets in Compose](https://docs.docker.com/compose/how-tos/use-secrets/) - Secrets syntax and best practices
- [Grafana Loki Docker Installation](https://grafana.com/docs/loki/latest/setup/install/docker/) - Official observability stack setup

### Secondary (MEDIUM confidence)

- [Use Compose in production | Docker Docs](https://docs.docker.com/compose/how-tos/production/) - Environment-specific files, deployment updates
- [Docker Best Practices 2026 - Thinksys](https://thinksys.com/devops/docker-best-practices/) - Health checks, security, version control
- [Zero-Downtime Database Migration Guide](https://dev.to/ari-ghosh/zero-downtime-database-migration-the-definitive-guide-5672) - Dual-write, replication, cutover phases
- [Blue-Green Deployment Best Practices 2025](https://octopus.com/devops/software-deployments/blue-green-deployment-best-practices/) - DNS cutover, rollback strategies
- [AWS RDS vs DigitalOcean Managed Databases](https://www.digitalocean.com/resources/articles/aws-rds-vs-digitalocean-managed-databases) - Cost comparison, pricing models
- [PostgreSQL Hosting Options 2025 Pricing](https://www.bytebase.com/blog/postgres-hosting-options-pricing-comparison/) - Provider comparison
- [Docker Compose Health Checks Guide](https://last9.io/blog/docker-compose-health-checks/) - Health check syntax, CMD vs CMD-SHELL, dependencies
- [Resource Constraints | Docker Docs](https://docs.docker.com/engine/containers/resource_constraints/) - CPU/memory limits, monitoring
- [Caddy vs Nginx vs Traefik Comparison](https://tolumichael.com/caddy-vs-nginx-vs-traefik-a-comprehensive-analysis/) - Reverse proxy trade-offs
- [PgBouncer for PostgreSQL](https://www.percona.com/blog/pgbouncer-for-postgresql-how-connection-pooling-solves-enterprise-slowdowns/) - Connection pooling benefits, modes
- [Uptime Kuma](https://uptimekuma.org/) - Self-hosted status page features
- [Cutover Planning Guide](https://www.enov8.com/blog/mastering-the-art-of-cutover-planning-a-step-by-step-guide/) - Communication, rollback, verification
- [AWS Cutover Stage Guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/best-practices-migration-cutover/cutover-stage.html) - Operational readiness, validation
- [Staging Environment Best Practices](https://northflank.com/blog/what-is-a-staging-environment-how-to-set-one-up) - Production parity, rehearsal approach

### Tertiary (LOW confidence - marked for validation)

- [Docker Compose Production Ready Apps - Nick Janetakis](https://nickjanetakis.com/blog/best-practices-around-production-ready-web-apps-with-docker-compose) - Anecdotal production patterns (2020, needs verification)
- [10 Tips for Docker Compose Hosting](https://blog.cloud66.com/10-tips-for-docker-compose-hosting-in-production) - General tips without specific version references
- Community forum discussions on Traefik load balancing (scenario-specific, may not apply)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Docker Compose, Fastify, observability stack verified via Context7 and official docs
- Architecture: HIGH - Compose layering, secrets, health checks from Docker official documentation
- Pitfalls: HIGH - Drawn from official docs, community-verified issues, and production incident reports
- Infrastructure choice (DigitalOcean vs AWS): MEDIUM - Cost data verified, but performance claims based on general industry patterns
- Rollback procedures: MEDIUM - Patterns verified, but FreshTrack-specific data handling needs validation

**Research date:** 2026-01-23
**Valid until:** 2026-03-23 (60 days - infrastructure and deployment patterns relatively stable)

**Technologies verified:**
- Docker Compose Spec v3.8+: Current as of 2026
- Fastify v5.x: Current as of 2026
- Prometheus/Loki/Grafana: Versions current as of 2026
- PgBouncer v1.25: Released 2025, current
- Caddy v2.x, Traefik v3.x: Current major versions

**Next validation needed:**
- DigitalOcean managed PostgreSQL pricing (may change quarterly)
- Caddy/Traefik feature comparison (rapid development)
- Observability stack versions (check for major releases)
