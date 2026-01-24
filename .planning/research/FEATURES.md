# Features Research: Production Deployment Capabilities

**Domain:** Self-hostable IoT Temperature Monitoring System
**Researched:** 2026-01-23
**Confidence:** HIGH

## Summary

Production deployment features for self-hostable applications have evolved significantly toward automation and security in 2026. The reduction of SSL certificate lifespans to 200 days (starting March 2026) makes automation non-negotiable. For an IoT monitoring system like FreshTrack Pro that handles critical food safety data, table stakes include automated deployments, backup/recovery, monitoring, and secrets management. Differentiators include advanced deployment strategies (blue-green, canary) and sophisticated multi-region capabilities. Anti-features center on avoiding premature complexity through microservices decomposition or unnecessary staging environments.

## Table Stakes

Must-have deployment capabilities for a production-ready self-hostable IoT application. Missing these features makes the system feel incomplete or risky for production use.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| **Automated SSL/TLS Certificate Management** | Starting March 2026, certificates valid only 200 days (reducing to 47 days by 2029). Manual renewal is no longer viable. | Low | Caddy or Let's Encrypt + certbot | FreshTrack already has Caddy with auto-HTTPS - COMPLETE |
| **Zero-Downtime Deployment** | IoT monitoring systems require 24/7 uptime. Food safety violations occur if monitoring goes offline. | Medium | Health checks, graceful shutdown, rolling restart | Existing health endpoints and docker compose support this |
| **Health Check Endpoints** | Required for orchestration (Docker, K8s), load balancers, and monitoring to detect failures and auto-restart. | Low | None - application code | Already implemented: `/health`, `/health/ready`, `/health/live` |
| **Database Backup & Restore** | Historical sensor data is legally required for HACCP compliance. Data loss is unacceptable. | Medium | PostgreSQL pg_dump/restore, scheduled jobs | Need automated daily backups with retention policy |
| **Secrets Management** | Production credentials (database passwords, API keys) must never be in git or environment variables. | Medium | Docker secrets or external vault | Currently using environment variables - NEEDS IMPROVEMENT |
| **Configuration Per Environment** | Production needs different settings than development (resource limits, logging levels, connection pools). | Low | Multiple compose files | Already using `compose.production.yaml` overlay - COMPLETE |
| **Resource Limits & Constraints** | Prevent runaway containers from consuming all memory/CPU, ensure fair resource allocation. | Low | Docker compose deploy section | Need to add memory/CPU limits to production compose |
| **Structured Logging** | Troubleshooting production issues requires queryable, machine-readable logs with request IDs. | Low | Pino logger | Already implemented with Pino - COMPLETE |
| **Metrics Endpoint for Monitoring** | External monitoring (Prometheus) requires `/metrics` endpoint exposing service health and business metrics. | Medium | prom-client library | Already implemented - COMPLETE |
| **Rollback Procedure** | When deployments fail, must be able to quickly return to previous known-good state. | Medium | Deployment scripts, container tagging | Already implemented `rollback.sh` - COMPLETE |
| **Pre-flight Health Checks** | Deployment scripts must verify system health before attempting deployment to prevent deploying to unhealthy infrastructure. | Low | Shell scripts, curl | Already implemented `health-check.sh` - COMPLETE |
| **Observability Stack** | Production systems require metrics (Prometheus), logs (Loki), and visualization (Grafana) for troubleshooting. | High | Prometheus, Loki, Grafana, exporters | Already implemented - COMPLETE |

### Priority Classification

**P0 (Must fix before v1.1):**
- Secrets management (currently using env vars)
- Automated database backups
- Resource limits in production compose

**P1 (Already complete):**
- SSL automation (Caddy)
- Health checks
- Rollback procedure
- Observability stack

## Differentiators

Nice-to-have features that add competitive value but aren't expected in v1.1 of a self-hosted application. These set products apart but can be deferred.

