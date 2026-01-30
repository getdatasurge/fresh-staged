# Phase 10: Database Production Readiness — Context

**Captured:** 2026-01-23
**Phase Goal:** PgBouncer connection pooling enabled with automated backup system

## Gray Areas Discussed

### 1. Connection Pooling

| Question                    | Decision       | Rationale                                                 |
| --------------------------- | -------------- | --------------------------------------------------------- |
| Pool sizing strategy        | Claude decides | Use sensible defaults based on Drizzle + Fastify patterns |
| Connection timeout handling | Claude decides | Standard timeout values with graceful error handling      |
| Pooler metrics granularity  | Claude decides | Balance visibility with overhead                          |
| Configuration file location | Claude decides | Follow existing docker/ directory conventions             |

### 2. Code Compatibility

| Question                      | Decision          | Rationale                                                                 |
| ----------------------------- | ----------------- | ------------------------------------------------------------------------- |
| Code audit approach           | Full audit        | Audit entire backend for prepared statements, SET commands, session state |
| When to fix incompatibilities | Fix in this phase | Don't defer - complete the pooler integration fully                       |

### 3. Backup Strategy

| Question                          | Decision       | Rationale                                        |
| --------------------------------- | -------------- | ------------------------------------------------ |
| Backup retention period           | 30 days        | Balance storage costs with recovery window needs |
| Backup type (full vs incremental) | Claude decides | Choose based on data size and restore simplicity |
| Backup schedule frequency         | Claude decides | Balance RPO with storage/performance impact      |
| MinIO bucket/path structure       | Claude decides | Follow conventions, ensure clear organization    |

### 4. Monitoring Scope

| Question                    | Decision             | Rationale                                             |
| --------------------------- | -------------------- | ----------------------------------------------------- |
| SSL certificates to monitor | Caddy only           | Main public SSL via Let's Encrypt auto-renewal        |
| SSL alert delivery          | Prometheus + Grafana | AlertManager rules via existing notification paths    |
| Backup notifications        | Failures only        | Success is silent, alert on failures                  |
| PgBouncer metrics           | Yes, with exporter   | Run pgbouncer_exporter for connection pool visibility |

## Constraints Identified

1. **PgBouncer transaction mode** — Must audit backend code for:
   - Prepared statements (use Drizzle's default mode)
   - SET commands (avoid session-level settings)
   - Advisory locks (may need workarounds)
   - LISTEN/NOTIFY (not compatible with transaction mode)

2. **Backup storage** — MinIO already in stack, use for backup destination

3. **Existing observability** — Prometheus/Grafana/Loki from Phase 7/9, extend rather than replace

## Requirements Mapping

| Requirement               | Scope                                        |
| ------------------------- | -------------------------------------------- |
| DB-01: PgBouncer enabled  | Connection pooling setup and validation      |
| DB-02: Code compatibility | Backend audit and fixes for transaction mode |
| DB-03: Automated backups  | pg_dump to MinIO with 30-day retention       |
| DB-04: Restoration tested | Document and test restore procedure          |
| DB-05: SSL monitoring     | Prometheus alerts for Caddy cert expiry      |

## Implementation Notes

- PgBouncer connects to PostgreSQL, backend connects to PgBouncer
- pgbouncer_exporter sidecar for Prometheus metrics
- Backup script uses pg_dump, uploads to MinIO, cleans old backups
- Alert rules in Prometheus for cert expiry (30-day warning threshold)
- Backup failure alerts via existing notify.sh webhook integration

---

_Context captured: 2026-01-23 via /gsd:discuss-phase 10_
