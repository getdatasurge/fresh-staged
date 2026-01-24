# Phase 9: Production Environment Hardening - Context

**Gathered:** 2026-01-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Production-ready Docker Compose configuration with secrets management, resource controls, and health checks. This phase hardens the existing Docker Compose stack for safe, reliable production deployment. Does NOT include deployment scripts (Phase 11-12) or application code changes.

</domain>

<decisions>
## Implementation Decisions

### Secrets Management
- Use Infisical as external secrets manager
- Self-hosted Infisical instance (runs in Docker Compose stack)
- All sensitive credentials managed through Infisical:
  - Database passwords (PostgreSQL, PgBouncer)
  - API keys (Stack Auth secrets, webhook signing keys, external service keys)
  - SSL/TLS certificates and private keys

### Resource Limits
- Claude's discretion on specific values per service
- Claude's discretion on OOM behavior per service type
- Claude's discretion on per-target limit differences
- Claude's discretion on minimum server spec assumptions

### Health Checks
- Endpoint-based health checks (dedicated /health endpoints)
- Claude's discretion on depth (shallow vs deep with DB verification)
- Claude's discretion on timeout/retry values per service
- Claude's discretion on startup ordering vs parallel + retries

### Production Overrides
- Layered approach: base production + target-specific overrides
  - `compose.prod.yaml` — shared production settings
  - `compose.selfhosted.yaml` — self-hosted specific overrides
  - `compose.digitalocean.yaml` — DigitalOcean specific overrides
- JSON structured logs for Loki integration
- Claude's discretion on base images (distroless/slim vs consistent)
- Claude's discretion on port exposure strategy

### Claude's Discretion
- Resource limit values and OOM behavior
- Health check depth, timeouts, and startup ordering
- Base image selection for production
- Debug/admin port exposure strategy
- Minimum server spec assumptions

</decisions>

<specifics>
## Specific Ideas

- Infisical chosen over Docker Secrets for centralized management and rotation capabilities
- Self-hosted Infisical aligns with overall self-hosted deployment philosophy
- JSON structured logs explicitly requested for Loki compatibility (already have Prometheus/Grafana/Loki from Phase 7)
- Layered compose approach supports multiple deployment targets without duplication

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-production-environment-hardening*
*Context gathered: 2026-01-23*
