---
phase: 09
plan: 03
subsystem: infrastructure
completed: 2026-01-24
duration: 2 minutes
tags: [docker, compose, deployment, secrets, self-hosted, digitalocean]

requires:
  - 09-02 (Production compose overlay with resource limits)

provides:
  - compose.selfhosted.yaml deployment overlay
  - compose.digitalocean.yaml deployment overlay
  - Localhost-only port bindings for self-hosted security
  - Infisical secrets integration pattern
  - Managed PostgreSQL option for DigitalOcean

affects:
  - 09-04+ (Later production hardening plans will reference these overlays)
  - Phase 11 (Deployment plans will use these overlay files)

tech-stack:
  added: []
  patterns:
    - Docker Compose overlay pattern for multi-target deployment
    - Infisical file-based secrets with /run/secrets/ mount
    - Localhost-only bindings for internal services security

key-files:
  created:
    - docker/compose.selfhosted.yaml
    - docker/compose.digitalocean.yaml
  modified: []

decisions:
  - id: DEPLOY-01
    what: Self-hosted uses localhost-only bindings (127.0.0.1:PORT)
    why: Prevent external access to internal services (postgres, redis, minio)
    impact: Only Caddy reverse proxy is externally accessible
    alternatives: Use firewall rules instead
  - id: DEPLOY-02
    what: Infisical secrets via file mounts at /var/infisical/secrets/
    why: Docker secrets pattern with external secret provider
    impact: Standardized across both deployment targets
    alternatives: Environment variables, Docker swarm secrets
  - id: DEPLOY-03
    what: DigitalOcean overlay supports managed PostgreSQL option
    why: Reduce operational burden with managed database service
    impact: Documented switch pattern (comment local postgres, use do_database_url)
    alternatives: Always run local PostgreSQL
---

# Phase 09 Plan 03: Deployment Target Overlays Summary

**One-liner:** Self-hosted and DigitalOcean compose overlays with localhost security bindings and Infisical secrets integration

## What Was Built

Created two deployment target-specific Docker Compose overlay files:

1. **compose.selfhosted.yaml** - For self-hosted VM deployments with all services local
2. **compose.digitalocean.yaml** - For DigitalOcean Droplets with managed service options

Both overlays layer on top of `docker-compose.yml` (base) and `compose.prod.yaml` (production config) to provide deployment-specific settings.

## Tasks Completed

### Task 1: Create Self-Hosted Deployment Overlay ✓
**Commit:** `05a1e15`
**Files:** `docker/compose.selfhosted.yaml`

Created self-hosted deployment overlay with:
- Localhost-only port bindings (127.0.0.1:) for postgres, pgbouncer, redis, minio
- Secrets from Infisical file mounts (`/var/infisical/secrets/`)
- Caddy and backend service definitions (commented until services exist in base)
- All services run locally (no managed services)

Security feature: Only Caddy reverse proxy should be externally accessible; all internal services bound to localhost.

**Verification:**
- 5 localhost bindings detected
- Validates cleanly with base + production overlay
- Secrets section defined with Infisical file sources

### Task 2: Create DigitalOcean Deployment Overlay ✓
**Commit:** `fd8c6f9`
**Files:** `docker/compose.digitalocean.yaml`

Created DigitalOcean deployment overlay with:
- Reduced resource limits for smaller Droplets (postgres: 1GB RAM vs 2GB)
- Redis: 512MB limit (vs 768MB in production base)
- MinIO: 1GB limit (vs 2GB in production base)
- Documentation for managed PostgreSQL switch pattern
- DigitalOcean Spaces option documented for object storage
- Private networking notes for VPC usage
- Same secrets pattern as self-hosted (Infisical file mounts)

**Verification:**
- File exists and validates with full compose stack
- Reduced resource limits defined for DO Droplet constraints
- Secrets section matches self-hosted pattern

## How It Works

### Multi-Layer Compose Pattern

```bash
# Self-hosted deployment:
docker compose -f docker-compose.yml -f compose.prod.yaml -f compose.selfhosted.yaml up -d

# DigitalOcean deployment:
docker compose -f docker-compose.yml -f compose.prod.yaml -f compose.digitalocean.yaml up -d
```

