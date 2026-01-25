# Requirements: FreshTrack Pro

**Defined:** 2026-01-25
**Core Value:** Food safety data must flow reliably from sensors to alerts without interruption

## v2.1 Requirements: Streamlined Deployment

Requirements for one-script deployment automation milestone.

### Pre-Deployment Validation

- [ ] **PREFLIGHT-01**: Script validates minimum RAM available (2GB+ for FreshTrack stack)
- [ ] **PREFLIGHT-02**: Script validates minimum disk space available (10GB+ for Docker images and data)
- [ ] **PREFLIGHT-03**: Script validates CPU cores (2+ cores recommended)
- [ ] **PREFLIGHT-04**: Script validates OS version (Ubuntu 20.04+ or Debian 11+)
- [ ] **PREFLIGHT-05**: Script validates network connectivity to Docker Hub and GitHub
- [ ] **PREFLIGHT-06**: Script validates DNS resolution for user's domain points to server IP

### Prerequisites Installation

- [ ] **PREREQ-01**: Script installs Docker Engine 29.x via get.docker.com if not present
- [ ] **PREREQ-02**: Script installs Docker Compose v2 (bundled with Docker Engine)
- [ ] **PREREQ-03**: Script configures UFW firewall to allow ports 22, 80, 443
- [ ] **PREREQ-04**: Script installs jq for JSON parsing in health checks
- [ ] **PREREQ-05**: Script installs fail2ban for SSH brute-force protection
- [ ] **PREREQ-06**: All prerequisite installations are idempotent (safe to re-run)

### Interactive Configuration

- [ ] **CONFIG-01**: Script prompts for domain name with validation (FQDN format)
- [ ] **CONFIG-02**: Script prompts for admin email with validation (email format)
- [ ] **CONFIG-03**: Script prompts for database passwords with confirmation
- [ ] **CONFIG-04**: Script validates DNS resolution before attempting SSL certificate
- [ ] **CONFIG-05**: Script auto-generates .env.production configuration file
- [ ] **CONFIG-06**: Script auto-generates secure secrets using openssl rand -base64
- [ ] **CONFIG-07**: Script displays configuration summary for user review before deployment

### Deployment Orchestration

- [ ] **DEPLOY-01**: Script integrates with existing deploy.sh from v1.1 (no code duplication)
- [ ] **DEPLOY-02**: Script creates checkpoint markers at each deployment phase
- [ ] **DEPLOY-03**: Script enables resume from failure point using state tracking
- [ ] **DEPLOY-04**: Script calls Docker Compose with production overlay configuration
- [ ] **DEPLOY-05**: Script waits for all services to reach healthy state before proceeding

### Error Handling & Recovery

- [ ] **ERROR-01**: Script uses trap ERR to capture all command failures
- [ ] **ERROR-02**: Script provides diagnostic context (line number, command) on failures
- [ ] **ERROR-03**: Script categorizes errors (transient, recoverable, critical, fatal)
- [ ] **ERROR-04**: Script automatically rolls back on critical failures (preserves data)
- [ ] **ERROR-05**: Script prompts user for recovery on recoverable failures
- [ ] **ERROR-06**: Script displays clear recovery guidance when deployment fails
- [ ] **ERROR-07**: Script never exposes credentials in logs or error messages

### Verification

- [ ] **VERIFY-01**: Script validates all service health endpoints return 200 OK
- [ ] **VERIFY-02**: Script validates SSL certificate is valid and trusted
- [ ] **VERIFY-03**: Script validates dashboard accessible via HTTPS in browser
- [ ] **VERIFY-04**: Script runs integrated E2E test (sensor → storage → alert pipeline)
- [ ] **VERIFY-05**: Script validates monitoring dashboards (Prometheus/Grafana) accessible
- [ ] **VERIFY-06**: Script waits for 3 consecutive health check passes (not just 1)

### Post-Deployment

- [ ] **POST-01**: Script displays complete URL summary (dashboard, monitoring, API)
- [ ] **POST-02**: Script displays credential summary securely (no passwords in plaintext logs)
- [ ] **POST-03**: Script creates sample organization and site with demo data
- [ ] **POST-04**: Script configures Grafana dashboards for sensor metrics
- [ ] **POST-05**: Script displays next steps guide for first admin user setup

