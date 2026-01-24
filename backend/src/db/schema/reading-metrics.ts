import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  numeric,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { units } from './hierarchy.js';

/**
 * Reading Metrics - Aggregated sensor reading statistics per time period
 *
 * Stores derived metrics (min, max, average, count) for efficient historical
 * querying without scanning the high-volume sensor_readings table.
 *
 * Granularity options:
 * - hourly: For detailed analysis and dashboards
 * - daily: For trend analysis and reports
 * - weekly: For long-term patterns
 * - monthly: For compliance reports
 */
export const readingMetrics = pgTable(
  'reading_metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    unitId: uuid('unit_id')
      .references(() => units.id, { onDelete: 'cascade' })
      .notNull(),
    // Time period boundaries
    periodStart: timestamp('period_start', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    }).notNull(),
    periodEnd: timestamp('period_end', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    }).notNull(),
    // Granularity of aggregation
    granularity: varchar('granularity', { length: 16 }).notNull(), // 'hourly', 'daily', 'weekly', 'monthly'
    // Temperature metrics (stored as numeric for precision)
    tempMin: numeric('temp_min', { precision: 7, scale: 2 }).notNull(),
    tempMax: numeric('temp_max', { precision: 7, scale: 2 }).notNull(),
    tempAvg: numeric('temp_avg', { precision: 7, scale: 2 }).notNull(),
    tempSum: numeric('temp_sum', { precision: 12, scale: 2 }).notNull(), // For incremental avg calculation
    // Humidity metrics (optional, may be null if no humidity readings)
    humidityMin: numeric('humidity_min', { precision: 5, scale: 2 }),
    humidityMax: numeric('humidity_max', { precision: 5, scale: 2 }),
    humidityAvg: numeric('humidity_avg', { precision: 5, scale: 2 }),
    // Count of readings in this period
    readingCount: integer('reading_count').notNull().default(0),
    // Anomaly tracking
    anomalyCount: integer('anomaly_count').notNull().default(0), // Readings outside thresholds
    // Metadata
    createdAt: timestamp('created_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Primary query pattern: metrics for a unit over time
    index('reading_metrics_unit_period_idx').on(
      table.unitId,
      table.periodStart,
      table.granularity
    ),
    // For querying by granularity across units
    index('reading_metrics_granularity_idx').on(
      table.granularity,
      table.periodStart
    ),
    // Prevent duplicate metrics for same unit/period/granularity
    unique('reading_metrics_unique_period').on(
      table.unitId,
      table.periodStart,
      table.granularity
    ),
  ]
);

// Type exports
export type ReadingMetric = typeof readingMetrics.$inferSelect;
export type InsertReadingMetric = typeof readingMetrics.$inferInsert;

/**
 * Valid granularity values for reading metrics
 */
export const METRIC_GRANULARITIES = ['hourly', 'daily', 'weekly', 'monthly'] as const;
export type MetricGranularity = (typeof METRIC_GRANULARITIES)[number];
