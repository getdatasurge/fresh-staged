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
import {
	complianceModeEnum,
	subscriptionPlanEnum,
	subscriptionStatusEnum,
} from './enums.js'

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
}

// Organizations - primary tenant boundary
export const organizations = pgTable(
	'organizations',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		name: varchar('name', { length: 256 }).notNull(),
		slug: varchar('slug', { length: 256 }).notNull(),
		timezone: varchar('timezone', { length: 100 }).notNull().default('UTC'),
		complianceMode: complianceModeEnum('compliance_mode')
			.notNull()
			.default('standard'),
		sensorLimit: integer('sensor_limit').notNull().default(10),
		logoUrl: text('logo_url'),
		...timestamps,
	},
	table => [uniqueIndex('organizations_slug_idx').on(table.slug)],
)

// Subscriptions - billing/plan management
export const subscriptions = pgTable(
	'subscriptions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organizationId: uuid('organization_id')
			.references(() => organizations.id, { onDelete: 'cascade' })
			.notNull(),
		plan: subscriptionPlanEnum('plan').notNull().default('starter'),
		status: subscriptionStatusEnum('status').notNull().default('trial'),
		stripeCustomerId: varchar('stripe_customer_id', { length: 256 }),
		stripeSubscriptionId: varchar('stripe_subscription_id', { length: 256 }),
		currentPeriodStart: timestamp('current_period_start', {
			mode: 'date',
			precision: 3,
			withTimezone: true,
		}),
		currentPeriodEnd: timestamp('current_period_end', {
			mode: 'date',
			precision: 3,
			withTimezone: true,
		}),
		trialEndsAt: timestamp('trial_ends_at', {
			mode: 'date',
			precision: 3,
			withTimezone: true,
		}),
		canceledAt: timestamp('canceled_at', {
			mode: 'date',
			precision: 3,
			withTimezone: true,
		}),
		...timestamps,
	},
	table => [
		index('subscriptions_org_idx').on(table.organizationId),
		index('subscriptions_stripe_customer_idx').on(table.stripeCustomerId),
	],
)

// TTN Connections - The Things Network integration configuration
export const ttnConnections = pgTable(
	'ttn_connections',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organizationId: uuid('organization_id')
			.references(() => organizations.id, { onDelete: 'cascade' })
			.notNull(),
		applicationId: varchar('application_id', { length: 256 }), // TTN application ID (legacy alias)
		ttnApplicationId: varchar('ttn_application_id', { length: 256 }), // TTN application ID
		webhookSecret: varchar('webhook_secret', { length: 256 }).notNull(), // API key for webhook auth
		isActive: boolean('is_active').notNull().default(true),
		lastUsedAt: timestamp('last_used_at', {
			mode: 'date',
			precision: 3,
			withTimezone: true,
		}),
		isEnabled: boolean('is_enabled').notNull().default(false),
		provisioningStatus: varchar('provisioning_status', { length: 256 }).default(
			'not_started',
		),
		ttnRegion: varchar('ttn_region', { length: 256 }),
		// App API key
		ttnApiKeyEncrypted: varchar('ttn_api_key_encrypted', { length: 512 }),
		ttnApiKeyLast4: varchar('ttn_api_key_last4', { length: 4 }),
		// Org API key
		ttnOrgApiKeyEncrypted: varchar('ttn_org_api_key_encrypted', { length: 512 }),
		ttnOrgApiKeyLast4: varchar('ttn_org_api_key_last4', { length: 4 }),
		// Webhook
		ttnWebhookUrl: varchar('ttn_webhook_url', { length: 512 }),
		ttnWebhookSecretLast4: varchar('ttn_webhook_secret_last4', { length: 4 }),
		ttnWebhookSecretEncrypted: varchar('ttn_webhook_secret_encrypted', {
			length: 512,
		}),
		// Provisioning state machine
		provisioningStep: varchar('provisioning_step', { length: 256 }),
		provisioningStepDetails: text('provisioning_step_details'), // JSON string
		provisioningError: varchar('provisioning_error', { length: 1024 }),
		provisioningAttemptCount: integer('provisioning_attempt_count').default(0),
		// Diagnostics
		lastHttpStatus: integer('last_http_status'),
		lastHttpBody: text('last_http_body'),
		appRightsCheckStatus: varchar('app_rights_check_status', { length: 256 }),
		lastTtnCorrelationId: varchar('last_ttn_correlation_id', { length: 256 }),
		lastTtnErrorName: varchar('last_ttn_error_name', { length: 256 }),
		credentialsLastRotatedAt: timestamp('credentials_last_rotated_at', {
			mode: 'date',
			precision: 3,
			withTimezone: true,
		}),
		...timestamps,
	},
	table => [
		index('ttn_connections_org_idx').on(table.organizationId),
		uniqueIndex('ttn_connections_webhook_secret_idx').on(table.webhookSecret),
	],
)

// SMS Configurations - Telnyx SMS integration per organization
export const smsConfigs = pgTable(
	'sms_configs',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organizationId: uuid('organization_id')
			.references(() => organizations.id, { onDelete: 'cascade' })
			.notNull(),
		// Telnyx credentials (encrypted at rest via column-level encryption in production)
		telnyxApiKey: varchar('telnyx_api_key', { length: 512 }).notNull(),
		telnyxPhoneNumber: varchar('telnyx_phone_number', { length: 32 }).notNull(),
		telnyxMessagingProfileId: varchar('telnyx_messaging_profile_id', {
			length: 256,
		}),
		// Configuration
		isEnabled: boolean('is_enabled').notNull().default(true),
		// Audit
		lastTestAt: timestamp('last_test_at', {
			mode: 'date',
			precision: 3,
			withTimezone: true,
		}),
		...timestamps,
	},
	table => [
		index('sms_configs_org_idx').on(table.organizationId),
		uniqueIndex('sms_configs_org_unique_idx').on(table.organizationId),
	],
)

// Notification Settings - organization-level email notification configuration
export const notificationSettings = pgTable(
	'notification_settings',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organizationId: uuid('organization_id')
			.references(() => organizations.id, { onDelete: 'cascade' })
			.notNull(),
		emailEnabled: boolean('email_enabled').notNull().default(true),
		recipients: text('recipients'), // JSON array of email strings
		notifyTempExcursion: boolean('notify_temp_excursion').notNull().default(true),
		notifyAlarmActive: boolean('notify_alarm_active').notNull().default(true),
		notifyManualRequired: boolean('notify_manual_required').notNull().default(true),
		notifyOffline: boolean('notify_offline').notNull().default(false),
		notifyLowBattery: boolean('notify_low_battery').notNull().default(false),
		notifyWarnings: boolean('notify_warnings').notNull().default(false),
		...timestamps,
	},
	table => [
		index('notification_settings_org_idx').on(table.organizationId),
		uniqueIndex('notification_settings_org_unique_idx').on(table.organizationId),
	],
)

// Type exports
export type Organization = typeof organizations.$inferSelect
export type InsertOrganization = typeof organizations.$inferInsert
export type Subscription = typeof subscriptions.$inferSelect
export type InsertSubscription = typeof subscriptions.$inferInsert
export type TtnConnection = typeof ttnConnections.$inferSelect
export type InsertTtnConnection = typeof ttnConnections.$inferInsert
export type SmsConfig = typeof smsConfigs.$inferSelect
export type InsertSmsConfig = typeof smsConfigs.$inferInsert
export type NotificationSettings = typeof notificationSettings.$inferSelect
export type InsertNotificationSettings = typeof notificationSettings.$inferInsert