| Feature | Value Proposition | Complexity | Dependencies | When to Build |
|---------|-------------------|------------|--------------|---------------|
| **Blue-Green Deployment** | Zero-downtime deployments with instant rollback by switching load balancer target. Lower risk than in-place updates. | High | Two complete environments, load balancer, state synchronization | v2.0+ when customer base requires SLA guarantees |
| **Canary Deployments** | Gradual rollout to subset of users reduces blast radius of bugs. Critical for high-stakes IoT monitoring. | High | Traffic splitting, metrics comparison, automated rollback triggers | v2.0+ for enterprise customers with large deployments |
| **Multi-Region Deployment** | Geographic redundancy for disaster recovery and reduced latency. Valuable for national/global customers. | Very High | DNS failover, database replication, CDN | v3.0+ only if customers demand global availability |
| **Infrastructure as Code (Terraform/Pulumi)** | Reproducible infrastructure provisioning. Valuable for customers deploying multiple instances or disaster recovery. | High | Cloud provider APIs, state management | v2.0 if offering managed hosting service |
| **Automated E2E Testing in CI/CD** | Catch regressions before production. Confidence in deployments. | Medium | Playwright/Cypress, CI environment, test data | v1.2 - already planning E2E tests |
| **Status Page (Self-Hosted)** | Transparent communication during incidents. Builds trust with customers. | Low | Uptime Kuma or custom dashboard | Already implemented with Uptime Kuma - COMPLETE |
| **Deployment Notifications (Slack/Email)** | Team awareness of deployments, rollbacks, and failures. | Low | Webhook integration | v1.2 - simple addition to deploy scripts |
| **Container Image Scanning** | Detect CVEs in dependencies before deployment. Security-conscious customers expect this. | Medium | Trivy, Snyk, or Docker Scout | v2.0 for enterprise security compliance |
| **Staged Rollouts with Feature Flags** | Deploy code separately from feature activation. Enables safer releases and A/B testing. | High | LaunchDarkly, Unleash, or custom system | v2.0+ for sophisticated release management |
| **Disaster Recovery Testing (Automated)** | Regularly verify backups work by restoring to test environment. Ensures RTO/RPO targets are met. | High | Automated test environment, orchestration | v2.0 when regulatory compliance demands proof |
| **Certificate Rotation Monitoring** | Track certificate expiry dates, alert before renewal failures. Critical given 200-day SSL lifespan. | Low | Monitoring scripts, alerting | v1.2 - simple addition to monitoring stack |

### Recommended for v1.1

Given existing infrastructure, these are low-hanging fruit:
- **Deployment notifications** (Low complexity, high value for operations)
- **Certificate rotation monitoring** (Critical given 2026 SSL changes)

## Anti-Features

Features to explicitly NOT build for v1.1. Common mistakes in deployment infrastructure that add complexity without proportional value.

| Anti-Feature | Why Avoid | What to Do Instead | Complexity Cost |
|--------------|-----------|-------------------|-----------------|
| **Kubernetes Orchestration** | Massive operational overhead for small teams. Docker Compose is sufficient for single-server or small cluster deployments. "Don't choose microservices because they are simple." | Stick with Docker Compose. Scale vertically first. Only consider K8s when managing 10+ servers or need advanced scheduling. | Very High - cluster management, networking, RBAC, persistent volumes |
| **Microservices Decomposition** | Distributed monolith anti-pattern: complexity of microservices without benefits. Lose independent deployability, gain coordination overhead. Entity-based splitting creates "enormous complexity without adding even your first feature." | Keep monolithic backend. Use modular code structure. Service boundaries within single process are sufficient. | Very High - service mesh, distributed tracing, eventual consistency |
| **Multiple Staging Environments** | Organizations with acceptance test environments that reflect production often don't need staging. Adds cost and maintenance without confidence boost. | Single production-like staging environment is sufficient. Staging should only exist if coordination needs between components demand it. | Medium - infrastructure duplication, data management |
| **Custom Secret Rotation System** | Reinventing HashiCorp Vault or AWS Secrets Manager. High risk of security bugs. | Use Docker secrets for v1.1 (file-based mounts, encrypted at rest). Integrate Vault in v2.0 if enterprise customers demand it. | High - encryption, audit logs, access control |
| **Building Custom SSL Certificate Manager** | Caddy and Let's Encrypt solve this completely. Custom solutions introduce security risks. | Caddy with automatic HTTPS is already implemented. Monitor certificate expiry but don't replace automation. | High - ACME protocol, certificate storage, renewal scheduling |
| **Manual Deployment Steps** | Human error in production is the #1 cause of incidents. Manual steps don't scale. | Fully automated `deploy.sh` script is already implemented. Never add manual steps to deployment process. | N/A - automation reduces complexity |
| **Production Debugging Tools in Containers** | Shells, debuggers, and dev tools in production images expand attack surface and increase image size. | Multi-stage Docker builds already remove dev dependencies. Keep production images minimal. Debug via logs and metrics, not shells. | Low - but security risk is high |
| **Shared Secrets Across Environments** | Production database passwords should never match development. Credential leakage from dev environments compromises production. | Separate secrets per environment. Never reuse credentials. Already using separate compose files - extend to secrets. | Low - just policy enforcement |
| **Hardcoded Configuration in Images** | Prevents promoting same image through environments. Forces rebuild per environment. | Environment variables and config files mounted at runtime. Already using `.env` pattern - continue this. | Low - just discipline |
| **Premature Multi-Cloud Abstraction** | Terraform modules trying to support AWS + GCP + Azure create unreadable conditionals. Decision paralysis. | Pick one cloud provider (DigitalOcean for FreshTrack). Abstract only when second provider is confirmed need. | High - conditionals, least-common-denominator APIs |

