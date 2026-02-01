-- Migration: Add partition_retention_overrides table (REC-002)
-- Purpose: Allow specific partitions to be excluded from automated retention enforcement
-- Use case: Legal holds, compliance audits, data preservation beyond standard 24-month window

CREATE TABLE IF NOT EXISTS "partition_retention_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "partition_name" varchar(128) NOT NULL UNIQUE,
  "reason" text NOT NULL,
  "created_by" varchar(255) NOT NULL,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
