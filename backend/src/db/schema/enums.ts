import { pgEnum } from 'drizzle-orm/pg-core';

// Unit Management
export const unitTypeEnum = pgEnum('unit_type', [
  'fridge',
  'freezer',
  'display_case',
  'walk_in_cooler',
  'walk_in_freezer',
  'blast_chiller',
]);

export const unitStatusEnum = pgEnum('unit_status', [
  'ok',
  'excursion',
  'alarm_active',
  'monitoring_interrupted',
  'manual_required',
  'restoring',
  'offline',
]);

export const tempUnitEnum = pgEnum('temp_unit', ['F', 'C']);

// Alerting
export const alertTypeEnum = pgEnum('alert_type', [
  'alarm_active',
  'monitoring_interrupted',
  'missed_manual_entry',
  'low_battery',
  'sensor_fault',
  'door_open',
  'calibration_due',
]);

export const alertSeverityEnum = pgEnum('alert_severity', [
  'info',
  'warning',
  'critical',
]);

export const alertStatusEnum = pgEnum('alert_status', [
  'active',
  'acknowledged',
  'resolved',
  'escalated',
]);

// User Management
export const appRoleEnum = pgEnum('app_role', [
  'owner',
  'admin',
  'manager',
  'staff',
  'viewer',
]);

// Subscription/Billing
export const subscriptionPlanEnum = pgEnum('subscription_plan', [
  'starter',
  'pro',
  'haccp',
  'enterprise',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trial',
  'active',
  'past_due',
  'canceled',
  'paused',
]);

// Notifications
export const notificationChannelEnum = pgEnum('notification_channel', [
  'push',
  'email',
  'sms',
]);

export const notificationStatusEnum = pgEnum('notification_status', [
  'pending',
  'sent',
  'delivered',
  'failed',
]);

// Device Management
export const deviceStatusEnum = pgEnum('device_status', [
  'active',
  'inactive',
  'pairing',
  'error',
]);

// Organization
export const complianceModeEnum = pgEnum('compliance_mode', [
  'standard',
  'haccp',
]);

// Pairing
export const pairingStatusEnum = pgEnum('pairing_status', [
  'pending',
  'completed',
  'failed',
  'expired',
]);

// Gateway Management
export const gatewayStatusEnum = pgEnum('gateway_status', [
  'online',
  'offline',
  'disconnected',
  'unknown',
]);
