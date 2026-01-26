import {
	boolean,
	index,
	integer,
	json,
	numeric,
	pgTable,
	text,
	timestamp,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core'
import { devices } from './devices.js'
import { units } from './hierarchy.js'
import { organizations } from './tenancy.js'
import { profiles } from './users.js'

// Sensor Readings - high-volume time-series temperature data
export const sensorReadings = pgTable(
	'sensor_readings',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		unitId: uuid('unit_id')
			.references(() => units.id, { onDelete: 'cascade' })
			.notNull(),
		deviceId: uuid('device_id').references(() => devices.id, {
			onDelete: 'set null',
		}),
		// Temperature in device units (typically Celsius * 100 for precision)
		temperature: numeric('temperature', { precision: 7, scale: 2 }).notNull(),
		humidity: numeric('humidity', { precision: 5, scale: 2 }),
		battery: integer('battery'), // percentage 0-100 at time of reading
		signalStrength: integer('signal_strength'), // RSSI at time of reading
		// Raw payload for debugging/audit
		rawPayload: text('raw_payload'),
		// Timestamp from device (may differ from received time)
		recordedAt: timestamp('recorded_at', {
			mode: 'date',
			precision: 3,
			withTimezone: true,
		}).notNull(),
		// Timestamp when server received the reading
		receivedAt: timestamp('received_at', {
			mode: 'date',
			precision: 3,
			withTimezone: true,
		})
			.defaultNow()
			.notNull(),
		// Source of reading for troubleshooting
		source: varchar('source', { length: 32 }), // 'ttn', 'manual', 'api', etc.
	},
	table => [
		// Primary index for time-series queries: readings for a unit in time order
		index('sensor_readings_unit_time_idx').on(table.unitId, table.recordedAt),
		// Index for device-specific queries
		index('sensor_readings_device_idx').on(table.deviceId),
		// Index for recent readings queries (last 24h, 7d, etc.)
		index('sensor_readings_recorded_idx').on(table.recordedAt),
	],
)

// Manual Temperature Logs - user-entered readings
export const manualTemperatureLogs = pgTable(
	'manual_temperature_logs',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		unitId: uuid('unit_id')
			.references(() => units.id, { onDelete: 'cascade' })
			.notNull(),
		profileId: uuid('profile_id').references(() => profiles.id, {
			onDelete: 'set null',
		}),
		temperature: numeric('temperature', { precision: 7, scale: 2 }).notNull(),
		humidity: numeric('humidity', { precision: 5, scale: 2 }),
		notes: text('notes'),
		photoUrl: text('photo_url'), // evidence photo for compliance
		// When the reading was taken (user-reported time)
		recordedAt: timestamp('recorded_at', {
			mode: 'date',
			precision: 3,
			withTimezone: true,
		}).notNull(),
		// When the log was submitted
		createdAt: timestamp('created_at', {
			mode: 'date',
			precision: 3,
			withTimezone: true,
		})
			.defaultNow()
			.notNull(),
	},
	table => [
		index('manual_logs_unit_time_idx').on(table.unitId, table.recordedAt),
		index('manual_logs_profile_idx').on(table.profileId),
		index('manual_logs_recorded_idx').on(table.recordedAt),
	],
)

// Door Events - door sensor history
export const doorEvents = pgTable(
	'door_events',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		unitId: uuid('unit_id')
			.references(() => units.id, { onDelete: 'cascade' })
			.notNull(),
		deviceId: uuid('device_id').references(() => devices.id, {
			onDelete: 'set null',
		}),
		state: varchar('state', { length: 16 }).notNull(), // 'open', 'closed'
		// Timestamp of state change
		timestamp: timestamp('timestamp', {
			mode: 'date',
			precision: 3,
			withTimezone: true,
		}).notNull(),
		// Duration door was in previous state (computed on close)
		durationSeconds: integer('duration_seconds'),
		// When record was created
		createdAt: timestamp('created_at', {
			mode: 'date',
			precision: 3,
			withTimezone: true,
		})
			.defaultNow()
			.notNull(),
	},
	table => [
		index('door_events_unit_time_idx').on(table.unitId, table.timestamp),
		index('door_events_device_idx').on(table.deviceId),
		index('door_events_timestamp_idx').on(table.timestamp),
	],
)

// Entity Dashboard Layouts - user-specific dashboard configurations per entity
export const entityDashboardLayouts = pgTable(
	'entity_dashboard_layouts',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organizationId: uuid('organization_id')
			.references(() => organizations.id, { onDelete: 'cascade' })
			.notNull(),
		entityType: varchar('entity_type', { length: 64 }).notNull(),
		entityId: uuid('entity_id').notNull(),
		userId: uuid('user_id').notNull(),
		slotNumber: integer('slot_number').notNull(),
		name: varchar('name', { length: 256 }).notNull(),
		isUserDefault: boolean('is_user_default').notNull().default(false),
		layoutJson: json('layout_json').notNull(),
		widgetPrefsJson: json('widget_prefs_json').default({}),
		timelineStateJson: json('timeline_state_json'),
		layoutVersion: integer('layout_version').notNull().default(1),
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
	},
	table => [
		index('entity_dashboard_layouts_entity_idx').on(
			table.entityType,
			table.entityId,
			table.userId,
		),
		index('entity_dashboard_layouts_user_idx').on(table.userId),
		index('entity_dashboard_layouts_org_idx').on(table.organizationId),
	],
)

// Type exports
export type SensorReading = typeof sensorReadings.$inferSelect
export type InsertSensorReading = typeof sensorReadings.$inferInsert
export type ManualTemperatureLog = typeof manualTemperatureLogs.$inferSelect
export type InsertManualTemperatureLog =
	typeof manualTemperatureLogs.$inferInsert
export type DoorEvent = typeof doorEvents.$inferSelect
export type InsertDoorEvent = typeof doorEvents.$inferInsert
export type EntityDashboardLayout = typeof entityDashboardLayouts.$inferSelect
export type InsertEntityDashboardLayout =
	typeof entityDashboardLayouts.$inferInsert
