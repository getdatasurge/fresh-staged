---
phase: 10-database-production-readiness
plan: 02
subsystem: infra
tags: [prometheus, blackbox-exporter, ssl, monitoring, alerts, docker]

# Dependency graph
requires:
  - phase: 09-production-environment-hardening
    provides: Production Docker Compose overlay with Prometheus/Grafana observability stack
provides:
  - Blackbox Exporter for HTTPS endpoint probing and SSL certificate metrics
  - Prometheus alert rules firing 30 days and 7 days before certificate expiry
  - SSL probe failure alerts for endpoint monitoring
affects: [07-production-deployment-cutover, deployment phases]

# Tech tracking
tech-stack:
  added: [prom/blackbox-exporter]
  patterns: [Prometheus relabeling for blackbox probes, tiered SSL alerts (30d warning, 7d critical)]

key-files:
  created:
    - docker/blackbox/blackbox.yml
    - docker/prometheus/alerts/ssl-certs.yml
  modified:
    - docker/compose.prod.yaml
    - docker/prometheus/prometheus.yml

key-decisions:
  - "Blackbox Exporter configured with http_2xx, http_2xx_no_ssl, and tcp_connect probe modules"
  - "SSL alerts fire at 30 days (warning) and 7 days (critical) before expiry"
  - "Prometheus relabeling pattern for blackbox probes with instance target labels"

patterns-established:
  - "Alert rules organized in /etc/prometheus/alerts/*.yml with rule_files glob pattern"
  - "Blackbox probe pattern: metrics_path /probe with module params and relabel_configs"

# Metrics
duration: 3min
completed: 2026-01-24
---

# Phase 10 Plan 02: SSL Certificate Expiry Monitoring Summary

**Blackbox Exporter probes HTTPS endpoints for SSL certificate metrics with Prometheus alerts firing 30 days before expiry**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-24T04:18:53Z
- **Completed:** 2026-01-24T04:21:53Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Blackbox Exporter service configured with HTTP/HTTPS and TCP probing modules
- SSL certificate monitoring with automated alerts 30 and 7 days before expiry
- Prometheus scrape job with relabeling for blackbox probe targets
- Alert rules for SSL certificate expiry and probe failures

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Blackbox Exporter configuration and service** - `12b09d7` (feat)
2. **Task 2: Configure Prometheus SSL monitoring and alerts** - `0a114ab` (feat)

## Files Created/Modified
- `docker/blackbox/blackbox.yml` - Blackbox Exporter module configuration with http_2xx, http_2xx_no_ssl, and tcp_connect probers
- `docker/prometheus/alerts/ssl-certs.yml` - SSL certificate alert rules with 30-day warning, 7-day critical, and probe failure alerts
- `docker/prometheus/prometheus.yml` - Added rule_files section, ssl-certs scrape job with blackbox relabeling, and blackbox self-metrics job
- `docker/compose.prod.yaml` - Added Blackbox Exporter service with resource limits and health checks, mounted alerts directory in Prometheus

## Decisions Made

**1. Multi-module Blackbox configuration**
- Created http_2xx (requires SSL), http_2xx_no_ssl (optional SSL), and tcp_connect modules
- Provides flexibility for different endpoint types (HTTPS required vs optional, TCP connectivity)
- Timeout set to 10s for all probes

**2. Tiered SSL certificate alerting**
- 30-day warning alert fires after 1 hour (for: 1h) - gives advance notice for renewal
- 7-day critical alert fires after 30 minutes (for: 30m) - urgent action required
- Different severity levels enable appropriate response workflows

**3. Prometheus relabeling pattern for probes**
- Static targets list HTTPS endpoints to monitor
- Relabel configs transform target to blackbox query parameters
- Instance label preserves original target for alert descriptions
- Address rewritten to blackbox:9115 for actual scraping

**4. Placeholder target configuration**
- Used `https://localhost` as placeholder in ssl-certs job
- Real deployment will replace with actual production domain
- Allows compose validation without production DNS

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks completed as specified.

## User Setup Required

**Deployment configuration required.** Before production deployment:

1. **Update SSL monitoring targets** in `docker/prometheus/prometheus.yml`:
   - Replace `https://localhost` placeholder in ssl-certs job with actual production domain(s)
   - Add additional endpoints to targets array as needed

2. **Configure Alertmanager** (if not already configured):
   - SSL alerts will fire but need routing to notification channels
   - See Prometheus Alertmanager documentation for webhook/email/Slack integration

3. **Verify Blackbox Exporter accessibility**:
   - Ensure Blackbox can reach target HTTPS endpoints
   - Check firewall rules if monitoring external domains
   - Verify DNS resolution for target domains

## Next Phase Readiness

**Ready for production deployment:**
- SSL certificate monitoring infrastructure complete
- Alert rules configured with production-ready thresholds
- Blackbox Exporter integrated into observability stack
- Docker Compose configuration validates successfully

**Waiting for:**
- Production domain configuration for actual SSL monitoring targets
- Alertmanager webhook/notification setup for alert routing

**Concerns:**
- Placeholder target `https://localhost` will fail probes until replaced with real domain
- SSL alerts only useful once real certificates are monitored

---
*Phase: 10-database-production-readiness*
*Completed: 2026-01-24*
