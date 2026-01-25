# Roadmap: FreshTrack Pro

## Milestones

- ✅ **v1.0 Self-Hosted MVP** - Phases 1-7 (shipped 2026-01-23)
- ✅ **v1.1 Production Ready** - Phases 8-13 (shipped 2026-01-24)
- ✅ **v2.0 Real-Time & Billing** - Phases 14-21 (shipped 2026-01-25)
- 🚧 **v2.1 Streamlined Deployment** - Phases 22-26 (in progress)

## Phases

<details>
<summary>✅ v1.0 Self-Hosted MVP (Phases 1-7) - SHIPPED 2026-01-23</summary>

See MILESTONES.md for details. 47 plans completed.

</details>

<details>
<summary>✅ v1.1 Production Ready (Phases 8-13) - SHIPPED 2026-01-24</summary>

See MILESTONES.md for details. 31 plans completed.

</details>

<details>
<summary>✅ v2.0 Real-Time & Billing (Phases 14-21) - SHIPPED 2026-01-25</summary>

See MILESTONES.md for details. 40 plans completed.

</details>

### 🚧 v2.1 Streamlined Deployment (In Progress)

**Milestone Goal:** Transform deployment from multi-step documentation-following to one-script automated experience

- [x] **Phase 22: Foundation & Pre-Flight** - Script infrastructure and system validation before any modifications
- [x] **Phase 23: Prerequisites Installation** - Docker, firewall, and utilities installed idempotently
- [ ] **Phase 24: Interactive Configuration** - User configures deployment through guided prompts
- [ ] **Phase 25: Deployment Orchestration** - Script deploys FreshTrack via existing infrastructure
- [ ] **Phase 26: Verification & Completion** - System verified working with complete documentation

## Phase Details

### Phase 22: Foundation & Pre-Flight
**Goal**: Script can validate system readiness and handle failures gracefully before making any modifications
**Depends on**: Nothing (first phase of v2.1)
**Requirements**: PREFLIGHT-01, PREFLIGHT-02, PREFLIGHT-03, PREFLIGHT-04, PREFLIGHT-05, PREFLIGHT-06, ERROR-01, ERROR-02, ERROR-03, ERROR-04, ERROR-05, ERROR-06, ERROR-07
**Success Criteria** (what must be TRUE):
  1. Running script on under-resourced VM shows clear error explaining minimum RAM/disk/CPU requirements
  2. Running script on unsupported OS (CentOS, Windows) shows clear error with supported OS list
  3. Running script without network connectivity shows error explaining what URLs must be reachable
  4. Any script failure shows diagnostic context (command, line number, error category) without exposing credentials
  5. Script can resume from failure point without re-running successful steps
**Plans**: 4 plans

Plans:
- [x] 22-01-PLAN.md — Error handling infrastructure (trap ERR, credential sanitization, error categorization)
- [x] 22-02-PLAN.md — System validation functions (RAM, disk, CPU, OS, network)
- [x] 22-03-PLAN.md — Checkpoint-based resume system (state tracking, rollback, recovery prompts)
- [x] 22-04-PLAN.md — DNS validation (domain resolution, A record guidance)

### Phase 23: Prerequisites Installation
**Goal**: Script installs all required dependencies idempotently with proper error handling
**Depends on**: Phase 22 (uses error handling infrastructure)
**Requirements**: PREREQ-01, PREREQ-02, PREREQ-03, PREREQ-04, PREREQ-05, PREREQ-06
**Success Criteria** (what must be TRUE):
  1. Running script on fresh Ubuntu 22.04+ VM installs Docker Engine 29.x and Docker Compose v2
  2. Running script twice produces same result (second run detects existing installations)
  3. UFW firewall allows only ports 22, 80, 443 after script completes
  4. fail2ban protects SSH from brute-force attacks
**Plans**: 2 plans

Plans:
- [x] 23-01-PLAN.md — Docker Engine installation via apt repository (idempotent, not get.docker.com)
- [x] 23-02-PLAN.md — Security & utilities (UFW firewall, fail2ban, jq, orchestration)

### Phase 24: Interactive Configuration
**Goal**: User can configure deployment through guided prompts without editing files manually
**Depends on**: Phase 23 (Docker available for validation)
**Requirements**: CONFIG-01, CONFIG-02, CONFIG-03, CONFIG-04, CONFIG-05, CONFIG-06, CONFIG-07
**Success Criteria** (what must be TRUE):
  1. Script prompts for domain and validates FQDN format (rejects invalid inputs)
  2. Script prompts for admin email and validates format
  3. Script auto-generates secure passwords and secrets (user never types passwords)
  4. Script validates DNS resolves to server IP before proceeding
  5. Script displays configuration summary for user review before any deployment actions
**Plans**: TBD

Plans:
- [ ] 24-01: TBD

### Phase 25: Deployment Orchestration
**Goal**: Script deploys FreshTrack by orchestrating existing v1.1 deployment infrastructure
**Depends on**: Phase 24 (configuration complete)
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04, DEPLOY-05
**Success Criteria** (what must be TRUE):
  1. Script calls existing deploy.sh without duplicating deployment logic
  2. Script creates checkpoint markers tracking deployment progress
  3. Script can resume from last successful checkpoint after failure
  4. All Docker services reach healthy state before script reports success
**Plans**: TBD

Plans:
- [ ] 25-01: TBD

### Phase 26: Verification & Completion
**Goal**: System is verified working end-to-end and user has everything needed for operations
**Depends on**: Phase 25 (deployment complete)
**Requirements**: VERIFY-01, VERIFY-02, VERIFY-03, VERIFY-04, VERIFY-05, VERIFY-06, POST-01, POST-02, POST-03, POST-04, POST-05, DOCS-01, DOCS-02, DOCS-03, DOCS-04
**Success Criteria** (what must be TRUE):
  1. Script validates all health endpoints return 200 OK (3 consecutive passes)
  2. Script validates SSL certificate is valid and trusted
  3. Script runs E2E test (sensor data flows through pipeline to trigger alert)
  4. Script displays complete URL summary (dashboard, API, Grafana, Prometheus)
  5. Sample organization and demo data exist for user to explore
  6. Documentation covers prerequisites, step-by-step walkthrough, troubleshooting, and operations
**Plans**: TBD

Plans:
- [ ] 26-01: TBD
- [ ] 26-02: TBD

## Progress

**Execution Order:** Phases execute in numeric order: 22 -> 23 -> 24 -> 25 -> 26

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-7 | v1.0 | 47/47 | Complete | 2026-01-23 |
| 8-13 | v1.1 | 31/31 | Complete | 2026-01-24 |
| 14-21 | v2.0 | 40/40 | Complete | 2026-01-25 |
| 22. Foundation & Pre-Flight | v2.1 | 4/4 | Complete | 2026-01-25 |
| 23. Prerequisites Installation | v2.1 | 2/2 | Complete | 2026-01-25 |
| 24. Interactive Configuration | v2.1 | 0/? | Not started | - |
| 25. Deployment Orchestration | v2.1 | 0/? | Not started | - |
| 26. Verification & Completion | v2.1 | 0/? | Not started | - |

---
*Roadmap created: 2026-01-25*
*Last updated: 2026-01-25 (Phase 23 complete)*