### Documentation

- [ ] **DOCS-01**: Prerequisites guide documents VM specs, DNS setup, firewall requirements
- [ ] **DOCS-02**: Step-by-step walkthrough documents deployment process with examples
- [ ] **DOCS-03**: Troubleshooting playbook documents common failures and fixes
- [ ] **DOCS-04**: Post-deployment operations guide documents updates, backups, scaling

## Future Requirements (Deferred to v2.2+)

### Advanced Features

- **DEPLOY-ADV-01**: Web-based installer dashboard (graphical interface)
- **VERIFY-ADV-01**: Estimated time remaining during deployment
- **POST-ADV-01**: First admin user creation with email invitation (requires Stack Auth automation)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Fully automatic (no user input) | Hides critical decisions (domain, passwords), security risk |
| Database schema rollback | Data loss risk too high, forward-only migrations only |
| Auto-generate Stack Auth project | Can't securely store API keys, auth too critical to automate |
| Configuration management (Ansible/Puppet) | Massive overhead for single-server deployment |
| Automatic OS updates | Reboot timing and breaking changes out of user control |
| Multi-VM orchestration | Scope is single-server deployment |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PREFLIGHT-01 | Phase 22 | Complete |
| PREFLIGHT-02 | Phase 22 | Complete |
| PREFLIGHT-03 | Phase 22 | Complete |
| PREFLIGHT-04 | Phase 22 | Complete |
| PREFLIGHT-05 | Phase 22 | Complete |
| PREFLIGHT-06 | Phase 22 | Complete |
| PREREQ-01 | Phase 23 | Complete |
| PREREQ-02 | Phase 23 | Complete |
| PREREQ-03 | Phase 23 | Complete |
| PREREQ-04 | Phase 23 | Complete |
| PREREQ-05 | Phase 23 | Complete |
| PREREQ-06 | Phase 23 | Complete |
| CONFIG-01 | Phase 24 | Pending |
| CONFIG-02 | Phase 24 | Pending |
| CONFIG-03 | Phase 24 | Pending |
| CONFIG-04 | Phase 24 | Pending |
| CONFIG-05 | Phase 24 | Pending |
| CONFIG-06 | Phase 24 | Pending |
| CONFIG-07 | Phase 24 | Pending |
| DEPLOY-01 | Phase 25 | Pending |
| DEPLOY-02 | Phase 25 | Pending |
| DEPLOY-03 | Phase 25 | Pending |
| DEPLOY-04 | Phase 25 | Pending |
| DEPLOY-05 | Phase 25 | Pending |
| ERROR-01 | Phase 22 | Complete |
| ERROR-02 | Phase 22 | Complete |
| ERROR-03 | Phase 22 | Complete |
| ERROR-04 | Phase 22 | Complete |
| ERROR-05 | Phase 22 | Complete |
| ERROR-06 | Phase 22 | Complete |
| ERROR-07 | Phase 22 | Complete |
| VERIFY-01 | Phase 26 | Pending |
| VERIFY-02 | Phase 26 | Pending |
| VERIFY-03 | Phase 26 | Pending |
| VERIFY-04 | Phase 26 | Pending |
| VERIFY-05 | Phase 26 | Pending |
| VERIFY-06 | Phase 26 | Pending |
| POST-01 | Phase 26 | Pending |
| POST-02 | Phase 26 | Pending |
| POST-03 | Phase 26 | Pending |
| POST-04 | Phase 26 | Pending |
| POST-05 | Phase 26 | Pending |
| DOCS-01 | Phase 26 | Pending |
| DOCS-02 | Phase 26 | Pending |
| DOCS-03 | Phase 26 | Pending |
| DOCS-04 | Phase 26 | Pending |

**Coverage:**
- v2.1 requirements: 37 total
- Mapped to phases: 37
- Unmapped: 0

---
*Requirements defined: 2026-01-25*
*Last updated: 2026-01-25 (Phase 22-23 requirements complete)*
