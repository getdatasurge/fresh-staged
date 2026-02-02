-- Migration: Add performance indexes for alerts and units tables
-- Issue: #4 [C-PERF-1/2] Missing critical database indexes
-- Date: 2026-02-02

-- C-PERF-1: Alerts indexes for dashboard queries

-- Per-unit alert history sorted by recency (supports "show recent alerts for unit X")
CREATE INDEX CONCURRENTLY IF NOT EXISTS "alerts_unit_triggered_desc_idx"
  ON "alerts" ("unit_id", "triggered_at" DESC);

-- Dashboard filtering by status + severity (supports "show all critical active alerts")
CREATE INDEX CONCURRENTLY IF NOT EXISTS "alerts_status_severity_idx"
  ON "alerts" ("status", "severity");

-- C-PERF-2: Units index for offline detection

-- Offline unit detection: find active units by last reading time
-- Partial index excludes inactive units to keep index small
CREATE INDEX CONCURRENTLY IF NOT EXISTS "units_last_reading_at_idx"
  ON "units" ("last_reading_at" DESC)
  WHERE "is_active" = true;
