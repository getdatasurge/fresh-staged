import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { complianceModeEnum, gatewayStatusEnum, tempUnitEnum, unitStatusEnum, unitTypeEnum } from './enums.js'
import { organizations, ttnConnections } from './tenancy.js'

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
  deletedAt: timestamp('deleted_at', {
    mode: 'date',
    precision: 3,
    withTimezone: true,
  }),
};


// Sites - physical locations (top of hierarchy)
export const sites = pgTable(
  'sites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 256 }).notNull(),
    address: text('address'),
    city: varchar('city', { length: 128 }),
    state: varchar('state', { length: 64 }),
    postalCode: varchar('postal_code', { length: 20 }),
    country: varchar('country', { length: 64 }),
    timezone: varchar('timezone', { length: 100 }).notNull().default('UTC'),
    complianceMode: complianceModeEnum('compliance_mode').default('standard'),
    manualLogCadenceSeconds: integer('manual_log_cadence_seconds'),
    correctiveActionRequired: boolean('corrective_action_required').default(false),
    latitude: varchar('latitude', { length: 32 }),
    longitude: varchar('longitude', { length: 32 }),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index('sites_org_idx').on(table.organizationId),
    index('sites_active_idx').on(table.organizationId, table.isActive),
  ]
);

// Areas - subdivisions within a site
export const areas = pgTable(
  'areas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .references(() => sites.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 256 }).notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index('areas_site_idx').on(table.siteId),
    index('areas_sort_idx').on(table.siteId, table.sortOrder),
  ]
);

// Units - refrigeration equipment (core monitoring entity)
export const units = pgTable(
  'units',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    areaId: uuid('area_id')
      .references(() => areas.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 256 }).notNull(),
    unitType: unitTypeEnum('unit_type').notNull(),
    status: unitStatusEnum('status').notNull().default('ok'),
    tempMin: integer('temp_min').notNull(),
    tempMax: integer('temp_max').notNull(),
    tempUnit: tempUnitEnum('temp_unit').notNull().default('F'),
    manualMonitoringRequired: boolean('manual_monitoring_required')
      .notNull()
      .default(false),
    manualMonitoringInterval: integer('manual_monitoring_interval'), // minutes
    lastReadingAt: timestamp('last_reading_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    }),
    lastTemperature: integer('last_temperature'),
    lastManualLogAt: timestamp('last_manual_log_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    }),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index('units_area_idx').on(table.areaId),
    index('units_status_idx').on(table.status),
    index('units_type_idx').on(table.unitType),
    index('units_active_idx').on(table.areaId, table.isActive),
  ]
);

// Hubs - network aggregators for BLE sensors
export const hubs = pgTable(
  'hubs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .references(() => sites.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 256 }).notNull(),
    macAddress: varchar('mac_address', { length: 17 }), // XX:XX:XX:XX:XX:XX
    firmwareVersion: varchar('firmware_version', { length: 32 }),
    lastSeenAt: timestamp('last_seen_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    }),
    isOnline: boolean('is_online').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index('hubs_site_idx').on(table.siteId),
    uniqueIndex('hubs_mac_idx').on(table.macAddress),
  ]
);

// Gateways - LoRaWAN gateways for TTN network
export const gateways = pgTable(
  'gateways',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ttnConnectionId: uuid('ttn_connection_id')
      .references(() => ttnConnections.id, { onDelete: 'cascade' })
      .notNull(),
    siteId: uuid('site_id')
      .references(() => sites.id, { onDelete: 'set null' }),
    gatewayId: varchar('gateway_id', { length: 36 }).notNull(), // TTN gateway ID
    gatewayEui: varchar('gateway_eui', { length: 16 }).notNull(), // 16 hex chars
    name: varchar('name', { length: 256 }),
    description: text('description'),
    frequencyPlanId: varchar('frequency_plan_id', { length: 64 }),
    status: gatewayStatusEnum('status').notNull().default('unknown'),
    latitude: varchar('latitude', { length: 32 }),
    longitude: varchar('longitude', { length: 32 }),
    altitude: integer('altitude'),
    lastSeenAt: timestamp('last_seen_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    }),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index('gateways_ttn_connection_idx').on(table.ttnConnectionId),
    index('gateways_site_idx').on(table.siteId),
    uniqueIndex('gateways_gateway_id_idx').on(table.gatewayId),
    uniqueIndex('gateways_gateway_eui_idx').on(table.gatewayEui),
  ]
);

// Type exports
export type Site = typeof sites.$inferSelect;
export type InsertSite = typeof sites.$inferInsert;
export type Area = typeof areas.$inferSelect;
export type InsertArea = typeof areas.$inferInsert;
export type Unit = typeof units.$inferSelect;
export type InsertUnit = typeof units.$inferInsert;
export type Hub = typeof hubs.$inferSelect;
export type InsertHub = typeof hubs.$inferInsert;
export type Gateway = typeof gateways.$inferSelect;
export type InsertGateway = typeof gateways.$inferInsert;
