# Phase 9: Production Environment Hardening - Research

**Researched:** 2026-01-23
**Domain:** Docker Compose production hardening, secrets management, resource controls
**Confidence:** HIGH

## Summary

This phase hardens the existing Docker Compose stack for production deployment through four key areas: secrets management with Infisical, resource limits to prevent runaway containers, health checks for zero-downtime deployments, and production-specific configuration overlays.

The research confirms that Docker Compose production hardening follows well-established patterns in 2026. Infisical (selected in phase context) provides centralized secrets management with rotation capabilities superior to Docker Secrets. Resource limits prevent OOM kills and system crashes. Health checks enable zero-downtime rolling updates when combined with tools like `docker-rollout`. Production overlays (`compose.prod.yaml`, `compose.selfhosted.yaml`, `compose.digitalocean.yaml`) allow environment-specific configuration without duplication.

The stack currently has health checks on infrastructure services (PostgreSQL, PgBouncer, Redis, MinIO) but lacks resource limits, production overrides, and centralized secrets management. The backend Dockerfile has a good multi-stage production target with health checks. The .dockerignore properly excludes `.env` files but needs expansion for other credential patterns.

**Primary recommendation:** Implement layered production configuration starting with Infisical for secrets, add resource limits based on service type and load testing, configure health checks for application services, and create production compose overlays with JSON structured logging for Loki integration.

## Standard Stack

The established libraries/tools for Docker Compose production hardening:

### Core

