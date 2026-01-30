import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { deviceStatusEnum, pairingStatusEnum } from './enums.js';
import { units, hubs } from './hierarchy.js';

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

// Devices - physical sensors
export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    unitId: uuid('unit_id').references(() => units.id, { onDelete: 'set null' }),
    hubId: uuid('hub_id').references(() => hubs.id, { onDelete: 'set null' }),
    deviceEui: varchar('device_eui', { length: 32 }).notNull(),
    name: varchar('name', { length: 256 }),
    deviceType: varchar('device_type', { length: 64 }), // e.g., 'lora', 'ble', 'wifi'
    status: deviceStatusEnum('status').notNull().default('inactive'),
    battery: integer('battery'), // percentage 0-100
    signalStrength: integer('signal_strength'), // RSSI or similar
    firmwareVersion: varchar('firmware_version', { length: 32 }),
    lastSeenAt: timestamp('last_seen_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    }),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('devices_eui_idx').on(table.deviceEui),
    index('devices_unit_idx').on(table.unitId),
    index('devices_hub_idx').on(table.hubId),
    index('devices_status_idx').on(table.status),
  ],
);

// LoRa Sensors - LoRaWAN-specific configuration
export const loraSensors = pgTable(
  'lora_sensors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceId: uuid('device_id')
      .references(() => devices.id, { onDelete: 'cascade' })
      .notNull(),
    appEui: varchar('app_eui', { length: 32 }).notNull(),
    devEui: varchar('dev_eui', { length: 32 }).notNull(),
    appKey: varchar('app_key', { length: 64 }), // encrypted in production
    joinEui: varchar('join_eui', { length: 32 }),
    networkServerId: varchar('network_server_id', { length: 128 }), // TTN app ID
    activationType: varchar('activation_type', { length: 16 }).default('OTAA'), // OTAA or ABP
    lastJoinAt: timestamp('last_join_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('lora_sensors_device_idx').on(table.deviceId),
    uniqueIndex('lora_sensors_dev_eui_idx').on(table.devEui),
    index('lora_sensors_app_eui_idx').on(table.appEui),
  ],
);

// Calibration Records - calibration history for compliance
export const calibrationRecords = pgTable(
  'calibration_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceId: uuid('device_id')
      .references(() => devices.id, { onDelete: 'cascade' })
      .notNull(),
    calibratedAt: timestamp('calibrated_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    }).notNull(),
    calibratedBy: uuid('calibrated_by'), // profile_id of person who calibrated
    temperatureOffset: integer('temperature_offset'), // offset in 0.01 degrees
    humidityOffset: integer('humidity_offset'), // offset in 0.01 percent
    referenceTemperature: integer('reference_temperature'), // calibration reference
    certificateUrl: text('certificate_url'),
    notes: text('notes'),
    expiresAt: timestamp('expires_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    }),
    ...timestamps,
  },
  (table) => [
    index('calibration_records_device_idx').on(table.deviceId),
    index('calibration_records_date_idx').on(table.deviceId, table.calibratedAt),
    index('calibration_records_expires_idx').on(table.expiresAt),
  ],
);

// Pairing Sessions - temporary device pairing state
export const pairingSessions = pgTable(
  'pairing_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceId: uuid('device_id').references(() => devices.id, {
      onDelete: 'cascade',
    }),
    status: pairingStatusEnum('status').notNull().default('pending'),
    pairingCode: varchar('pairing_code', { length: 16 }),
    startedAt: timestamp('started_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    completedAt: timestamp('completed_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    }),
    expiresAt: timestamp('expires_at', {
      mode: 'date',
      precision: 3,
      withTimezone: true,
    }).notNull(),
    metadata: text('metadata'), // JSON for additional pairing data
    ...timestamps,
  },
  (table) => [
    index('pairing_sessions_device_idx').on(table.deviceId),
    index('pairing_sessions_status_idx').on(table.status),
    index('pairing_sessions_code_idx').on(table.pairingCode),
  ],
);

// Type exports
export type Device = typeof devices.$inferSelect;
export type InsertDevice = typeof devices.$inferInsert;
export type LoraSensor = typeof loraSensors.$inferSelect;
export type InsertLoraSensor = typeof loraSensors.$inferInsert;
export type CalibrationRecord = typeof calibrationRecords.$inferSelect;
export type InsertCalibrationRecord = typeof calibrationRecords.$inferInsert;
export type PairingSession = typeof pairingSessions.$inferSelect;
export type InsertPairingSession = typeof pairingSessions.$inferInsert;