### Key Lessons from Anti-Patterns

1. **Start Simple, Scale Up:** Docker Compose → Docker Swarm → Kubernetes (only if needed)
2. **Avoid Distributed Complexity:** Monolith with modules beats distributed monolith
3. **Buy Don't Build:** Use Caddy for SSL, managed DB for backups, Stack Auth for auth
4. **Environment Parity:** Staging should mirror production, not multiply environments
5. **Security by Default:** File-based secrets > environment variables, minimal images > dev tools in prod

## Feature Dependencies

### Existing Foundation (v1.0)

```
Docker Compose
  ├─> Health Checks ✓
  ├─> Resource Limits (TODO)
  └─> Secrets (TODO - using env vars)

Caddy
  └─> Auto-HTTPS ✓

Observability Stack
  ├─> Prometheus ✓
  ├─> Loki ✓
  └─> Grafana ✓

Deployment Scripts
  ├─> deploy.sh ✓
  ├─> rollback.sh ✓
  └─> health-check.sh ✓
```

### v1.1 Gaps to Fill

```
Secrets Management
  └─> Docker Secrets (file-based) → replaces env vars

Database Backup
  ├─> pg_dump scheduled job (cron or systemd timer)
  └─> S3-compatible storage (MinIO already available)

Resource Limits
  └─> Add to compose.production.yaml

Certificate Monitoring
  └─> Prometheus exporter for cert expiry
```

### Future Dependencies (v2.0+)

```
Blue-Green Deployment
  ├─> Load Balancer (Caddy or HAProxy)
  ├─> Two Complete Environments
  └─> Database Replication

Canary Deployment
  ├─> Traffic Splitting (Envoy or Linkerd)
  ├─> Metrics Comparison Logic
  └─> Automated Rollback Triggers
```

## MVP Recommendation

For FreshTrack Pro v1.1 (Production Ready), prioritize closing gaps:

### Must Have (Table Stakes)
1. **Secrets Management** - Migrate from env vars to Docker secrets
2. **Automated Database Backups** - Daily pg_dump to MinIO with 30-day retention
3. **Resource Limits** - Add memory/CPU limits to production compose
4. **Certificate Monitoring** - Prometheus alert for cert expiry < 30 days

### Nice to Have (Low-Complexity Differentiators)
5. **Deployment Notifications** - Slack webhook on deploy/rollback
6. **Deployment Documentation** - Runbook for common scenarios

### Defer to v2.0
- Blue-green deployments (complexity not justified for single-server)
- Canary deployments (requires traffic splitting infrastructure)
- Multi-region (no customer demand yet)
- Kubernetes (Docker Compose is sufficient)
- Microservices (would create distributed monolith)

## Deployment Complexity Spectrum

**Simple (v1.1 Target):**
```
Single Server → Docker Compose → Caddy → Managed PostgreSQL
```
- Suitable for: 10-100 concurrent users, single geographic region
- Operational burden: Low (one server to maintain)
- Cost: $50-200/month
- Recovery: Vertical scaling (bigger droplet)

**Moderate (v2.0):**
```
Load Balancer → 2-3 App Servers → Managed Services
```
- Suitable for: 100-1000 concurrent users, basic HA
- Operational burden: Medium (cluster coordination)
- Cost: $500-1000/month
- Recovery: Horizontal scaling (more servers)

**Complex (v3.0+):**
```
Multi-Region → Kubernetes → Service Mesh → Global DB
```
- Suitable for: 1000+ concurrent users, SLA requirements, global presence
- Operational burden: High (dedicated DevOps team)
- Cost: $5000+/month
- Recovery: Multi-region failover

**FreshTrack Pro is currently targeting Simple tier for v1.1.**

## Roadmap Implications

### Phase 1: Production Readiness (v1.1)
**Focus:** Close table stakes gaps
- Secrets management (Docker secrets)
- Automated backups
- Resource limits
- Certificate monitoring

**Rationale:** These are expected features customers verify before trusting production deployment.

### Phase 2: Operational Excellence (v1.2)
**Focus:** Low-complexity differentiators
- Deployment notifications
- E2E testing in CI/CD
- Container image scanning

**Rationale:** Build operational confidence before adding architectural complexity.

### Phase 3: High Availability (v2.0)
**Focus:** Scaling features
- Blue-green deployments
- Multi-server deployment
- Load balancing

