import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import {
  alertTypeEnum,
  alertSeverityEnum,
  alertStatusEnum,
} from './enums.js';
import { organizations } from './tenancy.js';
import { sites, units } from './hierarchy.js';
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
  updatedAt: timestamp('updated_at', {
    mode: 'date',
    precision: 3,
    withTimezone: true,
  })
    .defaultNow()
    .notNull()
    .$onUpdateFn(() => new Date()),
};

// Alert Rules - threshold configuration with hierarchical inheritance
export const alertRules = pgTable(
  'alert_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Hierarchical scope: org > site > unit (only one should be set)
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    siteId: uuid('site_id').references(() => sites.id, { onDelete: 'cascade' }),
    unitId: uuid('unit_id').references(() => units.id, { onDelete: 'cascade' }),
    // Rule name for display
    name: varchar('name', { length: 256 }).notNull(),
    // Temperature thresholds (in device units)
    tempMin: integer('temp_min'),
    tempMax: integer('temp_max'),
    // Delay before triggering alert (minutes)
    delayMinutes: integer('delay_minutes').notNull().default(5),
    // Alert configuration
    alertType: alertTypeEnum('alert_type').notNull().default('alarm_active'),
    severity: alertSeverityEnum('severity').notNull().default('warning'),
    // Whether rule is active
    isEnabled: boolean('is_enabled').notNull().default(true),
    // Optional schedule (JSON: { days: [0-6], startHour, endHour })
    schedule: text('schedule'),
    ...timestamps,
  },
  (table) => [
    index('alert_rules_org_idx').on(table.organizationId),
    index('alert_rules_site_idx').on(table.siteId),
    index('alert_rules_unit_idx').on(table.unitId),
    index('alert_rules_enabled_idx').on(table.organizationId, table.isEnabled),
  ]
);

// Alert Rules History - audit trail for rule changes
export const alertRulesHistory = pgTable(
  'alert_rules_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    alertRuleId: uuid('alert_rule_id')
      .references(() => alertRules.id, { onDelete: 'cascade' })
      .notNull(),
    changedBy: uuid('changed_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    changeType: varchar('change_type', { length: 32 }).notNull(), // 'created', 'updated', 'deleted'
    oldValues: text('old_values'), // JSON of previous values
    newValues: text('new_values'), // JSON of new values
    changedAt: timestamp('changed_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('alert_rules_history_rule_idx').on(table.alertRuleId),
    index('alert_rules_history_date_idx').on(table.changedAt),
  ]
);

// Alerts - active and historical alerts
export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    unitId: uuid('unit_id')
      .references(() => units.id, { onDelete: 'cascade' })
      .notNull(),
    alertRuleId: uuid('alert_rule_id').references(() => alertRules.id, {
      onDelete: 'set null',
    }),
    // Alert classification
    alertType: alertTypeEnum('alert_type').notNull(),
    severity: alertSeverityEnum('severity').notNull(),
    status: alertStatusEnum('status').notNull().default('active'),
    // Alert details
    message: text('message'),
    // Temperature at time of alert (if applicable)
    triggerTemperature: integer('trigger_temperature'),
    thresholdViolated: varchar('threshold_violated', { length: 16 }), // 'min' or 'max'
    // Lifecycle timestamps
    triggeredAt: timestamp('triggered_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    acknowledgedAt: timestamp('acknowledged_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    }),
    acknowledgedBy: uuid('acknowledged_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamp('resolved_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    }),
    resolvedBy: uuid('resolved_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    escalatedAt: timestamp('escalated_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    }),
    // Escalation level (0 = initial, 1+ = escalated)
    escalationLevel: integer('escalation_level').notNull().default(0),
    // Metadata for additional context
    metadata: text('metadata'), // JSON
    ...timestamps,
  },
  (table) => [
    index('alerts_unit_idx').on(table.unitId),
    index('alerts_status_idx').on(table.status),
    index('alerts_type_idx').on(table.alertType),
    index('alerts_triggered_idx').on(table.triggeredAt),
    // Composite for finding active alerts per unit
    index('alerts_unit_status_idx').on(table.unitId, table.status),
  ]
);

// Corrective Actions - resolution documentation for compliance
export const correctiveActions = pgTable(
  'corrective_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    alertId: uuid('alert_id')
      .references(() => alerts.id, { onDelete: 'cascade' })
      .notNull(),
    unitId: uuid('unit_id')
      .references(() => units.id, { onDelete: 'cascade' })
      .notNull(),
    profileId: uuid('profile_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    // Action documentation
    description: text('description').notNull(),
    actionTaken: text('action_taken'),
    // Evidence for compliance
    photoUrl: text('photo_url'),
    // Whether this resolved the alert
    resolvedAlert: boolean('resolved_alert').notNull().default(false),
    // When action was taken
    actionAt: timestamp('action_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('corrective_actions_alert_idx').on(table.alertId),
    index('corrective_actions_unit_idx').on(table.unitId),
    index('corrective_actions_profile_idx').on(table.profileId),
    index('corrective_actions_date_idx').on(table.actionAt),
  ]
);

// Type exports
export type AlertRule = typeof alertRules.$inferSelect;
export type InsertAlertRule = typeof alertRules.$inferInsert;
export type AlertRuleHistory = typeof alertRulesHistory.$inferSelect;
export type InsertAlertRuleHistory = typeof alertRulesHistory.$inferInsert;
export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = typeof alerts.$inferInsert;
export type CorrectiveAction = typeof correctiveActions.$inferSelect;
export type InsertCorrectiveAction = typeof correctiveActions.$inferInsert;
