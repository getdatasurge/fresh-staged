---
phase: 37
plan: 03
subsystem: documentation
tags: [troubleshooting, deployment, self-hosted, verification]
requires: [37-01, 37-02]
provides: [comprehensive-troubleshooting-playbook]
affects: [user-deployment-success]
tech-stack:
  added: []
  patterns: [error-reference-tables, diagnostic-playbooks]
key-files:
  created: []
  modified:
    - docs/SELFHOSTED_DEPLOYMENT.md
decisions:
  - type: pattern
    choice: "Organized by deployment phase"
    reason: "Users can quickly find relevant troubleshooting for their failure point"
  - type: content
    choice: "Error reference table with quick fixes"
    reason: "Provides rapid lookup for common errors without reading full sections"
metrics:
  duration: 3m
  completed: 2026-01-29
---

# Phase 37 Plan 03: Enhanced Troubleshooting Documentation Summary

**One-liner:** Comprehensive troubleshooting playbook with pre-flight, checkpoint, and VERIFY-* failure resolution covering all deployment phases.

## What Was Built

### Pre-flight Failures Section (Task 1)
- **Quick Diagnosis** subsection with diagnostic commands for gathering deployment state
- **"Insufficient RAM" Error** - symptoms, causes, and solutions for RAM below 8GB
- **"Insufficient Disk Space" Error** - cleanup commands and retry instructions
- **"Network Unreachable" Error** - DNS, firewall, and proxy troubleshooting

### Checkpoint Recovery Failures Section (Task 1)
- **"Checkpoint exists but state is invalid"** - how to clear checkpoints and reset
- **Script Hangs at "Resuming from checkpoint"** - container cleanup and retry
- **"Checkpoint file not writable"** - permission fixes for multi-user scenarios

### Verification Script Failures Section (Task 2)
- **VERIFY-01: Service Health Endpoint Failures** - backend debugging commands
- **VERIFY-02: SSL Certificate Failures** - Caddy logs, DNS checks, port 80 issues
- **VERIFY-03/VERIFY-06: Dashboard Accessibility Failures** - frontend and proxy troubleshooting
- **VERIFY-04: E2E Pipeline Test Failures** - TTN webhook verification
- **VERIFY-05: Monitoring Stack Failures** - Prometheus/Grafana diagnostics

### Error Quick Reference Table (Task 3)
| Error Count | Categories |
|-------------|------------|
| 12 | Pre-flight, deployment, verification, post-deploy |

Maps error messages to:
- Phase where error occurs
- Likely cause
- Quick fix command or action

### Getting Help Section (Task 3)
- Diagnostic bundle creation script for support requests
- Links to related documentation (SSL, Database, Production Deployment)
- Issue reporting guidance

## Technical Details

**Files modified:**
- `docs/SELFHOSTED_DEPLOYMENT.md` - Added 283 lines of troubleshooting content

**Documentation structure:**
```
## Troubleshooting
  ├── Quick Diagnosis (NEW)
  ├── Pre-flight Failures (NEW)
  │   ├── Insufficient RAM
  │   ├── Insufficient Disk Space
  │   └── Network Unreachable
  ├── Checkpoint Recovery Failures (NEW)
  │   ├── Invalid state
  │   ├── Hung resume
  │   └── Permission issues
  ├── DNS Check Fails (existing)
  ├── Health Check Fails (existing)
  ├── SSL Certificate Not Issued (existing)
  ├── Verification Script Failures (NEW)
  │   ├── VERIFY-01: Service Health
  │   ├── VERIFY-02: SSL Certificate
  │   ├── VERIFY-03/06: Dashboard
  │   ├── VERIFY-04: E2E Pipeline
  │   └── VERIFY-05: Monitoring
  ├── Service Won't Start (existing)
  ├── Webhook Notifications (existing)
  ├── Error Quick Reference (NEW)
  └── Getting Help (NEW)
```

## Verification Results

| Check | Result |
|-------|--------|
| Pre-flight Failures section | Found |
| Checkpoint Recovery section | Found |
| Insufficient RAM subsection | Found |
| VERIFY-01 documentation | Found |
| VERIFY-02 documentation | Found |
| VERIFY-05 documentation | Found |
| Error Quick Reference table | Found |
| Getting Help section | Found |

## Commits

| Hash | Description |
|------|-------------|
| d42b6cf | docs(37-03): add pre-flight and checkpoint failure troubleshooting |
| 9c92e12 | docs(37-03): add verification failure troubleshooting |
| f36319e | docs(37-03): add error reference table and getting help section |

## Deviations from Plan

None - plan executed exactly as written.

## Success Criteria Met

- [x] User can identify failure type from error message
- [x] User can find specific solution for each failure
- [x] User can run diagnostic commands to gather information
- [x] User can recover from any common failure without external help

## Next Phase Readiness

**Phase 37 Plan 04 (DOCS-04):** Update deployment script references in all documentation to point to `deploy-automated.sh` and ensure consistent naming.

**No blockers identified.**
