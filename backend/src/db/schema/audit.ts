import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { organizations } from './tenancy.js';
import { profiles } from './users.js';

// Event Logs - tamper-evident audit trail
export const eventLogs = pgTable(
  'event_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),

    // Actor info
    actorId: uuid('actor_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    actorType: varchar('actor_type', { length: 32 }).notNull(), // 'user', 'system', 'api'

    // Event classification
    eventType: varchar('event_type', { length: 64 }).notNull(),
    category: varchar('category', { length: 64 }), // Note: column is 'category' not 'event_category' in DB
    severity: varchar('severity', { length: 32 }), // 'info', 'warning', 'critical', 'success'
    title: text('title'),

    // Target entities (denormalized for easier querying)
    siteId: uuid('site_id'), // .references(() => sites.id) - avoiding circular import if possible, or add import
    areaId: uuid('area_id'),
    unitId: uuid('unit_id'), // .references(() => units.id)

    // Event details
    eventData: jsonb('event_data'),

    // Request context (legacy/standard)
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),

    // Impersonation audit trail
    actingUserId: uuid('acting_user_id'), // The admin doing the impersonation
    impersonationSessionId: uuid('impersonation_session_id'),
    wasImpersonated: boolean('was_impersonated').default(false),

    // Tamper evidence
    eventHash: varchar('event_hash', { length: 64 }),
    previousHash: varchar('previous_hash', { length: 64 }),

    // Timestamp
    recordedAt: timestamp('recorded_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('event_logs_org_idx').on(table.organizationId),
    index('event_logs_actor_idx').on(table.actorId),
    index('event_logs_type_idx').on(table.eventType),
    index('event_logs_recorded_idx').on(table.recordedAt),
    // Composite for audit queries
    index('event_logs_org_date_idx').on(table.organizationId, table.recordedAt),
  ],
);

// Type exports
export type EventLog = typeof eventLogs.$inferSelect;
export type InsertEventLog = typeof eventLogs.$inferInsert;
