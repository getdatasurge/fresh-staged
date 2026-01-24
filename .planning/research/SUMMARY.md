# Research Summary: v1.1 Production Ready

**Project:** FreshTrack Pro v1.1 - Production Deployment Readiness
**Domain:** Self-Hosted IoT Temperature Monitoring System
**Researched:** 2026-01-23
**Confidence:** HIGH

## Executive Summary

FreshTrack Pro v1.0 validated the Docker Compose stack for local development and staging. Research for v1.1 Production Ready reveals that deploying this IoT monitoring system to production requires minimal stack additions but critical configuration hardening. The core need is enabling PgBouncer connection pooling (currently disabled), implementing proper secrets management (currently using environment variables), and establishing deployment procedures for three distinct targets: AWS (ECS/Fargate), DigitalOcean (Droplet), and self-hosted VMs.

The recommended approach is Docker Compose with environment-specific override files (compose.{target}.yaml pattern), which avoids maintaining separate codebases while supporting managed vs self-hosted service trade-offs per target. Critical risks center on PgBouncer transaction mode compatibility (breaks applications using prepared statements or SET commands), secrets exposure in Docker images (one 2026 incident exposed credentials for 247 days), and inadequate health checks preventing zero-downtime deployments for 24/7 IoT monitoring.

For v1.1, the stack additions are minimal (enable existing PgBouncer, add Docker Secrets), but operational practices require significant hardening: automated SSL certificate management (200-day certificate lifespan starting March 2026 makes automation non-negotiable), database backup automation, resource limits to prevent runaway containers, and comprehensive health checks for zero-downtime deployments. The research strongly recommends starting with self-hosted DigitalOcean Droplet deployment (lowest complexity, $40-50/month) before graduating to AWS ECS when scaling demands justify the additional complexity and cost ($110-200/month).

## Key Findings

### Recommended Stack

FreshTrack Pro's v1.0 stack (Fastify, PostgreSQL, Redis, MinIO, Caddy, Prometheus/Grafana/Loki) requires no breaking changes for production deployment. The focus is on enabling deferred components and hardening configurations rather than introducing new technologies.

**Stack additions needed:**

- **PgBouncer 1.24.1** (Bitnami image): Connection pooling for production PostgreSQL. Currently disabled in docker-compose.yml due to image issues, but bitnami/pgbouncer:1.24.1-debian-12-r5 is available and production-ready. Use transaction pooling mode (best for web apps), configure max_client_conn=1000 and default_pool_size=25 for production traffic.