**Layer 1 (base):** `docker-compose.yml` - Development defaults, all services defined
**Layer 2 (production):** `compose.prod.yaml` - Resource limits, Loki logging, restart policies, observability
**Layer 3 (target):** `compose.selfhosted.yaml` OR `compose.digitalocean.yaml` - Deployment-specific overrides

### Localhost-Only Security Pattern

Self-hosted overlay binds internal services to 127.0.0.1 to prevent external access:

```yaml
postgres:
  ports:
    - "127.0.0.1:5432:5432"  # Only accessible from host
```

This means:
- Services can only be accessed from the host machine
- Container-to-container networking still works
- External access goes through Caddy reverse proxy (ports 80/443)
- No firewall rules needed for internal service isolation

### Infisical Secrets Integration

Both overlays use Docker secrets with file sources from Infisical Agent:

```yaml
services:
  postgres:
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password
    secrets:
      - postgres_password

secrets:
  postgres_password:
    file: /var/infisical/secrets/postgres_password
```

The `/var/infisical/secrets/` path is where Infisical Agent exports secrets as files (documented in Phase 11 deployment).

### DigitalOcean Managed PostgreSQL Option

The DigitalOcean overlay documents how to switch to managed PostgreSQL:

1. Comment out `postgres` and `pgbouncer` services in `docker-compose.yml`
2. Uncomment `do_database_url` secret in overlay
3. Update backend to use `do_database_url` secret
4. Set connection string in Infisical with `sslmode=require`

This reduces operational burden while maintaining the same secrets pattern.

## Success Criteria Met

- [x] compose.selfhosted.yaml exists with localhost-only port bindings
- [x] compose.digitalocean.yaml exists with reduced resource limits
- [x] Both files validate with base + production overlay
- [x] Both files define secrets section with Infisical file sources
- [x] Documentation comments explain deployment-specific settings

## Deviations from Plan

None - plan executed exactly as written.

## What's Next

**Immediate (Phase 9):**
- 09-04: Create observability config files (Prometheus, Loki, Promtail, Grafana)
- 09-05: Create Caddy reverse proxy configuration
- 09-06: Create deployment scripts for self-hosted and DigitalOcean

**Later (Phase 11):**
- Deployment documentation referencing these overlays
- Infisical Agent setup guide for `/var/infisical/secrets/` path
- Backend service definition to uncomment backend/caddy sections

## Key Decisions

**DEPLOY-01: Localhost-only bindings for self-hosted**
Self-hosted deployment uses 127.0.0.1:PORT bindings for all internal services. This prevents external access without firewall rules. Only Caddy reverse proxy (ports 80/443) is externally accessible.

**DEPLOY-02: Infisical secrets via file mounts**
Both deployment targets use Docker secrets pattern with Infisical Agent providing files at `/var/infisical/secrets/`. This standardizes secret management across targets and integrates with the Infisical stack from 09-01.

**DEPLOY-03: Managed PostgreSQL option for DigitalOcean**
DigitalOcean overlay supports switching to managed PostgreSQL by commenting out local postgres services and using `do_database_url` secret. This reduces operational burden for managed deployments.

## Files Reference

### compose.selfhosted.yaml
```yaml
# Services with localhost bindings:
- postgres: 127.0.0.1:5432
- pgbouncer: 127.0.0.1:6432
- redis: 127.0.0.1:6379
- minio: 127.0.0.1:9000, 127.0.0.1:9001

# Secrets from Infisical:
- postgres_password
- database_url
- stack_auth_secret
```

### compose.digitalocean.yaml
```yaml
# Reduced resource limits:
- postgres: 1GB RAM (vs 2GB)
- redis: 512MB RAM (vs 768MB)
- minio: 1GB RAM (vs 2GB)

# Optional managed services:
- Managed PostgreSQL (documented switch pattern)
- DigitalOcean Spaces (alternative to MinIO)
```

## Architecture Impact

**Security:** Localhost-only bindings add defense-in-depth for self-hosted deployments
**Flexibility:** Multi-layer compose pattern supports different deployment targets
**Secrets:** Standardized Infisical integration across all targets
**Scalability:** DigitalOcean overlay enables managed service adoption

These overlays complete the Docker Compose production hardening. Combined with 09-01 (Infisical) and 09-02 (production base), the stack is ready for deployment-specific configuration (Caddy, observability) in remaining Phase 9 plans.
