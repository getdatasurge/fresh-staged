import { pgTable, uuid, varchar, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

// Stripe Events - idempotency tracking for webhook processing
// Stripe retries failed webhooks for up to 3 days with exponential backoff
export const stripeEvents = pgTable(
  'stripe_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: varchar('event_id', { length: 256 }).notNull(),
    eventType: varchar('event_type', { length: 256 }).notNull(),
    processedAt: timestamp('processed_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex('stripe_events_event_id_idx').on(table.eventId)],
);

export type StripeEvent = typeof stripeEvents.$inferSelect;
export type InsertStripeEvent = typeof stripeEvents.$inferInsert;
