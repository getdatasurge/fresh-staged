---
phase: 23-prerequisites-installation
plan: 02
subsystem: infra
tags: [ufw, firewall, fail2ban, jq, security, server-hardening]

# Dependency graph
requires:
  - phase: 22-foundation-pre-flight
    provides: preflight-lib.sh with error handling and checkpoint system
  - phase: 23-01
    provides: prereq-lib.sh with Docker installation and APT lock handling
provides:
  - configure_firewall() function for UFW setup (ports 22, 80, 443)
  - install_fail2ban() function for SSH brute-force protection
  - install_jq() function for JSON processing utility
  - install_all_prerequisites() master orchestration function
affects: [23-app-deployment, 24-ssl-domain-setup, deployment-scripts]

# Tech tracking
tech-stack:
  added: [ufw, fail2ban, jq]
  patterns: [idempotent-security-hardening, checkpoint-based-installation]

key-files:
  created: []
  modified: [scripts/lib/prereq-lib.sh]

key-decisions:
  - 'UFW allows only ports 22, 80, 443 - deny all other incoming'
  - 'fail2ban uses jail.local (not jail.conf) to survive package updates'
  - 'fail2ban uses %(sshd_log)s and %(sshd_backend)s for OS portability'
  - 'install_all_prerequisites() uses run_step() for checkpoint resume capability'

patterns-established:
  - 'Security functions check existing state before modifying (idempotent)'
  - 'Orchestration functions use run_step() for checkpoint-based resume'

# Metrics
duration: 25min
completed: 2026-01-25
---

# Phase 23 Plan 02: Firewall, fail2ban, and jq Installation Summary

**UFW firewall hardening (ports 22/80/443), fail2ban SSH protection (5 attempts/1h ban), and jq utility installation with master orchestration function**

## Performance

- **Duration:** ~25 min (including parallel plan coordination)
- **Started:** 2026-01-25T16:15:00Z
- **Completed:** 2026-01-25T16:40:00Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- UFW firewall configuration function with idempotent checks
- fail2ban SSH jail with auto-detect log paths for portability
- jq JSON processor installation function
- Master install_all_prerequisites() with checkpoint tracking

## Task Commits

All tasks committed together due to parallel plan coordination:

1. **Task 1: Add UFW firewall configuration function** - `b47f16d` (feat)
2. **Task 2: Add fail2ban SSH protection function** - `b47f16d` (feat)
3. **Task 3: Add jq and prerequisites orchestration** - `b47f16d` (feat)

Note: Tasks combined in single commit due to file contention with parallel plan 23-01.

## Files Created/Modified

- `scripts/lib/prereq-lib.sh` - Added configure_firewall(), install_fail2ban(), install_jq(), install_all_prerequisites()

## Decisions Made

- **UFW default policy:** Deny incoming, allow outgoing - follows principle of least privilege
- **fail2ban configuration file:** Use jail.local instead of jail.conf because jail.conf is overwritten on package updates
- **fail2ban log detection:** Use %(sshd_log)s and %(sshd_backend)s placeholders for cross-distro compatibility
- **Orchestration pattern:** install_all_prerequisites() uses run_step() from preflight-lib.sh for checkpoint-based resume capability

## Deviations from Plan

None - plan executed as specified, though tasks were combined into single commit due to parallel plan file contention.

## Issues Encountered

- **Parallel plan coordination:** Plan 23-01 and 23-02 both modify prereq-lib.sh. File contention required careful coordination and combining tasks into single commit to avoid overwriting each other's work.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- prereq-lib.sh now has complete prerequisites installation capability
- install_all_prerequisites() ready for use in deployment scripts
- Firewall and fail2ban provide security hardening for production VPS
- jq available for JSON parsing in health checks and deployment scripts

---

_Phase: 23-prerequisites-installation_
_Completed: 2026-01-25_
