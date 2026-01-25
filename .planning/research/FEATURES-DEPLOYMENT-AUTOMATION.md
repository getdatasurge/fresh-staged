# Feature Research: One-Script Deployment Automation

**Domain:** Production deployment automation (self-hosted Docker Compose)
**Researched:** 2026-01-25
**Confidence:** HIGH (verified against existing v1.1 scripts and industry best practices)

## Context

FreshTrack Pro v1.1 already includes substantial deployment infrastructure:
- `deploy-selfhosted.sh` - Base VM setup and service deployment
- `deploy.sh` - Production deployment with pre-flight checks
- `health-check.sh` - Pre-deployment validation
- `rollback.sh` - Manual rollback with data preservation
- Docker Compose with health checks and automatic rollback
- SSL automation via Let's Encrypt
- Automated backups with 30-day retention

**Goal for v1.2:** Consolidate into a true "one-script" experience that takes a fresh Ubuntu VM to running production system with minimal user interaction.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = deployment feels incomplete or risky.

| Feature | Why Expected | Complexity | v1.1 Status | Notes |
|---------|--------------|------------|-------------|-------|
| **System requirements check** | Users expect validation before wasting time | LOW | Partial (disk, docker only) | Add RAM, CPU, OS version |
| **DNS validation pre-SSL** | Prevents Let's Encrypt rate limit exhaustion | MEDIUM | COMPLETE | Already prevents 5/hour limit |
| **Firewall configuration** | Security baseline is non-negotiable | LOW | COMPLETE | UFW ports 22, 80, 443 |
| **Interactive configuration prompts** | Users can't memorize all required values | LOW | COMPLETE | Prompts for missing required values |
| **Secrets secure storage** | Passwords in files with 600 permissions | LOW | COMPLETE | /opt/freshtrack-pro/secrets/ |
| **Health check validation** | Must know deployment succeeded | MEDIUM | COMPLETE | 30x30s = 15min window |
| **Automatic rollback on failure** | Can't leave system broken | HIGH | COMPLETE | Code-only, keeps 3 versions |
| **SSL certificate automation** | Manual SSL is unacceptable in 2026 | MEDIUM | COMPLETE | Let's Encrypt via Caddy |
| **Database backup automation** | Data loss prevention is mandatory | MEDIUM | COMPLETE | Daily pg_dump to MinIO |
| **Service restart policies** | Services must survive reboots | LOW | COMPLETE | `restart: unless-stopped` |
| **Progress output with colors** | Users need visual feedback | LOW | COMPLETE | Green/red/yellow status |
| **Idempotent operations** | Must be safe to rerun on failure | MEDIUM | COMPLETE | All installs check existing state |

### Differentiators (Competitive Advantage)

Features that set deployment apart. Not required, but make experience exceptional.

| Feature | Value Proposition | Complexity | v1.1 Status | Notes |
|---------|-------------------|------------|-------------|-------|
| **Single command from fresh VM** | "Just run this" simplicity | MEDIUM | PARTIAL | Still requires git clone first |
| **Guided first-run wizard** | Interactive setup for non-experts | MEDIUM | NOT STARTED | Could walk through all config |
| **Pre-flight requirements summary** | Show what's needed before starting | LOW | PARTIAL | Could be more comprehensive |
| **Configuration file generation** | Auto-create deploy.config from prompts | LOW | NOT STARTED | Currently manual copy/edit |
| **Estimated time remaining** | Progress indicators with ETA | LOW | NOT STARTED | Shows step count but not time |
| **Diagnostic mode** | Verbose logging for troubleshooting | LOW | PARTIAL | --skip-checks exists but no --verbose |
| **Offline mode detection** | Graceful handling of network issues | LOW | NOT STARTED | Currently fails silently on network |
| **Resource estimation** | Calculate if VM has enough resources | MEDIUM | NOT STARTED | Could check based on services |
| **Post-deployment E2E validation** | Prove system works, not just healthy | HIGH | EXISTS SEPARATELY | e2e-sensor-pipeline.sh not integrated |
| **First admin user creation** | Complete setup without manual DB work | MEDIUM | NOT STARTED | Requires manual Stack Auth setup |
| **Sample data population** | Demo data for evaluation | LOW | NOT STARTED | Useful for sales demos |
| **Dashboard URL summary** | List all accessible URLs at end | LOW | PARTIAL | Shows some but not all |
| **Credential export** | Save generated passwords securely | LOW | PARTIAL | Shows but doesn't offer export |
| **Deployment notification** | Slack/webhook on success | LOW | COMPLETE | scripts/deploy/notify.sh |
| **DNS propagation helper** | Check and wait for DNS | MEDIUM | COMPLETE | 5 retries, 10s delay |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems. Deliberately NOT building these.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Fully automatic everything** | "I just want it to work" | Hides critical decisions (domain, passwords, auth keys) | Guided interactive with sensible defaults |
| **Database schema rollback** | "Rollback should undo everything" | Data loss risk too high, migration complexity | Forward-only migrations, code-only rollback |
| **Auto-generate Stack Auth project** | Less external setup | Can't securely store API keys, auth is too critical | Document Stack Auth setup clearly |
| **SSH key injection** | Remote management | Security risk, scope creep | User manages SSH access separately |
| **Automatic domain purchase** | "Complete automation" | Billing complexity, registrar API diversity | Clear DNS setup documentation |
| **Multi-server clustering** | "Enterprise scale" | Massive complexity jump for rare use case | Single-server focus, document manual scaling |
| **Automatic OS updates** | "Keep system secure" | Reboot timing, breaking changes | Document update procedure |
| **GUI installer** | "More user-friendly" | Maintenance burden, SSH is required anyway | Well-structured CLI with clear prompts |
| **Container auto-rebuild** | "Always latest code" | Untested deployments, version unpredictability | Explicit deployment with version tagging |
| **Automatic resource scaling** | "Handle load spikes" | Single-server limitation, complexity | Document resource requirements clearly |

