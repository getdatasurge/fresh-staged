-- Migration: Schema audit fixes
-- Date: 2026-02-02
-- Audit findings: missing indexes, type fix, redundant index cleanup

-- =============================================================================
-- 1. FIX: notification_deliveries.retry_count type (varchar → integer)
-- Bug: retry_count was defined as varchar(10) but stores numeric retry counts
-- =============================================================================
ALTER TABLE "notification_deliveries"
  ALTER COLUMN "retry_count" TYPE integer USING COALESCE("retry_count"::integer, 0),
  ALTER COLUMN "retry_count" SET DEFAULT 0;

-- =============================================================================
-- 2. ADD: Missing index on notification_deliveries.external_id
-- Impact: Telnyx webhook handlers query by external_id on every status update
-- Without index: full table scan on each webhook event
-- =============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS "notification_deliveries_external_id_idx"
  ON "notification_deliveries" ("external_id");

-- =============================================================================
-- 3. ADD: Composite index for SMS rate limiting queries
-- Query pattern: WHERE channel = 'sms' AND status IN ('sent','delivered') AND sent_at >= cutoff
-- Used by: alert-evaluator.service.ts, alert-escalation.service.ts
-- =============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS "notification_deliveries_rate_limit_idx"
  ON "notification_deliveries" ("channel", "status", "sent_at");

-- =============================================================================
-- 4. ADD: Partial index for active alerts dashboard queries
-- Query pattern: WHERE status IN ('active','escalated') ORDER BY triggered_at DESC
-- Keeps index small by excluding resolved/acknowledged alerts
-- =============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS "alerts_active_triggered_idx"
  ON "alerts" ("status", "triggered_at" DESC)
  WHERE "status" IN ('active', 'escalated');

-- =============================================================================
-- 5. DROP: Redundant indexes (unique index already covers the lookup)
-- sms_configs_org_idx is redundant with sms_configs_org_unique_idx
-- notification_settings_org_idx is redundant with notification_settings_org_unique_idx
-- =============================================================================
DROP INDEX IF EXISTS "sms_configs_org_idx";
DROP INDEX IF EXISTS "notification_settings_org_idx";
