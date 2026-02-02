import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Partition retention overrides
 *
 * Allows specific partitions to be excluded from automated retention
 * enforcement. Used when data must be preserved beyond the standard
 * 24-month retention window (e.g., legal holds, compliance audits).
 *
 * The partition:retention BullMQ job checks this table before dropping
 * any partition. Active overrides (not expired) prevent deletion.
 */
export const partitionRetentionOverrides = pgTable('partition_retention_overrides', {
  id: uuid('id').primaryKey().defaultRandom(),
  partitionName: varchar('partition_name', { length: 128 }).notNull().unique(),
  reason: text('reason').notNull(),
  createdBy: varchar('created_by', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at', {
    mode: 'date',
    withTimezone: true,
  }),
  createdAt: timestamp('created_at', {
    mode: 'date',
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

export type PartitionRetentionOverride = typeof partitionRetentionOverrides.$inferSelect;
export type InsertPartitionRetentionOverride = typeof partitionRetentionOverrides.$inferInsert;