---

## Feature Dependencies

```
[Pre-Deployment Checks]
    |
    ├── System Requirements ──requires──> OS Version Detection
    ├── DNS Validation ──requires──> Server IP Detection
    └── Port Availability ──requires──> Process Detection

[Interactive Configuration]
    |
    └── Config File Generation ──requires──> Prompts
                                └──enhances──> Credential Export

[Deployment]
    |
    ├── Docker Installation ──requires──> System Requirements
    ├── Service Startup ──requires──> Secrets Creation
    │                   ──requires──> DNS Validation (for SSL)
    └── Health Validation ──requires──> Service Startup
                         └──enhances──> E2E Validation

[Post-Deployment]
    |
    ├── Admin Setup ──requires──> Health Validation
    ├── Sample Data ──requires──> Admin Setup
    └── Dashboard Summary ──requires──> Health Validation
```

### Dependency Notes

- **DNS Validation requires Server IP Detection:** Must know what IP domain should point to
- **SSL requires DNS:** Let's Encrypt HTTP-01 challenge needs domain to resolve
- **E2E Validation enhances Health Validation:** Health checks prove services run; E2E proves pipeline works
- **Admin Setup requires Stack Auth:** Authentication system must be configured first
- **Sample Data requires Admin:** Need organization context for data

---

## Feature Categories by Phase

### Phase 1: Pre-Deployment Improvements

**Goal:** Make requirements and validation crystal clear before deployment starts.

| Feature | Priority | Complexity | Why |
|---------|----------|------------|-----|
| Comprehensive system requirements check | P1 | LOW | Fail fast with clear message |
| Network connectivity validation | P1 | LOW | Detect offline/firewall issues |
| Pre-flight summary (requirements + warnings) | P1 | LOW | User knows what to expect |
| Port conflict detection with process names | P2 | LOW | Help debug conflicts |
| Estimated deployment time | P3 | LOW | Set expectations |

### Phase 2: Interactive Configuration

**Goal:** Guide users through setup with sensible defaults and validation.

| Feature | Priority | Complexity | Why |
|---------|----------|------------|-----|
| Configuration file auto-generation | P1 | LOW | Remove manual file editing |
| Input validation with helpful errors | P1 | LOW | Catch typos before they break things |
| Sensible defaults for optional values | P1 | LOW | Less decisions for users |
| Password strength validation | P2 | LOW | Prevent weak secrets |
| Configuration review before proceed | P2 | LOW | Catch mistakes early |

### Phase 3: Error Handling & Recovery

**Goal:** Make failures recoverable with clear guidance.

| Feature | Priority | Complexity | Why |
|---------|----------|------------|-----|
| Diagnostic/verbose mode | P1 | LOW | Debug deployment failures |
| Error categorization (network/config/resource) | P1 | MEDIUM | Direct users to right fix |
| Retry with exponential backoff | P2 | LOW | Handle transient failures |
| Checkpoint resume | P3 | HIGH | Continue from failure point |

### Phase 4: Verification & Validation

**Goal:** Prove deployment works, not just that services started.

