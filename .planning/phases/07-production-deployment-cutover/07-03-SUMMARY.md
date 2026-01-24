---
phase: 07-production-deployment-cutover
plan: 03
subsystem: infrastructure
tech-stack:
  added:
    - prom/prometheus:v2.45.0
    - grafana/loki:2.9.0
    - grafana/promtail:2.9.0
    - grafana/grafana:10.2.0
    - prom/node-exporter:v1.6.0
  patterns:
    - Metrics scraping with Prometheus
    - Log aggregation with Loki
    - Auto-provisioned Grafana datasources
requires: ["07-01"]
provides: ["observability-stack", "metrics-collection", "log-aggregation", "monitoring-dashboards"]
affects: ["07-04", "07-05", "07-06"]
key-files:
  created:
    - docker/prometheus/prometheus.yml
    - docker/loki/loki.yml
    - docker/promtail/promtail.yml
    - docker/grafana/provisioning/datasources/datasources.yml
    - docker/grafana/provisioning/dashboards/dashboards.yml
    - docker/grafana/dashboards/freshtrack-overview.json
  modified:
    - compose.production.yaml
decisions: []
tags: [observability, monitoring, prometheus, loki, grafana, metrics, logs]
metrics:
  duration: 3m
  completed: 2026-01-23
---

# Phase 07 Plan 03: Observability Stack Summary

**One-liner:** Prometheus/Loki/Grafana stack with 30-day metrics retention, Docker log collection, and auto-provisioned monitoring dashboard

## What Was Built

Implemented a complete observability stack for production monitoring:

1. **Prometheus** - Metrics collection and storage
   - Scrapes backend application metrics endpoint
   - Monitors node-exporter for host system metrics
   - Monitors Caddy reverse proxy metrics
   - 30-day retention period
   - 512M memory limit

2. **Loki** - Log aggregation system
   - Collects logs from all Docker containers via Promtail
   - 30-day (720h) log retention
   - Filesystem-based storage with BoltDB shipper
   - 512M memory limit

3. **Promtail** - Log collection agent
   - Auto-discovers Docker containers via Docker socket
   - Extracts service labels from container metadata
   - Parses JSON logs from backend application
   - Adds log level labels for filtering
   - 128M memory limit

4. **Grafana** - Visualization and dashboards
   - Auto-provisions Prometheus and Loki datasources
   - Includes FreshTrack Pro overview dashboard with:
     - CPU usage gauge (80% threshold)
     - Memory usage gauge (70%/85% thresholds)
     - Service health timeseries (up/down status)
     - Recent logs panel from all services
   - File-based secret for admin password
   - 256M memory limit

5. **Node Exporter** - Host metrics
   - Exposes system metrics (CPU, memory, disk, network)
   - Minimal footprint (64M memory limit)
   - Excludes virtual filesystems to reduce noise

## Architecture Decisions

### Metrics Collection Strategy
- **Decision:** Use Prometheus pull model with static targets
- **Rationale:** Simple configuration, reliable scraping, built-in service discovery not needed for small stack
- **Alternative considered:** Service discovery via Docker labels - added complexity without clear benefit

### Log Retention
- **Decision:** 30-day retention for both metrics and logs
- **Rationale:** Balances operational visibility with storage costs
- **Configuration:** Loki `retention_period: 720h`, Prometheus `--storage.tsdb.retention.time=30d`

### Grafana Provisioning
- **Decision:** Auto-provision datasources and dashboards via config files
- **Rationale:** Infrastructure-as-code approach, consistent deployments, no manual setup
- **Implementation:** YAML provisioning configs and JSON dashboard definitions

### Resource Limits
- **Decision:** Memory limits on all observability services
- **Rationale:** Prevent observability stack from consuming resources needed by application
- **Limits:**
  - Prometheus: 512M (metrics storage can grow)
  - Loki: 512M (log indexing requires memory)
  - Grafana: 256M (dashboard rendering)
  - Promtail: 128M (lightweight log shipper)
  - Node Exporter: 64M (minimal exporter)

## Configuration Highlights

### Prometheus Scrape Targets
```yaml
scrape_configs:
  - job_name: 'prometheus'      # Self-monitoring
  - job_name: 'node-exporter'   # Host metrics
  - job_name: 'backend'         # Application metrics (/metrics endpoint)
  - job_name: 'caddy'           # Reverse proxy metrics
```

### Loki Schema
- Schema version: v11
- Store: boltdb-shipper with filesystem object storage
- Index period: 24h
- Compaction enabled for efficient storage

### Promtail Pipeline
```yaml
pipeline_stages:
  - json:                        # Parse JSON logs
      expressions:
        level: level             # Extract log level
        msg: msg                 # Extract message
        time: time               # Extract timestamp
  - labels:
      level:                     # Add log level as label for filtering
```

