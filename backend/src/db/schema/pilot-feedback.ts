import {
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sites } from './hierarchy.js';
import { organizations } from './tenancy.js';
import { profiles } from './users.js';

// Reusable timestamp columns
const timestamps = {
  createdAt: timestamp('created_at', {
    mode: 'date',
    precision: 3,
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
};

/**
 * Pilot Feedback - Weekly feedback from pilot participants
 */
export const pilotFeedback = pgTable(
  'pilot_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    siteId: uuid('site_id').references(() => sites.id, {
      onDelete: 'set null',
    }),
    weekStart: date('week_start').notNull(),
    loggingSpeedRating: integer('logging_speed_rating'),
    alertFatigueRating: integer('alert_fatigue_rating'),
    reportUsefulnessRating: integer('report_usefulness_rating'),
    notes: text('notes'),
    submittedBy: uuid('submitted_by')
      .references(() => profiles.id)
      .notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('pilot_feedback_weekly_unique').on(
      table.organizationId,
      table.siteId,
      table.weekStart,
    ),
    index('pilot_feedback_org_idx').on(table.organizationId),
  ],
);

export type PilotFeedback = typeof pilotFeedback.$inferSelect;
export type InsertPilotFeedback = typeof pilotFeedback.$inferInsert;