| Feature | Priority | Complexity | Why |
|---------|----------|------------|-----|
| Integrated E2E validation (optional) | P1 | MEDIUM | Prove pipeline works |
| Monitoring stack verification | P2 | LOW | Grafana/Prometheus accessible |
| SSL certificate validation | P1 | LOW | Confirm HTTPS works |
| All-services health summary | P1 | LOW | Clear status at end |

### Phase 5: Post-Deployment Setup

**Goal:** Complete the setup experience.

| Feature | Priority | Complexity | Why |
|---------|----------|------------|-----|
| Dashboard URL summary | P1 | LOW | Users know where to go |
| Credential summary/export | P1 | LOW | Don't lose generated passwords |
| Quick start guide output | P2 | LOW | Next steps guidance |
| Optional sample data | P3 | LOW | Demo/evaluation support |

---

## MVP Definition

### Launch With (v1.2)

Minimum viable one-script experience.

- [ ] Single script entry point (wrapper that handles git clone if needed)
- [ ] Comprehensive pre-flight checks (RAM, CPU, OS, disk, network)
- [ ] Interactive config file generation (no manual file editing required)
- [ ] Diagnostic/verbose mode for troubleshooting
- [ ] Complete URL/credential summary at end
- [ ] Integrated health validation with clear pass/fail
- [ ] Recovery guidance when failures occur

### Add After Validation (v1.2.x)

Features to add once core is working.

- [ ] Estimated time remaining — when users complain about not knowing progress
- [ ] Integrated E2E validation — when users report "deployed but doesn't work"
- [ ] Checkpoint resume — when users report failures mid-deployment
- [ ] Sample data population — when sales/demo needs arise

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Web-based installer dashboard — major complexity, questionable value
- [ ] Multi-VM deployment — requires orchestration redesign
- [ ] Automated backup restore testing — good but not urgent

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Single script entry point | HIGH | LOW | P1 |
| Comprehensive pre-flight checks | HIGH | LOW | P1 |
| Interactive config generation | HIGH | MEDIUM | P1 |
| Diagnostic/verbose mode | HIGH | LOW | P1 |
| Error categorization | HIGH | MEDIUM | P1 |
| Complete URL/credential summary | HIGH | LOW | P1 |
| Recovery guidance | HIGH | LOW | P1 |
| SSL certificate validation | MEDIUM | LOW | P1 |
| Estimated time remaining | MEDIUM | LOW | P2 |
| Integrated E2E validation | MEDIUM | MEDIUM | P2 |
| Checkpoint resume | MEDIUM | HIGH | P3 |
| Sample data population | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for v1.2 launch (one-script experience)
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## User Experience Considerations

### What Makes Deployment Smooth

1. **Clear feedback at every step** - Users know what's happening
2. **Fail fast with actionable errors** - Don't waste 10 minutes then fail
3. **No surprises** - Tell users what will happen before doing it
4. **Idempotent by default** - Safe to retry after failures
5. **All information at the end** - URLs, passwords, next steps in one place

### What Makes Deployment Frustrating

1. **Silent failures** - "Something went wrong" with no details
2. **Manual steps mid-flow** - "Now go edit this file and run again"
3. **Undocumented requirements** - Failing because of unlisted prerequisite
4. **Lost credentials** - Generated passwords scrolled off screen
5. **No recovery path** - Failure means start over from scratch

### Existing v1.1 Strengths to Preserve

- Colorized output with clear status indicators
- DNS validation prevents Let's Encrypt rate limits
- Automatic rollback on health check failure
- Idempotent installation functions
- Clear troubleshooting section in documentation

### Gaps to Address in v1.2

1. **Bootstrap complexity** - Still requires git clone before running
2. **Manual config file creation** - Copy example, edit manually
3. **Incomplete pre-flight** - Doesn't check RAM, CPU, OS version
4. **No diagnostic mode** - Hard to debug failures
5. **Scattered credentials** - Some shown, some in files, no summary

---

## Competitor/Reference Analysis

| Feature | Coolify | Dokku | CapRover | Our Approach |
|---------|---------|-------|----------|--------------|
| Single command install | Yes | Yes | Yes | Need bootstrap script |
| Interactive setup | Minimal | No | Yes | Build comprehensive wizard |
| Web UI installer | Yes | No | Yes | CLI-only (intentional) |
| Health validation | Basic | Basic | Basic | Comprehensive with E2E option |
| Rollback | Manual | Manual | Manual | Automatic on failure |
| Multi-server | Yes | No | Yes | Single-server focus |

**Key differentiator:** Our automatic rollback on deployment failure is ahead of typical self-hosted solutions.

---

## Documentation Requirements

For one-script deployment to succeed, documentation must include:

### Prerequisites Document (BEFORE deployment)

