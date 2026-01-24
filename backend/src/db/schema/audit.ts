import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
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
    // Actor who triggered the event
    actorId: uuid('actor_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    actorType: varchar('actor_type', { length: 32 }).notNull(), // 'user', 'system', 'api'
    // Event classification
    eventType: varchar('event_type', { length: 64 }).notNull(), // 'create', 'update', 'delete', 'login', etc.
    eventCategory: varchar('event_category', { length: 64 }), // 'auth', 'data', 'config', 'alert'
    // Entity affected
    entityType: varchar('entity_type', { length: 64 }).notNull(), // 'unit', 'site', 'alert_rule', etc.
    entityId: uuid('entity_id'),
    // Event details
    description: text('description'),
    payload: text('payload'), // JSON with event-specific data
    // Change tracking (for update events)
    oldValues: text('old_values'), // JSON of previous values
    newValues: text('new_values'), // JSON of new values
    // Request context
    ipAddress: varchar('ip_address', { length: 45 }), // IPv6 compatible
    userAgent: text('user_agent'),
    // Hash chain for tamper evidence
    previousHash: varchar('previous_hash', { length: 64 }),
    hash: varchar('hash', { length: 64 }).notNull(),
    // Timestamp
    occurredAt: timestamp('occurred_at', {
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
    index('event_logs_entity_idx').on(table.entityType, table.entityId),
    index('event_logs_occurred_idx').on(table.occurredAt),
    // Composite for audit queries
    index('event_logs_org_date_idx').on(
      table.organizationId,
      table.occurredAt
    ),
    // For hash chain verification
    index('event_logs_hash_idx').on(table.hash),
  ]
);

// Type exports
export type EventLog = typeof eventLogs.$inferSelect;
export type InsertEventLog = typeof eventLogs.$inferInsert;
