-- Stripe Events - idempotency tracking for webhook processing
-- Stripe retries failed webhooks for up to 3 days with exponential backoff
-- This table ensures we only process each event once

CREATE TABLE "stripe_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" varchar(256) NOT NULL,
  "event_type" varchar(256) NOT NULL,
  "processed_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);

-- Unique index on event_id for fast idempotency lookups
CREATE UNIQUE INDEX "stripe_events_event_id_idx" ON "stripe_events" ("event_id");

COMMENT ON TABLE "stripe_events" IS 'Tracks processed Stripe webhook events for idempotency';
COMMENT ON COLUMN "stripe_events"."event_id" IS 'Stripe event ID (evt_*) - unique constraint prevents duplicate processing';
COMMENT ON COLUMN "stripe_events"."event_type" IS 'Stripe event type (e.g., invoice.paid, customer.subscription.updated)';
COMMENT ON COLUMN "stripe_events"."processed_at" IS 'When we successfully processed this event';