**Rationale:** Only after proven customer demand for higher SLAs.

### Phase 4: Enterprise (v3.0+)
**Focus:** Enterprise features
- Multi-region
- Kubernetes (if managing 10+ servers)
- Advanced observability (distributed tracing)

**Rationale:** Deferred until customer base and revenue justify operational complexity.

## Confidence Assessment

| Feature Category | Confidence | Source |
|------------------|------------|--------|
| SSL/TLS Automation | HIGH | Official Sectigo, FullProxy announcements of 200-day cert lifespan starting March 2026 |
| Secrets Management | HIGH | Docker official docs, GitGuardian best practices guide |
| Backup/Recovery | HIGH | AWS, Microsoft Azure disaster recovery whitepapers |
| Health Checks | HIGH | Docker official documentation, production best practices |
| Anti-Patterns | HIGH | InfoQ, Medium, GeeksforGeeks articles on microservices anti-patterns (2025-2026) |
| Deployment Strategies | MEDIUM | Industry best practices, but specific tooling varies by organization |
| Resource Limits | HIGH | Docker Compose official docs, production deployment guides |

## Sources

### SSL Certificate Management (2026 Changes)
- [200-day TLS Certificates Change 2026](https://www.fullproxy.com/certificate-management/200-day-tls-certificate-change-2026/)
- [New SSL/TLS Certificate Guidelines: Shorter Lifetimes, Smarter Automation](https://vineethtunk.medium.com/new-ssl-tls-certificate-guidelines-shorter-lifetimes-smarter-automation-6ddd19b09724)
- [Zero Downtime Certificate Rotation: Strategies & Best Practices](https://expiring.at/blog/zero-downtime-certificate-rotation-strategies-best-practices/)
- [Prepare now: 200-day SSL/TLS certificates effective march 2026](https://www.sectigo.com/blog/200-day-ssl-tls-certificate-lifespans-are-less-than-a-year-away)

### Production Deployment Best Practices
- [AWS Production Deployment Checklist: The 4 Pillars for Stability and Scale](https://www.qovery.com/blog/aws-production-deployment-checklist)
- [Use Compose in production | Docker Docs](https://docs.docker.com/compose/how-tos/production/)
- [How to Deploy Apps with Docker Compose in 2025](https://dokploy.com/blog/how-to-deploy-apps-with-docker-compose-in-2025)
- [Production Readiness Checklist | Redpanda Self-Managed](https://docs.redpanda.com/current/deploy/deployment-option/self-hosted/manual/production/production-readiness/)

### Secrets Management
- [Manage sensitive data with Docker secrets | Docker Docs](https://docs.docker.com/engine/swarm/secrets/)
- [4 Ways to Securely Store & Manage Secrets in Docker](https://blog.gitguardian.com/how-to-handle-secrets-in-docker/)
- [Managing Secrets in Docker Compose — A Developer's Guide](https://phase.dev/blog/docker-compose-secrets/)

### Backup & Disaster Recovery
- [Disaster recovery options in the cloud - AWS](https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-options-in-the-cloud.html)
- [Architecture strategies for disaster recovery - Microsoft Azure](https://learn.microsoft.com/en-us/azure/well-architected/reliability/disaster-recovery)
- [Disaster Recovery Plan Template, Examples & Why You Need One for 2026](https://secureframe.com/blog/disaster-recovery-plan)

### IoT-Specific Requirements
- [IoT Application Development: Process, Features, Challenges for 2026](https://stormotion.io/blog/how-to-develop-iot-applications/)
- [How to Develop IoT Applications: Complete Development Guide 2026](https://topflightapps.com/ideas/how-to-develop-iot-applications/)

### Anti-Patterns
- [Seven Microservices Anti-patterns - InfoQ](https://www.infoq.com/articles/seven-uservices-antipatterns/)
- [10 Microservice Anti-Patterns Every Engineer Must Avoid](https://medium.com/@leela.kumili/10-microservice-anti-patterns-every-engineer-must-avoid-639f068a8249)
- [Top 7 Microservices Anti-Patterns in 2025 - GeeksforGeeks](https://www.geeksforgeeks.org/blogs/microservice-anti-patterns/)
- [Multi-environment Deployment: Strategies And Best Practices](https://octopus.com/devops/software-deployments/multi-environment-deployments/)

### Environment Management
- [Multi-Environment Setup on App Platform: Development, Staging, Production Best Practices](https://www.digitalocean.com/community/conceptual-articles/best-practices-app-platform-multi-environment)
- [Deployment Environments: All You Need to Know 2026](https://www.apwide.com/deployment-environments/)
