-- Add user-configurable digest preferences
-- digestDailyTime: User's preferred time for daily digest in HH:MM format (24-hour)
-- digestSiteIds: JSON array of site UUIDs to include in digest, NULL means all sites

ALTER TABLE "profiles" ADD COLUMN "digest_daily_time" VARCHAR(5) NOT NULL DEFAULT '09:00';
ALTER TABLE "profiles" ADD COLUMN "digest_site_ids" TEXT;

COMMENT ON COLUMN "profiles"."digest_daily_time" IS 'Preferred time for daily digest in HH:MM format (24-hour)';
COMMENT ON COLUMN "profiles"."digest_site_ids" IS 'JSON array of site UUIDs to include in digest, NULL means all sites';