1. **External service accounts required:**
   - Stack Auth project (with Project ID, Publishable Key, Secret Key)
   - Optional: Telnyx for SMS, Slack/Discord webhook

2. **DNS configuration:**
   - Required A records (domain, www, monitoring, status)
   - TTL recommendations
   - Propagation verification commands

3. **Server requirements:**
   - Minimum specs (4 vCPU, 8GB RAM, 100GB SSD)
   - Recommended specs
   - OS compatibility (Ubuntu 24.04 LTS)

### Troubleshooting Guide (AFTER failure)

1. **Error categories:**
   - Network/DNS issues
   - Configuration errors
   - Resource exhaustion
   - External service failures

2. **Diagnostic commands:**
   - Log viewing
   - Service status checking
   - Network testing

3. **Recovery procedures:**
   - Resume from checkpoint
   - Clean restart
   - Rollback to previous version

### Operations Runbook (AFTER deployment)

1. **Regular maintenance:**
   - Update procedures
   - Backup verification
   - Log rotation

2. **Monitoring:**
   - Dashboard access
   - Alert configuration
   - Health check interpretation

3. **Emergency procedures:**
   - Rollback process
   - Data recovery
   - Incident response

---

## Sources

### Industry Best Practices
- [Application Deployment Automation Best Practices](https://www.rocket.new/blog/application-deployment-automation-best-practices-guide) - Error handling, logging, risk management
- [Deployment Scripts Best Practices - MOSS](https://moss.sh/reviews/deployment-scripts-best-practices/) - Script structure and automation
- [Building a Production-Grade Automated Deployment Script - DEV](https://dev.to/ursulaonyi/building-a-production-grade-automated-deployment-script-3fgj) - `set -euo pipefail`, trap functions
- [Runbook Template Best Practices](https://drdroid.io/engineering-tools/runbook-template-best-practices-examples) - Documentation structure
- [Complete Guide to Runbooks and Operational Procedures](https://upstat.io/blog/runbook-procedures-guide) - Troubleshooting documentation

### Rollback Strategies
- [Modern Rollback Strategies - Octopus](https://octopus.com/blog/modern-rollback-strategies) - Time-based recovery, database considerations
- [Modern Deployment Rollback Techniques 2025 - FeatBit](https://www.featbit.co/articles2025/modern-deploy-rollback-strategies-2025) - Blue-green, feature flags
- [Ensuring Rollback Safety - AWS Builders Library](https://aws.amazon.com/builders-library/ensuring-rollback-safety-during-deployments/) - Backwards compatibility

### Health Checks & Verification
- [Smoke Testing in CI/CD - CircleCI](https://circleci.com/blog/smoke-tests-in-cicd-pipelines/) - Post-deployment validation
- [Post Deployment Verification - Google Cloud](https://cloud.google.com/blog/topics/developers-practitioners/google-cloud-deploy-introduces-post-deployment-verification) - PDV patterns
- [Deployment Health Check - AppMaster](https://appmaster.io/glossary/deployment-health-check) - Health check types

### Secrets Management
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html) - Security best practices
- [Handling Secrets in Ansible Playbooks - Red Hat](https://www.redhat.com/sysadmin/ansible-playbooks-secrets) - Interactive prompts vs vault

### Docker Compose in Production
- [Use Compose in Production - Docker Docs](https://docs.docker.com/compose/production/) - Restart policies, logging, environment config

### Existing Implementation (HIGH confidence - verified)
- `/home/skynet/freshtrack-pro-local/fresh-staged/scripts/deploy-selfhosted.sh` - Current deployment script
- `/home/skynet/freshtrack-pro-local/fresh-staged/scripts/deploy.sh` - Production deployment
- `/home/skynet/freshtrack-pro-local/fresh-staged/scripts/health-check.sh` - Pre-flight validation
- `/home/skynet/freshtrack-pro-local/fresh-staged/scripts/rollback.sh` - Rollback procedure
- `/home/skynet/freshtrack-pro-local/fresh-staged/scripts/test/e2e-sensor-pipeline.sh` - E2E validation
- `/home/skynet/freshtrack-pro-local/fresh-staged/scripts/test/validate-zero-downtime.sh` - Zero-downtime testing
- `/home/skynet/freshtrack-pro-local/fresh-staged/docs/SELFHOSTED_DEPLOYMENT.md` - Current documentation
- `/home/skynet/freshtrack-pro-local/fresh-staged/docs/operations/RUNBOOKS.md` - Operations procedures

---

*Feature research for: One-Script Deployment Automation*
*Researched: 2026-01-25*