### Grafana Dashboard Panels
1. **CPU Usage** - Calculated from node_cpu_seconds_total idle time
2. **Memory Usage** - Based on MemAvailable/MemTotal ratio
3. **Service Health** - Prometheus `up` metric for all scrape targets
4. **Recent Logs** - Loki query: `{compose_service=~".+"}`

## Security Considerations

- All ports bound to localhost only (127.0.0.1) - Caddy reverse proxy handles external access
- Grafana admin password loaded from Docker secret file
- Read-only volume mounts for all config files
- No authentication on Prometheus/Loki (internal services, not exposed externally)

## Integration Points

### Upstream Dependencies
- **07-01 (Production Infrastructure):** Base compose.production.yaml file to extend

### Downstream Impact
- **07-04 (Pre-flight Checks):** Health checks will verify observability services are running
- **07-05 (Cutover Checklist):** Checklist includes verifying Grafana dashboard shows healthy metrics
- **07-06 (Rollback Plan):** Observability stack helps detect issues requiring rollback

### Data Flow
```
Docker Containers → Promtail → Loki → Grafana (Logs)
Backend/Node/Caddy → Prometheus → Grafana (Metrics)
```

## Files Created

### Configuration Files
- `docker/prometheus/prometheus.yml` - Prometheus scrape configuration (614 bytes)
- `docker/loki/loki.yml` - Loki log aggregation config (1,056 bytes)
- `docker/promtail/promtail.yml` - Promtail log collection config (1,064 bytes)
- `docker/grafana/provisioning/datasources/datasources.yml` - Auto-provisioned datasources (342 bytes)
- `docker/grafana/provisioning/dashboards/dashboards.yml` - Dashboard provisioning (240 bytes)
- `docker/grafana/dashboards/freshtrack-overview.json` - Overview dashboard (4,693 bytes)

### Docker Compose
- `compose.production.yaml` - Added 5 observability services, 3 volumes, 1 secret

## Commits

| Commit | Task | Description |
|--------|------|-------------|
| 5c51fb2 | 1 | Create Prometheus, Loki, and Promtail configurations |
| b5f8f2a | 3 | Add observability services to compose.production.yaml |

## Deviations from Plan

### Task 2 Already Completed
**Found during:** Task 2 execution
**Issue:** Grafana provisioning files and dashboard were already created in a previous run (commit e24d915)
**Resolution:** Verified files exist and are correct, skipped redundant commit
**Impact:** No functional impact, files were already in repository

This is a normal occurrence when plan execution is partially completed in a previous session.

## Testing & Verification

### Pre-deployment Verification
- Verified all config files created in correct locations
- Confirmed Prometheus config contains scrape_configs section
- Confirmed Loki config contains schema_config section
- Verified all 5 services added to compose.production.yaml
- Verified volumes and secrets properly configured

### Post-deployment Verification (for cutover checklist)
1. Start stack: `docker compose -f docker-compose.yml -f compose.production.yaml up -d`
2. Check all observability services running: `docker ps | grep frostguard`
3. Access Grafana: http://localhost:3001 (login with grafana_password secret)
4. Verify datasources auto-provisioned (Prometheus and Loki should be green)
5. Open FreshTrack Pro Overview dashboard
6. Confirm CPU/Memory gauges show values
7. Confirm Service Health shows scrape targets
8. Confirm Recent Logs panel shows container logs

### Expected Metrics
- CPU usage gauge updates every 15s
- Memory usage gauge updates every 15s
- Service health shows `up=1` for prometheus, node-exporter, backend, caddy
- Logs appear with compose_service labels

## Next Phase Readiness

### Ready for 07-04 (Pre-flight Checks)
- Observability stack can be health-checked before cutover
- Metrics baseline can be captured before migration

### Ready for 07-05 (Cutover Checklist)
- Dashboard provides visual confirmation of system health
- Logs available for troubleshooting during cutover

### Ready for 07-06 (Rollback Plan)
- Metrics show if rollback is needed (service health drops)
- Logs help diagnose rollback triggers

### Blockers
None - observability stack is self-contained and ready to deploy.

### Outstanding Items
1. **Secrets generation:** `secrets/grafana_password.txt` must be created before deployment
2. **Backend metrics endpoint:** Backend application should implement `/metrics` endpoint (current config assumes it exists)
3. **Caddy metrics:** Caddy admin port 2019 must be exposed (current config assumes it's available)

### Future Enhancements (out of scope for this phase)
- Alert rules in Prometheus for critical conditions
- Additional dashboards for application-specific metrics
- Distributed tracing with Tempo
- Longer retention with remote storage (e.g., S3)
- Redis metrics via redis_exporter
- PostgreSQL metrics via postgres_exporter

## Duration
3 minutes (2026-01-23 23:26:55 - 23:29:56 UTC)