- **Docker Secrets** (file-based): Replace environment variable secrets with Docker Compose secrets mounted at /run/secrets. Self-hosted deployments use file-based secrets (chmod 600 secrets/*.txt). AWS deployments integrate with AWS Secrets Manager. DigitalOcean Droplets use encrypted file storage.

- **Caddy with Let's Encrypt** (already implemented): Automatic SSL certificate management is critical given March 2026 changes reducing certificate lifespan to 200 days (down to 47 days by 2029). Caddy's automatic HTTPS with Let's Encrypt renewal is already configured in v1.0 stack - no changes needed for self-hosted/DigitalOcean Droplet deployments. AWS deployments use ACM (AWS Certificate Manager) instead.

- **Deployment scripts**: Target-specific deployment automation (deploy-aws.sh, deploy-do.sh, deploy-vm.sh) with pre-flight health checks, rollback procedures, and monitoring integration.

**Configuration strategy (no new technologies):**

- Base docker-compose.yml + environment overrides (compose.{target}.yaml)
- Production compose files add resource limits, remove dev volume mounts, pin image versions
- Managed service substitution per target (RDS vs self-hosted PostgreSQL, ElastiCache vs self-hosted Redis)

**Critical version note:**

- PostgreSQL: Keep postgres:15-alpine for development (validated in v1.0), consider postgres:15 (Debian) for production if using extensions beyond contrib (Alpine uses musl libc which can cause extension compatibility issues).

### Expected Features (Deployment Capabilities)

This is a deployment milestone, not a feature milestone. Research identified production-readiness capabilities as "features" that make the system deployable and maintainable.

**Must have (table stakes for production deployment):**

- **Automated SSL/TLS certificate management**: Starting March 2026, certificates valid only 200 days. Manual renewal is non-viable. Caddy with auto-HTTPS already implemented in v1.0 - mark as COMPLETE.
- **Zero-downtime deployment**: IoT monitoring requires 24/7 uptime. Food safety violations occur if monitoring goes offline. Existing health endpoints (/health, /health/ready, /health/live) support this.
- **Database backup & restore**: Historical sensor data is legally required for HACCP compliance. Need automated daily backups with retention policy. NEEDS IMPLEMENTATION.
- **Secrets management**: Production credentials must never be in git or environment variables. Currently using env vars - NEEDS MIGRATION to Docker secrets.
- **Resource limits & constraints**: Prevent runaway containers from consuming all memory/CPU. NEEDS ADDITION to production compose files.
- **Observability stack**: Prometheus, Loki, Grafana already implemented in v1.0 - mark as COMPLETE.
- **Rollback procedure**: rollback.sh already implemented in v1.0 - mark as COMPLETE.

**Should have (low-complexity differentiators):**

- **Deployment notifications**: Slack/email webhook on deploy/rollback events. Low complexity, high operational value.
- **Certificate rotation monitoring**: Prometheus alert for cert expiry < 30 days. Critical given 2026 SSL lifespan changes.

**Defer to v2.0+ (explicitly out of scope for v1.1):**

- **Kubernetes orchestration**: Massive operational overhead for small teams. Docker Compose is sufficient for single-server or small cluster deployments.
- **Microservices decomposition**: Would create "distributed monolith" anti-pattern. Keep monolithic backend with modular code structure.
- **Blue-green/canary deployments**: High complexity, requires traffic splitting infrastructure. Only justified when customer base requires SLA guarantees.
- **Multi-region deployment**: Very high complexity. Only if customers demand global availability.

### Architecture Approach

Multi-target Docker Compose deployment uses a single base configuration (docker-compose.yml) with environment-specific override files (compose.{env}.yaml). This approach avoids maintaining multiple codebases while supporting AWS, DigitalOcean, and self-hosted VM deployments with different managed vs self-hosted service trade-offs.

**Pattern:** Base + Override Files

```
docker-compose.yml              # Base (all services)
compose.dev.yaml                # Local development
compose.production.yaml         # Self-hosted production
compose.aws.yaml                # AWS ECS + managed services
compose.digitalocean.yaml       # DigitalOcean hybrid
```

**Invocation:**
- Local: `docker compose -f docker-compose.yml -f compose.dev.yaml up`
- Self-hosted: `docker compose -f docker-compose.yml -f compose.production.yaml up -d`
- AWS: `docker compose -f docker-compose.yml -f compose.aws.yaml up` (via docker context create ecs)

**Service substitution strategy:**

Self-hosted targets run all services in Docker Compose (PostgreSQL, Redis, MinIO containerized). AWS targets disable self-hosted databases via profiles (profiles: ["disabled"]) and use managed services (RDS, ElastiCache, S3). DigitalOcean hybrid approach uses managed PostgreSQL but self-hosted Redis/MinIO for cost optimization.

**Major deployment components:**

1. **Self-Hosted VM (DigitalOcean Droplet, bare metal)**: Full Docker Compose stack on single server, Caddy for reverse proxy + SSL, identical to v1.0 staging environment. Lowest complexity, $40-80/month, best for < 1000 users.

2. **AWS ECS with Fargate**: Backend as ECS tasks, managed RDS PostgreSQL, ElastiCache Redis, S3 storage, ALB for SSL termination with ACM certificates. Higher complexity, $110-200+/month, best for > 5000 users with auto-scaling requirements.

3. **DigitalOcean Droplet with Managed DB**: Hybrid approach using managed PostgreSQL ($15/month) but self-hosting Redis/MinIO on Droplet ($24/month). Total $44/month, balanced cost/ops trade-off for 1000-5000 users.

**Critical architectural decision:**

Start with self-hosted DigitalOcean Droplet or VM deployment (matches validated v1.0 stack, lowest complexity, cost-effective). Graduate to AWS ECS when scaling demands justify the additional complexity. The Docker Compose override pattern ensures smooth migration path without rewriting infrastructure.

### Critical Pitfalls

Production deployment research identified six critical pitfalls that would cause data loss or service outages for 24/7 IoT monitoring:

1. **Health Checks Missing or Inadequate (CRIT-01)**: Without proper health checks, zero-downtime deployment is impossible. depends_on only ensures containers start, not that services are ready. PostgreSQL takes 3-8 seconds to initialize while applications try to connect immediately, causing race conditions. For FreshTrack Pro, this means sensor readings lost during deployment. **Prevention:** Add healthcheck to all services with condition: service_healthy in depends_on. Implement /health endpoint that checks database/Redis/MinIO connectivity. Use docker-rollout for zero-downtime deployments.

2. **PgBouncer Pool Mode Misconfiguration (CRIT-02)**: Transaction pooling (recommended) breaks applications using prepared statements, temporary tables, or SET commands. Session pooling can hang with high connection concurrency. **Prevention:** Use transaction pooling (PGBOUNCER_POOL_MODE: transaction), audit backend code to eliminate prepared statements (use parameterized queries instead), avoid SET SESSION (use SET LOCAL), calculate connection limits carefully (max_client_conn + pool_size * num_dbs < PostgreSQL max_connections).

3. **Secrets Exposed in Docker Images (CRIT-03)**: COPY . . command copies entire directory including .env files. One 2026 incident exposed credentials for 247 days in public Docker image. Even private registries retain secrets in image layers forever. **Prevention:** Complete .dockerignore BEFORE first build (.env, .env.*, secrets/, *.pem, *.key), use Docker Secrets for production (file-based mounts at /run/secrets), use BuildKit secrets for build-time secrets (not persisted in layers), scan images with GitGuardian/TruffleHog in CI/CD.

4. **Using Development Configuration in Production (CRIT-04)**: Single docker-compose.yml for all environments causes long-term issues: volume mounts for code reloading, dev ports exposed, verbose logging, missing restart policies, no resource limits. **Prevention:** Separate compose files (docker-compose.yml base + compose.production.yaml overrides), pin image versions (never :latest), remove volume mounts for code, add restart: unless-stopped, add resource limits (deploy.resources.limits), reduce logging to info/warn level.

5. **Volume Data Loss or Corruption (CRIT-05)**: Named volumes vulnerable to accidental deletion, backup failures, permission issues. PostgreSQL data corruption during unexpected container crashes. For FreshTrack Pro, losing sensor readings violates HACCP compliance. **Prevention:** Always use named volumes (not anonymous), NEVER use docker compose down -v in production, implement automated daily backups (pg_dump to MinIO with 30-day retention), test backup restoration regularly, set proper shutdown (stop_signal: SIGTERM, stop_grace_period: 30s).

6. **SSL/TLS Certificate Failures (CRIT-06)**: Let's Encrypt certificates expire every 90 days - without automated renewal, production goes down. Certificate path misconfigurations in nginx prevent HTTPS. For FreshTrack Pro, failed SSL = users can't access monitoring dashboard. **Prevention:** Use Let's Encrypt + Certbot with automated renewal (runs every 12 hours), configure nginx with correct certificate paths (/etc/letsencrypt/live/{domain}/fullchain.pem), ensure HTTP to HTTPS redirect, monitor certificate expiry with Prometheus alerts.

**Additional medium-priority pitfall:**

7. **Database Migration Downtime Not Tested (MED-02)**: PostgreSQL migrations can take hours for large databases. Traditional dump/restore causes long downtime. For FreshTrack Pro, 4-hour freeze window target may be missed without testing. **Prevention:** Test migration with production-sized dataset in staging, benchmark pg_dump/pg_restore times, consider logical replication for near-zero downtime.

## Implications for Roadmap

Based on research, v1.1 Production Ready should focus on closing table stakes gaps and establishing deployment procedures for three targets. This is NOT a feature milestone - it's a cleanup and deployment readiness milestone.

### Recommended Phase Structure

The research suggests organizing v1.1 around deployment target preparation rather than traditional feature phases:

### Phase 1: Production Environment Hardening
**Rationale:** Must close critical gaps before any production deployment. These are foundational for all three deployment targets (AWS, DigitalOcean, self-hosted).

**Delivers:**
- Secrets management migration (env vars → Docker Secrets)
- Resource limits in compose.production.yaml
- Comprehensive health checks for all services
- .dockerignore with secrets excluded
- Production-grade docker-compose.yml + override files pattern

**Addresses (from FEATURES.md):**
- Secrets management (table stakes P0)
- Resource limits (table stakes P0)
- Health checks (table stakes, already implemented, needs verification)

**Avoids (from PITFALLS.md):**
- CRIT-03: Secrets exposed in Docker images
- CRIT-04: Using development configuration in production
- CRIT-01: Inadequate health checks preventing zero-downtime deployment

**Stack elements:** Docker Secrets (file-based), Compose override files

### Phase 2: Database Production Readiness
**Rationale:** PgBouncer and database backups are critical for production but require careful testing. PgBouncer transaction mode may require backend code changes.

**Delivers:**
- PgBouncer enabled and configured (transaction pooling mode)
- Backend code audited for PgBouncer compatibility
- Automated database backup system (pg_dump daily to MinIO)
- Backup restoration testing
- Database migration procedure tested with production-sized data

**Addresses (from FEATURES.md):**
- Database backup & restore (table stakes P0)
- Zero-downtime deployment support (depends on health checks)

**Avoids (from PITFALLS.md):**
- CRIT-02: PgBouncer pool mode misconfiguration
- CRIT-05: Volume data loss or corruption
- MED-02: Database migration downtime not tested

**Stack elements:** PgBouncer (Bitnami 1.24.1), PostgreSQL connection pooling

### Phase 3: Self-Hosted Deployment (Primary Target)
**Rationale:** Start with simplest deployment target that matches validated v1.0 stack. DigitalOcean Droplet or self-hosted VM has lowest complexity and cost.

**Delivers:**
- compose.production.yaml tested on staging VM
- Deployment script (deploy-selfhosted.sh) with health checks
- SSL/TLS setup with Caddy + Let's Encrypt
- Certificate rotation monitoring (Prometheus alert)
- Deployment runbook and rollback procedures
- Observability stack deployed (Prometheus/Grafana/Loki)

**Addresses (from FEATURES.md):**
- Automated SSL/TLS certificate management (table stakes, verify)
- Certificate rotation monitoring (differentiator)
- Deployment notifications (differentiator, low-complexity)

**Avoids (from PITFALLS.md):**
- CRIT-06: SSL/TLS certificate failures
- MED-01: Inadequate monitoring
- MED-05: No deployment testing in staging

**Architecture:** Self-hosted VM target (DigitalOcean Droplet recommended)

### Phase 4: AWS Deployment (Enterprise Target)
**Rationale:** AWS ECS/Fargate provides auto-scaling and managed services for enterprise customers with higher budgets and scaling requirements.

**Delivers:**
- compose.aws.yaml with managed service integration
- Terraform configuration for ECS cluster + RDS + ElastiCache + S3
- ECS task definitions with proper resource limits
- ACM certificate for SSL termination at ALB
- Deployment script (deploy-aws.sh)
- Cost monitoring and alerts

**Addresses (from FEATURES.md):**
- Multi-target deployment support
- Scalability for > 5000 users (deferred from v1.0)

**Avoids (from PITFALLS.md):**
- CRIT-04: Development config in production (uses compose.aws.yaml)
- CRIT-05: Volume backups (uses RDS automated backups)

**Architecture:** AWS ECS with Fargate target, managed services

### Phase 5: DigitalOcean Deployment (Balanced Target)
**Rationale:** DigitalOcean Droplet with managed PostgreSQL provides balanced cost/ops trade-off between self-hosted and AWS.

**Delivers:**
- compose.digitalocean.yaml (hybrid: managed DB, self-hosted Redis/MinIO)
- DigitalOcean Managed Database integration
- DigitalOcean Spaces (S3-compatible) integration
- Deployment script (deploy-do.sh)
- Cost comparison documentation

**Addresses (from FEATURES.md):**
- Multi-target deployment complete (3 targets supported)

**Architecture:** DigitalOcean Droplet + Managed DB hybrid target

### Phase 6: Production Cutover Preparation
**Rationale:** Final testing and documentation before production deployment announcement.

**Delivers:**
- Staging rehearsal for production deployment
- Deployment runbooks for all three targets
- Disaster recovery procedures documented and tested
- Monitoring dashboards configured for production
- Deployment decision flowchart (which target to choose)
- Team training on deployment procedures

**Addresses (from FEATURES.md):**
- Deployment documentation (table stakes for production)

**Avoids (from PITFALLS.md):**
- MED-05: No deployment testing in staging
- MED-02: Migration downtime exceeds window

### Phase Ordering Rationale

- **Phase 1 first** because secrets management, health checks, and resource limits are required for ALL deployment targets. Fixing these in base configuration prevents repeating work across targets.

- **Phase 2 before deployment phases** because PgBouncer and database backups are target-agnostic and may require backend code changes. Discovering PgBouncer incompatibilities during AWS deployment would be costly.

- **Phase 3 (self-hosted) before Phase 4 (AWS)** because self-hosted deployment matches the validated v1.0 stack (lowest risk). Success here validates the override file pattern before tackling AWS complexity. DigitalOcean Droplet is recommended for actual production deployment due to cost-effectiveness.

- **Phase 4 (AWS) before Phase 5 (DigitalOcean)** because AWS represents the most complex deployment target (Terraform, ECS, managed services). Solving AWS complexity makes DigitalOcean hybrid approach trivial. However, teams may choose to skip AWS entirely if self-hosted meets needs.

- **Phase 6 last** because it requires all deployment targets functional to create comparison documentation and decision flowcharts.

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 4 (AWS Deployment):** Complex Terraform configuration, ECS task definitions, managed service integration. May benefit from targeted AWS ECS research if team unfamiliar with Fargate.

**Phases with well-documented patterns (skip research-phase):**
- **Phase 1 (Environment Hardening):** Docker Compose production best practices are well-documented. Official Docker docs + recent 2026 articles provide clear guidance.
- **Phase 2 (Database Readiness):** PgBouncer configuration is well-documented on pgbouncer.org. PostgreSQL backup/restore patterns are standard.
- **Phase 3 (Self-Hosted):** Matches validated v1.0 stack exactly. No research needed.
- **Phase 5 (DigitalOcean):** Similar to self-hosted with managed DB integration. DigitalOcean docs are clear.

## Out of Scope for v1.1

**Explicitly NOT building (anti-features from research):**

- **Kubernetes orchestration**: Massive operational overhead. Docker Compose is sufficient for single-server or small cluster deployments. Only consider when managing 10+ servers.
- **Microservices decomposition**: Would create "distributed monolith" anti-pattern: complexity of microservices without benefits. Keep monolithic backend with modular code structure.
- **Multiple staging environments**: Single production-like staging environment is sufficient. Multiple environments add cost without confidence boost.
- **Custom secret rotation system**: Reinventing HashiCorp Vault. Use Docker secrets for v1.1, integrate Vault in v2.0 if enterprise customers demand it.
- **Building custom SSL certificate manager**: Caddy + Let's Encrypt solve this completely.
- **Blue-green/canary deployments**: High complexity, requires traffic splitting infrastructure (Envoy/Linkerd). Defer to v2.0.
- **Multi-region deployment**: Very high complexity. Defer to v3.0 when customer base justifies operational burden.

**Why explicitly called out:**

These are common deployment features teams prematurely add, creating complexity without proportional value. Research identified these as anti-patterns for v1.1 scale (< 1000 users, single geographic region, budget-conscious).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Official Bitnami/Docker documentation, PgBouncer production-standard. PostgreSQL Alpine caveat noted (use Debian for production if extensions needed). |
| Features | HIGH | Based on official Docker production docs, recent 2025-2026 SSL certificate changes (200-day lifespan), IoT monitoring best practices. Table stakes vs differentiators clearly identified. |
| Architecture | HIGH | Docker Compose override pattern is official best practice. Multi-target deployment strategies verified with AWS, DigitalOcean official docs. Cost estimates from 2026 pricing. |
| Pitfalls | HIGH | Critical pitfalls sourced from official Docker docs + recent 2026 production incidents (secrets exposure, PgBouncer hangs). Medium pitfalls from IoT edge deployment guides. |

**Overall confidence:** HIGH

All recommendations verified with official documentation (Docker, PgBouncer, AWS, DigitalOcean) or recent community consensus (2025-2026 articles, production war stories). No reliance on unverified sources for critical claims.

### Gaps to Address During Planning

**PostgreSQL Alpine vs Debian:** Research notes Alpine works for simpler workloads but Debian is safer for production if using extensions beyond postgres-contrib. Decision needed during Phase 2 based on actual extension usage. Recommendation: Keep Alpine for development, test in staging, switch to Debian if any extension compatibility issues surface.

**PgBouncer backend code compatibility:** Phase 2 must audit backend code for transaction pooling compatibility (prepared statements, SET commands, temporary tables). Research provides clear prevention strategies, but actual code audit may discover app-specific issues requiring refactoring. Budget extra time for potential backend changes.

**AWS cost optimization:** Research provides baseline cost estimates ($110-200/month) but actual costs depend on traffic patterns, auto-scaling behavior, and RDS instance sizing. Recommendation: Start with smaller instances (t4g family), monitor with AWS Cost Explorer, scale up based on actual usage.

**Backup retention policy:** Research recommends 30-day retention for database backups but actual policy depends on HACCP compliance requirements and customer contracts. Verify retention requirements during Phase 2 planning.

**Certificate monitoring threshold:** Research recommends Prometheus alert for cert expiry < 30 days, but Caddy auto-renews at 60 days. Consider lower threshold (7-14 days) to catch renewal failures earlier. Test in staging during Phase 3.

## Sources

### Stack Research (HIGH confidence)
- Bitnami PgBouncer Docker Hub (verified image availability)
- PgBouncer Official Configuration (pgbouncer.org)
- Docker Secrets Official Documentation
- AWS: Deploy Applications on Amazon ECS using Docker Compose
- Terraform AWS ECS Module (updated Jan 13, 2026)
- DigitalOcean: App Platform vs DOKS vs Droplets
- Caddy vs Traefik comparison (Dec 2025)

### Features Research (HIGH confidence)
- 200-day TLS Certificate Change 2026 (Sectigo, FullProxy announcements)
- Docker Compose Production Guide (Official Docker Docs)
- AWS Production Deployment Checklist
- GitGuardian: 4 Ways to Securely Store Secrets in Docker
- AWS/Azure Disaster Recovery Whitepapers
- InfoQ: Seven Microservices Anti-patterns

### Architecture Research (HIGH confidence)
- Use Compose in production (Official Docker Docs)
- Merge Compose files (Official Docker Docs)
- AWS ECS vs EC2 Complete Comparison Guide (2026)
- Best Practices Around Production Ready Web Apps with Docker Compose
- Docker Compose Advanced Techniques: Production Deployments

### Pitfalls Research (HIGH confidence)
- .env Files Ended Up in Docker Images (Jan 2026 incident)
- Zero Downtime with docker-rollout (GitHub)
- Django + PgBouncer Pitfalls in Production
- PgBouncer Session Pooling Hangs (GitHub issue #384)
- Docker Compose Best Practices (2026)
- 5 Docker Compose Mistakes That Break Production
- 100 GB PostgreSQL Migration Near-Zero Downtime

**All sources accessed:** 2026-01-23
**Research completed:** 2026-01-23
**Ready for roadmap:** Yes
