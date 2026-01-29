---
phase: 37-documentation
plan: 04
subsystem: documentation
tags: [operations, manual, runbook, backup, scaling, monitoring, security]

dependency_graph:
  requires:
    - 34-01 (deploy-automated.sh)
    - 35-01 (verify-deployment.sh)
    - 36-03 (post-deploy.sh)
  provides:
    - comprehensive operations manual
    - daily/weekly/monthly maintenance procedures
    - backup and restore documentation
    - scaling guidance
    - monitoring configuration reference
    - security maintenance procedures
  affects:
    - operators maintaining production deployments
    - on-call staff handling incidents

tech_stack:
  added: []
  patterns:
    - runbook-style documentation
    - copy-paste ready commands
    - threshold tables for monitoring

key_files:
  modified:
    - docs/deployment/operations.md

decisions:
  - "Combined all 8 sections in single comprehensive document"
  - "ASCII diagram for horizontal scaling architecture"
  - "Threshold tables for monitoring alerts"
  - "Secret rotation procedure with step-by-step commands"

metrics:
  duration: "~2 minutes"
  completed: "2026-01-29"
  tasks_completed: 2
  tasks_total: 2
  lines_added: 672
  lines_removed: 41
---

# Phase 37 Plan 04: Operations Manual Summary

Comprehensive post-deployment operations guide covering all maintenance procedures.

## One-liner

720-line operations manual with 8 major sections covering updates, backups, scaling, monitoring, and security maintenance.

## What Was Built

### docs/deployment/operations.md

Expanded from 90 lines to 720 lines with comprehensive coverage:

1. **Daily Operations** - Health checks, log review, disk space monitoring
2. **Application Updates** - Standard, version-specific, and rollback procedures
3. **Database Backups** - Automated, manual, external storage, restore procedures
4. **Disaster Recovery** - RTO/RPO documentation, complete server recovery steps
5. **Scaling** - Vertical scaling, horizontal scaling architecture, database scaling
6. **Monitoring** - Grafana dashboards, Prometheus alerts, external alerting, log queries
7. **Security Maintenance** - SSL renewal, system updates, secret rotation, firewall/fail2ban
8. **Service Management** - Start/stop, logs, container access, resource limits

Plus:
- **Troubleshooting** - Common issues and emergency procedures
- **Quick Reference** - Essential commands, important paths, support resources

## Key Procedures Documented

### Update Procedure
```bash
git pull origin main
sudo ./scripts/deploy-automated.sh
./scripts/verify-deployment.sh your-domain.com
```

### Backup Procedure
```bash
docker compose exec -T postgres pg_dump -U frostguard -Fc frostguard > backup.dump
```

### Restore Procedure
```bash
docker compose stop backend worker
docker compose exec -T postgres pg_restore -U frostguard -d frostguard < backup.dump
docker compose start backend worker
```

### Secret Rotation
Step-by-step procedure for quarterly secret rotation with database password update.

## Monitoring Thresholds Documented

| Metric | Warning | Critical |
|--------|---------|----------|
| CPU Usage | > 70% sustained | > 90% |
| Memory Usage | > 80% | > 95% |
| Disk Usage | > 70% | > 85% |
| API Error Rate | > 1% | > 5% |
| Response Time (p95) | > 500ms | > 2000ms |

## Recovery Objectives Documented

- **RTO (Full system):** 30-60 minutes
- **RTO (Database only):** 15-30 minutes
- **RTO (Rollback):** 5-10 minutes
- **RPO (Daily backups):** Up to 24 hours

## Commits

| Hash | Description |
|------|-------------|
| 3e742b5 | docs(37-04): comprehensive operations manual |

## Verification Results

- [x] Application Updates section present
- [x] Database Backups section present
- [x] Disaster Recovery section present
- [x] Scaling section present
- [x] Monitoring section present
- [x] Security Maintenance section present
- [x] Quick Reference section present
- [x] Line count: 720 lines (requirement: >= 200)

## Deviations from Plan

None - plan executed exactly as written.

## Requirements Satisfied

| Requirement | Status |
|-------------|--------|
| DOCS-04: Operations guide | Complete |

## Next Phase Readiness

Phase 37 (Documentation) plan 04 complete.

**Remaining plans in Phase 37:**
- 37-01, 37-02, 37-03 (may be executed in parallel or already complete)

**Documentation now provides:**
- Complete operations manual for production maintenance
- Runnable commands for all common operations
- Troubleshooting guide for common issues
- Emergency procedures for incidents