| Library                                                    | Version | Purpose                          | Why Standard                                                                 |
| ---------------------------------------------------------- | ------- | -------------------------------- | ---------------------------------------------------------------------------- |
| [Docker Compose](https://docs.docker.com/compose/)         | v3+     | Multi-container orchestration    | Official Docker tooling, compose spec v3+ required for resource limits       |
| [Infisical](https://infisical.com/)                        | Latest  | Centralized secrets management   | Open-source, self-hosted, superior to Docker Secrets for rotation/management |
| [Docker BuildKit](https://docs.docker.com/build/buildkit/) | Latest  | Secure builds with secret mounts | Prevents secrets in image layers via `--mount=type=secret`                   |

### Supporting

| Library                                                                             | Version | Purpose                   | When to Use                                                    |
| ----------------------------------------------------------------------------------- | ------- | ------------------------- | -------------------------------------------------------------- |
| [docker-rollout](https://github.com/wowu/docker-rollout)                            | Latest  | Zero-downtime deployments | Rolling updates for Docker Compose (Swarm feature for Compose) |
| [Loki Docker Driver](https://grafana.com/docs/loki/latest/send-data/docker-driver/) | Latest  | Structured log shipping   | Already have Loki from Phase 7, driver lighter than Promtail   |
| [Prometheus Node Exporter](https://prometheus.io/docs/guides/node-exporter/)        | Latest  | Host metrics              | Already configured from Phase 7                                |

### Alternatives Considered

| Instead of         | Could Use         | Tradeoff                                                                                 |
| ------------------ | ----------------- | ---------------------------------------------------------------------------------------- |
| Infisical          | Docker Secrets    | Docker Secrets simpler but no rotation, no centralized UI, no external access            |
| Infisical          | HashiCorp Vault   | Vault more enterprise features but complex setup, resource-heavy                         |
| docker-rollout     | Docker Swarm      | Swarm has native rolling updates but requires swarm mode, more complex                   |
| Alpine base images | Distroless images | Distroless more secure (no shell, smaller attack surface) but less tooling for debugging |

**Installation:**

```bash
# Infisical (via docker-compose)
curl -o docker-compose.infisical.yml https://raw.githubusercontent.com/Infisical/infisical/main/docker-compose.prod.yml

# docker-rollout (for zero-downtime deployments)
curl -sL https://github.com/wowu/docker-rollout/releases/latest/download/docker-rollout-linux-amd64 -o /usr/local/bin/docker-rollout
chmod +x /usr/local/bin/docker-rollout

# Loki Docker Driver Plugin
docker plugin install grafana/loki-docker-driver:latest --alias loki --grant-all-permissions
```

## Architecture Patterns

### Recommended Project Structure

```
docker/
├── docker-compose.yml                 # Base development configuration
├── compose.prod.yaml                  # Shared production settings
├── compose.selfhosted.yaml            # Self-hosted specific overrides
├── compose.digitalocean.yaml          # DigitalOcean specific overrides
├── .env.example                       # Environment template
├── infisical/
│   └── docker-compose.infisical.yml   # Infisical secrets manager stack
├── caddy/
│   └── Caddyfile                      # Reverse proxy config
├── prometheus/
│   └── prometheus.yml                 # Metrics scraping config
├── grafana/
│   └── provisioning/                  # Dashboards and datasources
├── loki/
│   └── loki.yml                       # Log aggregation config
└── promtail/
    └── promtail.yml                   # Log shipping config

backend/
├── Dockerfile                         # Multi-stage with production target
└── .dockerignore                      # Excludes secrets and dev files
```

### Pattern 1: Layered Production Configuration

**What:** Override base compose with environment-specific production files
**When to use:** Multiple deployment targets with shared production settings
**Example:**

```yaml
# Source: https://docs.docker.com/compose/how-tos/production/
# compose.prod.yaml - Shared production settings
services:
  postgres:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2GB
        reservations:
          cpus: '1.0'
          memory: 1GB
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
        window: 120s
    logging:
      driver: loki
      options:
        loki-url: "http://loki:3100/loki/api/v1/push"
        loki-batch-size: "400"
        loki-external-labels: "environment=production,service=postgres"

# compose.selfhosted.yaml - Self-hosted specific
services:
  postgres:
    ports:
      - "127.0.0.1:5432:5432"  # Bind to localhost only
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password

secrets:
  postgres_password:
    file: /var/infisical/secrets/postgres_password
```

**Usage:**

```bash
docker compose -f docker-compose.yml -f compose.prod.yaml -f compose.selfhosted.yaml up -d
```

### Pattern 2: Infisical Secret Injection

**What:** Mount secrets from Infisical into containers at runtime
**When to use:** All production deployments requiring credentials
**Example:**

```yaml
# Source: https://infisical.com/docs/self-hosting/deployment-options/docker-compose
services:
  backend:
    environment:
      # Reference Infisical-managed secrets
      DATABASE_URL_FILE: /run/secrets/database_url
      STACK_AUTH_SECRET_KEY_FILE: /run/secrets/stack_auth_secret
    secrets:
      - database_url
      - stack_auth_secret

secrets:
  database_url:
    external: true
    name: infisical_database_url
  stack_auth_secret:
    external: true
    name: infisical_stack_auth_secret
```

### Pattern 3: Resource Limits by Service Type

**What:** Set CPU/memory limits based on service resource profile
**When to use:** Production deployments to prevent resource contention
**Example:**

```yaml
# Source: https://docs.docker.com/reference/compose-file/deploy/
services:
  # Database - High memory, moderate CPU
  postgres:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2GB
        reservations:
          cpus: '1.0'
          memory: 1GB

  # Connection pooler - Low memory, low CPU
  pgbouncer:
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256MB
        reservations:
          cpus: '0.25'
          memory: 128MB

  # Application - Moderate resources, scale horizontally
  backend:
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '1.0'
          memory: 1GB
        reservations:
          cpus: '0.5'
          memory: 512MB
```

### Pattern 4: Multi-Layer Health Checks

**What:** Combine startup period, interval, and retries for reliable health detection
**When to use:** All services requiring zero-downtime deployments
**Example:**

```yaml
# Source: https://docs.docker.com/reference/compose-file/services/
services:
  backend:
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s # Bootstrap time
      start_interval: 5s # Faster checks during startup

  postgres:
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}']
      interval: 10s
      timeout: 10s
      retries: 5
      start_period: 30s
```

### Pattern 5: Secure Docker Builds

**What:** Use BuildKit secret mounts to prevent credentials in image layers
**When to use:** Building images requiring credentials (npm private registry, etc.)
**Example:**

```dockerfile
# Source: https://docs.docker.com/build/building/secrets/
# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder

WORKDIR /app

# Mount secret during build only - never persisted in layers
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    pnpm install --frozen-lockfile

# Secret is unmounted before layer persists
```

```bash
# Build with secret
docker buildx build --secret id=npmrc,src=$HOME/.npmrc -t myapp:latest .
```

### Pattern 6: Zero-Downtime Rolling Updates

**What:** Use docker-rollout to scale up new container, health check, then remove old
**When to use:** Production deployments requiring zero downtime
**Example:**

```yaml
# Source: https://github.com/wowu/docker-rollout
services:
  backend:
    # MUST have health check for rollout to work
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health']
      interval: 15s
      timeout: 5s
      retries: 3
```

```bash
# Deploy with zero downtime
docker-rollout -f compose.prod.yaml backend

# Rollout process:
# 1. Scale backend to 2 instances
# 2. Wait for new instance health check to pass
# 3. Remove old instance
# 4. Scale back to 1 instance
```

### Anti-Patterns to Avoid

- **Environment variables for secrets:** Visible in `docker inspect`, process lists, and logs. Use Docker Secrets or secret files instead.
- **No resource limits:** Allows runaway containers to crash host. Always set limits in production.
- **No health checks:** Prevents zero-downtime deployments and auto-recovery. Required for production.
- **Secrets in Dockerfile:** `ENV` and `ARG` persist in image layers forever. Use BuildKit secret mounts.
- **Using `latest` tag:** Unpredictable deployments. Always pin versions (`postgres:15-alpine`, `redis:7-alpine`).
- **`oom_kill_disable`:** Docker strongly discourages disabling OOM killer. Let containers restart on OOM instead.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem                    | Don't Build                    | Use Instead                      | Why                                                                 |
| -------------------------- | ------------------------------ | -------------------------------- | ------------------------------------------------------------------- |
| Secrets rotation           | Cron scripts updating env vars | Infisical with rotation policies | Handles rotation, audit logs, access control, API integration       |
| Zero-downtime deployment   | Custom rolling update scripts  | docker-rollout or Docker Swarm   | Health check integration, rollback on failure, battle-tested        |
| Log aggregation            | Custom log shippers            | Loki Docker Driver or Promtail   | Automatic container metadata, label extraction, Grafana integration |
| TLS certificate management | Manual Let's Encrypt scripts   | Caddy with automatic HTTPS       | Auto-renewal, OCSP stapling, cert storage, zero config              |
| Resource monitoring        | Custom metric collectors       | Prometheus + Node Exporter       | Standard metrics, exporters for all services, alerting              |
| Health check endpoints     | Custom `/ping` implementations | Standard `/health` with checks   | Standardized, integrates with Docker, orchestrators, load balancers |

**Key insight:** Docker Compose production hardening is a solved problem in 2026. The tooling ecosystem (Infisical, docker-rollout, Loki driver, Caddy, Prometheus) is mature and well-integrated. Custom solutions introduce maintenance burden and miss edge cases (cert renewal failures, log rotation, health check flapping, secret audit trails).

## Common Pitfalls

### Pitfall 1: Secrets Persist in Image Layers

**What goes wrong:** Using `ARG` or `ENV` for secrets during build causes them to persist in image layers forever, visible in `docker history`.
**Why it happens:** Developers think removing a secret in a later layer deletes it, but Docker's immutable layer architecture preserves it.
**How to avoid:**

- Use BuildKit `--mount=type=secret` for build-time secrets (never persisted)
- Use Docker Secrets or secret files for runtime secrets (mounted at runtime)
- Add comprehensive `.dockerignore` patterns (`.env*`, `*.key`, `*.pem`, `secrets/`)
  **Warning signs:**
- Secrets visible in `docker history <image>`
- Secrets found in exported tar archives (`docker save`)
- Security scanners (Trivy, GitGuardian) detect credentials in layers

### Pitfall 2: Insufficient Resource Limits Cause OOM Kills

**What goes wrong:** Without memory limits, containers consume all host RAM, triggering Linux OOM killer which terminates random processes (possibly Docker daemon or critical services).
**Why it happens:** Developers test on high-memory dev machines, but production runs on smaller VMs. Memory leaks or traffic spikes exhaust RAM.
**How to avoid:**

- Always set `deploy.resources.limits` in production compose files
- Set limits to 1.5x observed peak usage from load testing
- Set `restart_policy: on-failure` to auto-restart OOM-killed containers
- Monitor with Prometheus alerts on memory usage >80%
  **Warning signs:**
- `docker logs` shows "Killed" with exit code 137
- Host system logs show "Out of memory: Kill process"
- Services randomly restart without error logs

### Pitfall 3: Health Checks Fail During Deployment

**What goes wrong:** Health checks mark new containers as unhealthy during bootstrap (DB migrations, cache warming), preventing zero-downtime deployment.
**Why it happens:** `start_period` too short for initialization, or health check endpoint requires dependencies that aren't ready yet.
**How to avoid:**

- Set `start_period` longer than worst-case bootstrap time
- Use shallow health checks (app responding) not deep checks (DB connectivity) during startup
- Configure `start_interval` for faster checks during bootstrap (5s vs 30s normal interval)
- Implement health check endpoint with `/health` (shallow) and `/health/ready` (deep)
  **Warning signs:**
- Containers restart in loop during deployment
- Health checks timeout during first 30-60 seconds
- Zero-downtime deployments roll back immediately

### Pitfall 4: Production Override Files Not Applied

**What goes wrong:** Developers deploy with base `docker-compose.yml` only, missing production resource limits, logging, and secrets configuration.
**Why it happens:** Deployment scripts hardcode `docker compose up` instead of using `-f` flags for overrides, or CI/CD doesn't pass production files.
**How to avoid:**

- Document exact deployment command with all override files in README
- Use environment variable: `COMPOSE_FILE=docker-compose.yml:compose.prod.yaml:compose.selfhosted.yaml`
- Validate production config in CI with `docker compose -f ... config` (renders final merged config)
- Add verification step checking resource limits exist after deployment
  **Warning signs:**
- `docker inspect` shows no memory limits in production
- Containers log to default JSON driver instead of Loki
- Secrets mounted from `.env` files instead of Infisical

### Pitfall 5: Infisical Single Point of Failure

**What goes wrong:** All services depend on Infisical for secrets at startup. If Infisical crashes or DB corrupts, entire stack fails to start.
**Why it happens:** No fallback mechanism, secrets not cached locally, Infisical has no health check or backup.
**How to avoid:**

- Configure Infisical with its own health check and auto-restart
- Back up Infisical PostgreSQL database regularly
- Use `depends_on` with `condition: service_healthy` for Infisical dependencies
- Consider exporting critical secrets to encrypted local files as fallback
- Document manual recovery procedure (restore Infisical DB from backup)
  **Warning signs:**
- All services stuck in restart loop if Infisical container stops
- No automated Infisical database backups configured
- No documented recovery procedure

### Pitfall 6: Logs Overwhelm Loki Storage

**What goes wrong:** High-traffic services produce GBs of logs daily, filling disk and crashing Loki.
**Why it happens:** No log retention policy, debug logging in production, no rate limits on log shipping.
**How to avoid:**

- Configure Loki retention period (`retention_deletes_enabled: true`, `retention_period: 30d`)
- Use structured JSON logging with levels, filter debug logs in production
- Set Loki Docker Driver `loki-batch-size` and `loki-retries` to prevent memory buildup
- Monitor Loki disk usage with Prometheus alerts
  **Warning signs:**
- Loki disk usage grows unbounded
- Loki OOM kills or slow query performance
- Grafana logs panel times out loading data

## Code Examples

Verified patterns from official sources:

### Docker Compose Production Configuration with Resource Limits

```yaml
# Source: https://docs.docker.com/reference/compose-file/deploy/
services:
  postgres:
    image: postgres:15-alpine
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2GB
        reservations:
          cpus: '1.0'
          memory: 1GB
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
        window: 120s
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}']
      interval: 10s
      timeout: 10s
      retries: 5
      start_period: 30s
    logging:
      driver: loki
      options:
        loki-url: 'http://loki:3100/loki/api/v1/push'
        loki-external-labels: 'service=postgres,environment=production'

  pgbouncer:
    image: bitnami/pgbouncer:latest
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256MB
        reservations:
          cpus: '0.25'
          memory: 128MB
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -h localhost -p 6432 -U $${PGBOUNCER_USER}']
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command:
      [
        'redis-server',
        '--appendonly',
        'yes',
        '--maxmemory',
        '512mb',
        '--maxmemory-policy',
        'allkeys-lru',
      ]
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 768MB # 512MB data + 256MB overhead
        reservations:
          cpus: '0.5'
          memory: 512MB
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 5

  minio:
    image: minio/minio:RELEASE.2026-01-10T21-58-47Z # Version pinned
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 2GB
        reservations:
          cpus: '0.5'
          memory: 1GB
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:9000/minio/health/live']
      interval: 10s
      timeout: 5s
      retries: 3

  backend:
    build:
      context: ./backend
      target: production
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '1.0'
          memory: 1GB
        reservations:
          cpus: '0.5'
          memory: 512MB
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
      start_interval: 5s
    logging:
      driver: loki
      options:
        loki-url: 'http://loki:3100/loki/api/v1/push'
        loki-external-labels: 'service=backend,environment=production'
```

### Docker Compose Secrets Configuration

```yaml
# Source: https://docs.docker.com/reference/compose-file/services/
services:
  postgres:
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password
    secrets:
      - postgres_password
      - postgres_replication_password

  backend:
    environment:
      DATABASE_URL_FILE: /run/secrets/database_url
      STACK_AUTH_SECRET_KEY_FILE: /run/secrets/stack_auth_secret
    secrets:
      - database_url
      - stack_auth_secret

secrets:
  postgres_password:
    file: /var/infisical/secrets/postgres_password
  postgres_replication_password:
    file: /var/infisical/secrets/postgres_replication_password
  database_url:
    file: /var/infisical/secrets/database_url
  stack_auth_secret:
    file: /var/infisical/secrets/stack_auth_secret
```

### Comprehensive .dockerignore

```
# Source: https://docs.docker.com/build/building/context/#dockerignore-files
# Dependencies
node_modules
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Environment and secrets (CRITICAL)
.env
.env.*
!.env.example
*.key
*.pem
*.p12
*.pfx
secrets/
config/*.secret

# Build output
dist
build
.next
out

# Test and coverage
tests
*.test.ts
*.spec.ts
coverage
.nyc_output

# Development
.vscode
.idea
*.log
.DS_Store
Thumbs.db

# Git
.git
.gitignore
.gitattributes

# CI/CD
.github
.gitlab-ci.yml
.circleci
```

### Infisical Docker Compose Stack

```yaml
# Source: https://infisical.com/docs/self-hosting/deployment-options/docker-compose
# docker-compose.infisical.yml
services:
  infisical-db:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: infisical
      POSTGRES_PASSWORD: ${INFISICAL_DB_PASSWORD}
      POSTGRES_DB: infisical
    volumes:
      - infisical_db_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U infisical']
      interval: 5s
      timeout: 5s
      retries: 5

  infisical-redis:
    image: redis:7-alpine
    volumes:
      - infisical_redis_data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 5

  infisical:
    image: infisical/infisical:latest
    depends_on:
      infisical-db:
        condition: service_healthy
      infisical-redis:
        condition: service_healthy
    environment:
      DB_CONNECTION_URI: postgresql://infisical:${INFISICAL_DB_PASSWORD}@infisical-db:5432/infisical
      REDIS_URL: redis://infisical-redis:6379
      ENCRYPTION_KEY: ${INFISICAL_ENCRYPTION_KEY} # Generate with: openssl rand -hex 32
      AUTH_SECRET: ${INFISICAL_AUTH_SECRET} # Generate with: openssl rand -hex 32
      SITE_URL: https://secrets.yourdomain.com
    ports:
      - '80:80'
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost/api/status']
      interval: 10s
      timeout: 5s
      retries: 3

volumes:
  infisical_db_data:
  infisical_redis_data:
```

### Health Check Endpoint Implementation (Node.js/Express)

```typescript
// Source: Production best practices from research
// backend/src/routes/health.ts
import express from 'express';
import { db } from '../db';
import { redis } from '../cache';

const router = express.Router();

// Shallow health check - app is responding
router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Deep health check - dependencies ready
router.get('/health/ready', async (req, res) => {
  const checks = {
    database: false,
    redis: false,
  };

  try {
    // Check database connectivity
    await db.query('SELECT 1');
    checks.database = true;
  } catch (error) {
    console.error('Database health check failed:', error);
  }

  try {
    // Check Redis connectivity
    await redis.ping();
    checks.redis = true;
  } catch (error) {
    console.error('Redis health check failed:', error);
  }

  const healthy = checks.database && checks.redis;
  const status = healthy ? 200 : 503;

  res.status(status).json({
    status: healthy ? 'ready' : 'not ready',
    checks,
  });
});

export default router;
```

### Zero-Downtime Deployment Script

```bash
# Source: https://github.com/wowu/docker-rollout
#!/bin/bash
set -euo pipefail

# Load production configuration
export COMPOSE_FILE="docker-compose.yml:compose.prod.yaml:compose.selfhosted.yaml"

# Pull latest images
echo "Pulling latest images..."
docker compose pull

# Rolling update of backend service
echo "Deploying backend with zero downtime..."
docker-rollout backend

# Health check verification
echo "Verifying deployment..."
sleep 5
curl -f http://localhost:3000/health || {
  echo "Health check failed! Rolling back..."
  docker compose up -d --force-recreate backend
  exit 1
}

echo "Deployment successful!"
```

## State of the Art

| Old Approach            | Current Approach                                   | When Changed     | Impact                                                 |
| ----------------------- | -------------------------------------------------- | ---------------- | ------------------------------------------------------ |
| Docker Secrets (swarm)  | External secrets managers (Infisical, Vault)       | 2023-2024        | Centralized rotation, audit logs, API access, web UI   |
| Manual resource limits  | Automatic profiling tools (cAdvisor, docker stats) | 2024-2025        | Data-driven limits based on actual usage               |
| Static compose files    | Environment-specific overlays                      | Always supported | Single source of truth with env-specific overrides     |
| JSON file logging       | Structured logging drivers (Loki, Fluentd)         | 2022-2023        | Centralized logs with metadata, easier troubleshooting |
| Alpine base images      | Distroless images                                  | 2024-2025        | Smaller attack surface, no shell, better security      |
| Docker Compose v2       | Docker Compose v3+                                 | 2020-2021        | Resource limits, secrets, configs, deploy section      |
| docker-compose (Python) | docker compose (Go plugin)                         | 2021-2022        | Faster, better maintained, official Docker tooling     |

**Deprecated/outdated:**

- **Docker Swarm for production:** Kubernetes or managed services (ECS, Cloud Run) replaced Swarm for large deployments. Docker Compose sufficient for small-medium self-hosted.
- **--oom-kill-disable flag:** Strongly discouraged by Docker. Use restart policies and proper limits instead.
- **mem_limit (v2 syntax):** Deprecated. Use `deploy.resources.limits.memory` (v3+) instead.
- **Embedding secrets in images:** BuildKit secret mounts (2020+) replaced ARG/ENV for build secrets.
- **Portainer for secrets management:** Specialized tools (Infisical, Vault) provide better security and features.

## Open Questions

Things that couldn't be fully resolved:

1. **Optimal resource limits for Edge Functions runtime**
   - What we know: Supabase Edge Functions run in Deno with 512MB memory limit, use V8 isolates instead of containers
   - What's unclear: Whether to run Supabase Functions runtime in Docker for self-hosted, or use lightweight alternative
   - Recommendation: Research Supabase self-hosted Edge Functions deployment in Phase 11 (Self-Hosted Deployment). May need Deno runtime container or switch to lightweight webhooks.

2. **Infisical high availability for production**
   - What we know: Official docker-compose setup is POC-only, not HA. Recommends Docker Swarm for HA.
   - What's unclear: Whether single Infisical instance acceptable for self-hosted, or need replication
   - Recommendation: Start with single instance + frequent database backups. HA is overkill for self-hosted target. Document backup/restore procedure as HARD-01 requirement.

3. **Webhook notification delivery guarantees**
   - What we know: Many tools support Slack/Discord webhooks for deployment notifications
   - What's unclear: Best approach for reliable delivery (retry logic, queueing, failure handling)
   - Recommendation: Implement simple webhook POST with retry (3 attempts, exponential backoff). Queue-based delivery is over-engineering for deployment notifications.

4. **Caddy resource requirements**
   - What we know: Caddy is lightweight reverse proxy with auto-HTTPS, widely used in production
   - What's unclear: Specific CPU/memory limits for typical traffic (100 req/s, 1000 req/s, etc.)
   - Recommendation: Start conservative (0.5 CPU, 512MB memory), monitor with Prometheus, adjust based on actual usage. Caddy is very efficient.

5. **PgBouncer transaction mode compatibility audit scope**
   - What we know: PgBouncer transaction mode incompatible with certain PostgreSQL features (LISTEN/NOTIFY, prepared statements across transactions, etc.)
   - What's unclear: How deep to audit backend code and Edge Functions for compatibility
   - Recommendation: This is Phase 10 (Database Production Readiness) concern, not Phase 9. Defer to DB-02 requirement.

## Sources

### Primary (HIGH confidence)

- [Docker Compose Deploy Specification](https://docs.docker.com/reference/compose-file/deploy/) - Resource limits, restart policies, deployment strategies
- [Docker Compose Services Specification](https://docs.docker.com/reference/compose-file/services/) - Secrets, healthchecks, logging drivers
- [Docker Resource Constraints](https://docs.docker.com/engine/containers/resource_constraints/) - Memory limits, CPU shares, OOM behavior
- [Infisical Self-Hosting Documentation](https://infisical.com/docs/self-hosting/deployment-options/docker-compose) - Docker Compose setup, environment variables
- Context7 `/docker/compose` - Docker Compose usage patterns and examples
- [Docker Use Compose in Production](https://docs.docker.com/compose/how-tos/production/) - Production override files, best practices
- [Docker Merge Compose Files](https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/) - File merging behavior and precedence

### Secondary (MEDIUM confidence)

- [Infisical Self-Hosting Homelab Guide](https://infisical.com/blog/self-hosting-infisical-homelab) - Self-hosted deployment walkthrough (2025)
- [Docker Compose Health Checks Guide - Last9](https://last9.io/blog/docker-compose-health-checks/) - Health check configuration patterns
- [Docker Compose Memory Limits - Peter Kellner](https://peterkellner.net/2023-09-24-managing-redis-memory-limits-with-docker-compose/) - Redis memory configuration
- [Docker Memory Limits Guide - BetterLink](https://eastondev.com/blog/en/posts/dev/20251218-docker-resource-limits-guide/) - Resource limits best practices (2025)
- [PostgreSQL PgBouncer Docker Setup - Medium](https://muhammadtriwibowo.medium.com/install-docker-compose-postgres-and-pgbouncer-8fa2c337a0e3) - Production PgBouncer config
- [docker-rollout GitHub](https://github.com/wowu/docker-rollout) - Zero-downtime deployment tool
- [Distroless vs Alpine - Daniel Demmel](https://www.danieldemmel.me/blog/securing-python-docker-images-with-distroless) - Security comparison (2025)
- [Dockerfile Secrets Layers - Xygeni](https://xygeni.io/blog/dockerfile-secrets-why-layers-keep-your-sensitive-data-forever/) - Secret leakage in layers
- [MinIO Docker Production - Medium](https://medium.com/@murisuu/self-host-s3-minio-docker-compose-setup-48588b2f9bcd) - MinIO Docker Compose setup
- [Caddy Reverse Proxy Docker - Virtualization Howto](https://www.virtualizationhowto.com/2025/09/caddy-reverse-proxy-in-2025-the-simplest-docker-setup-for-your-home-lab/) - Caddy Docker setup (2025)

### Tertiary (LOW confidence)

- WebSearch: Various Stack Overflow discussions on Docker OOM behavior - community experiences, not authoritative
- WebSearch: Webhook notification reliability discussions - implementation-specific, needs testing

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - Infisical, Docker Compose, BuildKit all well-documented with official sources
- Architecture patterns: HIGH - All patterns verified with official Docker documentation and Context7
- Resource limits: MEDIUM - General guidance well-documented, specific values require load testing
- Pitfalls: HIGH - Documented in official Docker resources and security best practices
- Infisical HA: MEDIUM - Official docs state POC-only for docker-compose, but single-instance acceptable for self-hosted

**Research date:** 2026-01-23
**Valid until:** 2026-03-23 (60 days - Docker ecosystem stable, Infisical actively developed)
