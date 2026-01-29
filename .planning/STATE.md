# Project State: FreshTrack Pro Migration

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-29)

**Core value:** Food safety data must flow reliably from sensors to alerts without interruption.
**Current focus:** v2.3 Deployment Orchestration — Phase 37 in progress

## Current Position

Milestone: v2.3 Deployment Orchestration
Phase: 37 - Documentation
Plan: 03 of 4 complete (01, 03, 04 complete)
Status: In progress
Last activity: 2026-01-29 — Completed 37-03-PLAN.md (enhanced troubleshooting)

Progress: [=========-] 90% (3.75/4 phases complete)

## v2.3 Phase Overview

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 34 | Deployment Orchestration | DEPLOY-01 to DEPLOY-05 | Complete (2/2 plans) |
| 35 | Verification | VERIFY-01 to VERIFY-06 | Complete (2/2 plans) |
| 36 | Post-Deployment Setup | POST-01 to POST-05 | Complete (3/3 plans) |
| 37 | Documentation | DOCS-01 to DOCS-04 | In progress (3/4 plans: 01, 03, 04) |

## Milestones Shipped

| Version | Name | Phases | Plans | Shipped |
|---------|------|--------|-------|---------|
| v1.0 | Self-Hosted MVP | 1-7 | 47 | 2026-01-23 |
| v1.1 | Production Ready | 8-13 | 31 | 2026-01-24 |
| v2.0 | Real-Time & Billing | 14-21 | 40 | 2026-01-25 |
| v2.1 | Streamlined Deployment | 22-26 | 9 | 2026-01-25 |
| v2.2 | Technical Debt & Stabilization | 27-33 | 27 | 2026-01-29 |

**Total:** 5 milestones, 33 phases, 156 plans

## Accumulated Decisions

| Phase | Decision | Rationale |
|-------|----------|-----------|
| 34-01 | Extend preflight-lib.sh checkpoint system | Reuses proven checkpoint_done/checkpoint_set/run_step functions |
| 34-01 | Use 'deploy-' prefix for checkpoint names | Avoid conflicts with other checkpoint usages |
| 34-01 | Store orchestrator script dir separately | Prevents SCRIPT_DIR overwrite conflicts when sourcing libraries |
| 34-02 | 3 consecutive passes required by default | Prevents false positives from transient healthy responses |
| 34-02 | Health counter resets to 0 on any failure | Ensures sustained health, not just accumulated passes |
| 34-02 | 10-second initialization delay | Gives services time to start before checking health |
| 35-01 | Worker health check is warning, not failure | Worker endpoint may be internal-only in some deployments |
| 35-01 | Consecutive health scoped to dashboard | Matches Phase 34 pattern where consecutive passes apply to main health endpoint |
| 35-01 | Environment-overridable VERIFY_* config | Allows deployment-specific tuning of verification parameters |
| 35-02 | Monitoring failures are warnings not blockers | Monitoring endpoints may require auth in some deployments |
| 35-02 | E2E test auto-detection via TTN_WEBHOOK_SECRET | Conditional test based on environment availability |
| 36-02 | Prometheus datasource with fallback queries | Dashboard works even without FreshTrack-specific metrics exposed |
| 36-02 | Dashboard co-located with freshtrack-overview.json | Auto-provisioning via existing dashboards.yml |
| 36-01 | Use /dev/tty for credential display | Prevents secrets from being captured in log redirections |
| 36-01 | Mask secrets showing first/last 4 chars | Allows identification without full exposure |
| 36-03 | post-deploy.sh follows verify-deployment.sh pattern | Consistent domain loading from config.env or CLI arg |
| 36-03 | pg_isready loop with 30s timeout | Robust database readiness waiting before seeding |
| 37-01 | Added notes column to server requirements | Links preflight validation context directly in requirements |
| 37-01 | deploy-guide.md as quick reference | Avoids duplication by linking to SELFHOSTED_DEPLOYMENT.md for details |
| 37-04 | Combined all 8 sections in single document | Comprehensive coverage in one location |
| 37-04 | ASCII diagram for horizontal scaling | Works in terminal and markdown |
| 37-04 | Threshold tables for monitoring alerts | Quick reference for operators |
| 37-03 | Organized by deployment phase | Users quickly find relevant troubleshooting for their failure point |
| 37-03 | Error reference table with quick fixes | Rapid lookup for common errors without reading full sections |

## Tech Debt Carried Forward

- 53 test failures need mock updates (38 frontend, 15 backend pre-existing)
- supabase-placeholder.ts remains (intentional graceful degradation)
- SensorSimulatorPanel edge function call kept (admin testing tool)

## Context for Phase 37 (Current)

**What 37-01 built:**
- Updated docs/SELFHOSTED_DEPLOYMENT.md with comprehensive prerequisites:
  - Server requirements table with preflight validation notes
  - External services checklist with specific credential fields
  - DNS records table with Required/Purpose columns
  - Firewall Requirements subsection
  - Pre-Deployment Checklist
- Updated docs/deployment/deploy-guide.md as quick reference with cross-links
- All script references updated from deploy-selfhosted.sh to deploy-automated.sh

**What 37-03 built:**
- Enhanced docs/SELFHOSTED_DEPLOYMENT.md with comprehensive troubleshooting:
  - Quick Diagnosis section with diagnostic commands
  - Pre-flight Failures section (RAM, disk, network)
  - Checkpoint Recovery Failures section (invalid state, hung resume, permissions)
  - Verification Script Failures (VERIFY-01 through VERIFY-05)
  - Error Quick Reference table (12 common errors mapped)
  - Getting Help section with diagnostic bundle script

**What 37-04 built:**
- docs/deployment/operations.md (720 lines, comprehensive operations manual)
- 8 major sections: daily ops, updates, backups, disaster recovery, scaling, monitoring, security, service management
- Troubleshooting and quick reference sections

**Deployment workflow documentation updated:**
- preflight.sh -> deploy-automated.sh -> verify-deployment.sh -> post-deploy.sh

## Session Continuity

Last session: 2026-01-29 11:52 UTC
Stopped at: Completed 37-03-PLAN.md
Resume file: None
Next action: Execute 37-02-PLAN.md (script reference documentation)
