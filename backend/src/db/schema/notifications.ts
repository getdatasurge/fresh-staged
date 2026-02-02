import { integer, pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { alerts } from './alerts.js';
import { notificationChannelEnum, notificationStatusEnum } from './enums.js';
import { profiles } from './users.js';

// Notification Deliveries - tracks delivery status per channel
export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    alertId: uuid('alert_id')
      .references(() => alerts.id, { onDelete: 'cascade' })
      .notNull(),
    profileId: uuid('profile_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    // Delivery channel
    channel: notificationChannelEnum('channel').notNull(),
    // Recipient address (phone, email, or device token)
    recipient: varchar('recipient', { length: 256 }).notNull(),
    // Delivery status
    status: notificationStatusEnum('status').notNull().default('pending'),
    // External provider reference (Telnyx message ID, etc.)
    externalId: varchar('external_id', { length: 256 }),
    // Error message if failed
    errorMessage: text('error_message'),
    // Timestamps
    scheduledAt: timestamp('scheduled_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    sentAt: timestamp('sent_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    }),
    deliveredAt: timestamp('delivered_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    }),
    failedAt: timestamp('failed_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    }),
    // Retry tracking
    retryCount: integer('retry_count').default(0),
    lastRetryAt: timestamp('last_retry_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('notification_deliveries_alert_idx').on(table.alertId),
    index('notification_deliveries_profile_idx').on(table.profileId),
    index('notification_deliveries_status_idx').on(table.status),
    index('notification_deliveries_channel_idx').on(table.channel),
    index('notification_deliveries_scheduled_idx').on(table.scheduledAt),
    // For finding pending deliveries to retry
    index('notification_deliveries_pending_idx').on(table.status, table.scheduledAt),
    // Webhook status lookups by provider reference (Telnyx message ID, etc.)
    index('notification_deliveries_external_id_idx').on(table.externalId),
    // SMS rate limiting: WHERE channel='sms' AND status IN (...) AND sent_at >= cutoff
    index('notification_deliveries_rate_limit_idx').on(table.channel, table.status, table.sentAt),
  ],
);

// Type exports
export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;
export type InsertNotificationDelivery = typeof notificationDeliveries.$inferInsert;
