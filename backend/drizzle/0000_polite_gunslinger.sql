CREATE TYPE "public"."alert_severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('active', 'acknowledged', 'resolved', 'escalated');--> statement-breakpoint
CREATE TYPE "public"."alert_type" AS ENUM('alarm_active', 'monitoring_interrupted', 'missed_manual_entry', 'low_battery', 'sensor_fault', 'door_open', 'calibration_due');--> statement-breakpoint
CREATE TYPE "public"."app_role" AS ENUM('owner', 'admin', 'manager', 'staff', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."compliance_mode" AS ENUM('standard', 'haccp');--> statement-breakpoint
CREATE TYPE "public"."device_status" AS ENUM('active', 'inactive', 'pairing', 'error');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('push', 'email', 'sms');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."pairing_status" AS ENUM('pending', 'completed', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."subscription_plan" AS ENUM('starter', 'pro', 'haccp', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trial', 'active', 'past_due', 'canceled', 'paused');--> statement-breakpoint
CREATE TYPE "public"."unit_status" AS ENUM('ok', 'excursion', 'alarm_active', 'monitoring_interrupted', 'manual_required', 'restoring', 'offline');--> statement-breakpoint
CREATE TYPE "public"."unit_type" AS ENUM('fridge', 'freezer', 'display_case', 'walk_in_cooler', 'walk_in_freezer', 'blast_chiller');--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid,
	"unit_id" uuid,
	"name" varchar(256) NOT NULL,
	"temp_min" integer,
	"temp_max" integer,
	"delay_minutes" integer DEFAULT 5 NOT NULL,
	"alert_type" "alert_type" DEFAULT 'alarm_active' NOT NULL,
	"severity" "alert_severity" DEFAULT 'warning' NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"schedule" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_rules_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_rule_id" uuid NOT NULL,
	"changed_by" uuid,
	"change_type" varchar(32) NOT NULL,
	"old_values" text,
	"new_values" text,
	"changed_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"alert_rule_id" uuid,
	"alert_type" "alert_type" NOT NULL,
	"severity" "alert_severity" NOT NULL,
	"status" "alert_status" DEFAULT 'active' NOT NULL,
	"message" text,
	"trigger_temperature" integer,
	"threshold_violated" varchar(16),
	"triggered_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp (3) with time zone,
	"acknowledged_by" uuid,
	"resolved_at" timestamp (3) with time zone,
	"resolved_by" uuid,
	"escalated_at" timestamp (3) with time zone,
	"escalation_level" integer DEFAULT 0 NOT NULL,
	"metadata" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corrective_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"profile_id" uuid,
	"description" text NOT NULL,
	"action_taken" text,
	"photo_url" text,
	"resolved_alert" boolean DEFAULT false NOT NULL,
	"action_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_type" varchar(32) NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"event_category" varchar(64),
	"entity_type" varchar(64) NOT NULL,
	"entity_id" uuid,
	"description" text,
	"payload" text,
	"old_values" text,
	"new_values" text,
	"ip_address" varchar(45),
	"user_agent" text,
	"previous_hash" varchar(64),
	"hash" varchar(64) NOT NULL,
	"occurred_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calibration_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"calibrated_at" timestamp (3) with time zone NOT NULL,
	"calibrated_by" uuid,
	"temperature_offset" integer,
	"humidity_offset" integer,
	"reference_temperature" integer,
	"certificate_url" text,
	"notes" text,
	"expires_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid,
	"hub_id" uuid,
	"device_eui" varchar(32) NOT NULL,
	"name" varchar(256),
	"device_type" varchar(64),
	"status" "device_status" DEFAULT 'inactive' NOT NULL,
	"battery" integer,
	"signal_strength" integer,
	"firmware_version" varchar(32),
	"last_seen_at" timestamp (3) with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lora_sensors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"app_eui" varchar(32) NOT NULL,
	"dev_eui" varchar(32) NOT NULL,
	"app_key" varchar(64),
	"join_eui" varchar(32),
	"network_server_id" varchar(128),
	"activation_type" varchar(16) DEFAULT 'OTAA',
	"last_join_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pairing_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid,
	"status" "pairing_status" DEFAULT 'pending' NOT NULL,
	"pairing_code" varchar(16),
	"started_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp (3) with time zone,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"metadata" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"name" varchar(256) NOT NULL,
	"mac_address" varchar(17),
	"firmware_version" varchar(32),
	"last_seen_at" timestamp (3) with time zone,
	"is_online" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(256) NOT NULL,
	"address" text,
	"city" varchar(128),
	"state" varchar(64),
	"postal_code" varchar(20),
	"country" varchar(64),
	"timezone" varchar(100) DEFAULT 'UTC' NOT NULL,
	"latitude" varchar(32),
	"longitude" varchar(32),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"area_id" uuid NOT NULL,
	"name" varchar(256) NOT NULL,
	"unit_type" "unit_type" NOT NULL,
	"status" "unit_status" DEFAULT 'ok' NOT NULL,
	"temp_min" integer NOT NULL,
	"temp_max" integer NOT NULL,
	"temp_unit" varchar(1) DEFAULT 'F' NOT NULL,
	"manual_monitoring_required" boolean DEFAULT false NOT NULL,
	"manual_monitoring_interval" integer,
	"last_reading_at" timestamp (3) with time zone,
	"last_temperature" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(256) NOT NULL,
	"slug" varchar(256) NOT NULL,
	"timezone" varchar(100) DEFAULT 'UTC' NOT NULL,
	"compliance_mode" "compliance_mode" DEFAULT 'standard' NOT NULL,
	"sensor_limit" integer DEFAULT 10 NOT NULL,
	"logo_url" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan" "subscription_plan" DEFAULT 'starter' NOT NULL,
	"status" "subscription_status" DEFAULT 'trial' NOT NULL,
	"stripe_customer_id" varchar(256),
	"stripe_subscription_id" varchar(256),
	"current_period_start" timestamp (3) with time zone,
	"current_period_end" timestamp (3) with time zone,
	"trial_ends_at" timestamp (3) with time zone,
	"canceled_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escalation_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"profile_id" uuid,
	"name" varchar(256) NOT NULL,
	"phone" varchar(50) NOT NULL,
	"email" varchar(256),
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" varchar(256) NOT NULL,
	"full_name" varchar(256),
	"avatar_url" text,
	"phone" varchar(50),
	"phone_verified" boolean DEFAULT false NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"sms_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" "app_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "door_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"device_id" uuid,
	"state" varchar(16) NOT NULL,
	"timestamp" timestamp (3) with time zone NOT NULL,
	"duration_seconds" integer,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_temperature_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"profile_id" uuid,
	"temperature" numeric(7, 2) NOT NULL,
	"humidity" numeric(5, 2),
	"notes" text,
	"photo_url" text,
	"recorded_at" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sensor_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"device_id" uuid,
	"temperature" numeric(7, 2) NOT NULL,
	"humidity" numeric(5, 2),
	"battery" integer,
	"signal_strength" integer,
	"raw_payload" text,
	"recorded_at" timestamp (3) with time zone NOT NULL,
	"received_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"source" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" uuid NOT NULL,
	"profile_id" uuid,
	"channel" "notification_channel" NOT NULL,
	"recipient" varchar(256) NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"external_id" varchar(256),
	"error_message" text,
	"scheduled_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp (3) with time zone,
	"delivered_at" timestamp (3) with time zone,
	"failed_at" timestamp (3) with time zone,
	"retry_count" varchar(10) DEFAULT '0',
	"last_retry_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules_history" ADD CONSTRAINT "alert_rules_history_alert_rule_id_alert_rules_id_fk" FOREIGN KEY ("alert_rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules_history" ADD CONSTRAINT "alert_rules_history_changed_by_profiles_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_alert_rule_id_alert_rules_id_fk" FOREIGN KEY ("alert_rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledged_by_profiles_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_resolved_by_profiles_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_logs" ADD CONSTRAINT "event_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_logs" ADD CONSTRAINT "event_logs_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_records" ADD CONSTRAINT "calibration_records_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lora_sensors" ADD CONSTRAINT "lora_sensors_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_sessions" ADD CONSTRAINT "pairing_sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hubs" ADD CONSTRAINT "hubs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalation_contacts" ADD CONSTRAINT "escalation_contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalation_contacts" ADD CONSTRAINT "escalation_contacts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "door_events" ADD CONSTRAINT "door_events_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "door_events" ADD CONSTRAINT "door_events_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_temperature_logs" ADD CONSTRAINT "manual_temperature_logs_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_temperature_logs" ADD CONSTRAINT "manual_temperature_logs_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensor_readings" ADD CONSTRAINT "sensor_readings_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensor_readings" ADD CONSTRAINT "sensor_readings_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alert_rules_org_idx" ON "alert_rules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "alert_rules_site_idx" ON "alert_rules" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "alert_rules_unit_idx" ON "alert_rules" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "alert_rules_enabled_idx" ON "alert_rules" USING btree ("organization_id","is_enabled");--> statement-breakpoint
CREATE INDEX "alert_rules_history_rule_idx" ON "alert_rules_history" USING btree ("alert_rule_id");--> statement-breakpoint
CREATE INDEX "alert_rules_history_date_idx" ON "alert_rules_history" USING btree ("changed_at");--> statement-breakpoint
CREATE INDEX "alerts_unit_idx" ON "alerts" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "alerts_status_idx" ON "alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "alerts_type_idx" ON "alerts" USING btree ("alert_type");--> statement-breakpoint
CREATE INDEX "alerts_triggered_idx" ON "alerts" USING btree ("triggered_at");--> statement-breakpoint
CREATE INDEX "alerts_unit_status_idx" ON "alerts" USING btree ("unit_id","status");--> statement-breakpoint
CREATE INDEX "corrective_actions_alert_idx" ON "corrective_actions" USING btree ("alert_id");--> statement-breakpoint
CREATE INDEX "corrective_actions_unit_idx" ON "corrective_actions" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "corrective_actions_profile_idx" ON "corrective_actions" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "corrective_actions_date_idx" ON "corrective_actions" USING btree ("action_at");--> statement-breakpoint
CREATE INDEX "event_logs_org_idx" ON "event_logs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "event_logs_actor_idx" ON "event_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "event_logs_type_idx" ON "event_logs" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "event_logs_entity_idx" ON "event_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "event_logs_occurred_idx" ON "event_logs" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "event_logs_org_date_idx" ON "event_logs" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "event_logs_hash_idx" ON "event_logs" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "calibration_records_device_idx" ON "calibration_records" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "calibration_records_date_idx" ON "calibration_records" USING btree ("device_id","calibrated_at");--> statement-breakpoint
CREATE INDEX "calibration_records_expires_idx" ON "calibration_records" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_eui_idx" ON "devices" USING btree ("device_eui");--> statement-breakpoint
CREATE INDEX "devices_unit_idx" ON "devices" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "devices_hub_idx" ON "devices" USING btree ("hub_id");--> statement-breakpoint
CREATE INDEX "devices_status_idx" ON "devices" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "lora_sensors_device_idx" ON "lora_sensors" USING btree ("device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lora_sensors_dev_eui_idx" ON "lora_sensors" USING btree ("dev_eui");--> statement-breakpoint
CREATE INDEX "lora_sensors_app_eui_idx" ON "lora_sensors" USING btree ("app_eui");--> statement-breakpoint
CREATE INDEX "pairing_sessions_device_idx" ON "pairing_sessions" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "pairing_sessions_status_idx" ON "pairing_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pairing_sessions_code_idx" ON "pairing_sessions" USING btree ("pairing_code");--> statement-breakpoint
CREATE INDEX "areas_site_idx" ON "areas" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "areas_sort_idx" ON "areas" USING btree ("site_id","sort_order");--> statement-breakpoint
CREATE INDEX "hubs_site_idx" ON "hubs" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hubs_mac_idx" ON "hubs" USING btree ("mac_address");--> statement-breakpoint
CREATE INDEX "sites_org_idx" ON "sites" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "sites_active_idx" ON "sites" USING btree ("organization_id","is_active");--> statement-breakpoint
CREATE INDEX "units_area_idx" ON "units" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "units_status_idx" ON "units" USING btree ("status");--> statement-breakpoint
CREATE INDEX "units_type_idx" ON "units" USING btree ("unit_type");--> statement-breakpoint
CREATE INDEX "units_active_idx" ON "units" USING btree ("area_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_idx" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "subscriptions_org_idx" ON "subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "subscriptions_stripe_customer_idx" ON "subscriptions" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "escalation_contacts_org_idx" ON "escalation_contacts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "escalation_contacts_profile_idx" ON "escalation_contacts" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "escalation_contacts_priority_idx" ON "escalation_contacts" USING btree ("organization_id","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_user_id_idx" ON "profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "profiles_org_idx" ON "profiles" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "profiles_email_idx" ON "profiles" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_user_org_idx" ON "user_roles" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX "user_roles_org_idx" ON "user_roles" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "door_events_unit_time_idx" ON "door_events" USING btree ("unit_id","timestamp");--> statement-breakpoint
CREATE INDEX "door_events_device_idx" ON "door_events" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "door_events_timestamp_idx" ON "door_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "manual_logs_unit_time_idx" ON "manual_temperature_logs" USING btree ("unit_id","recorded_at");--> statement-breakpoint
CREATE INDEX "manual_logs_profile_idx" ON "manual_temperature_logs" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "manual_logs_recorded_idx" ON "manual_temperature_logs" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX "sensor_readings_unit_time_idx" ON "sensor_readings" USING btree ("unit_id","recorded_at");--> statement-breakpoint
CREATE INDEX "sensor_readings_device_idx" ON "sensor_readings" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "sensor_readings_recorded_idx" ON "sensor_readings" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_alert_idx" ON "notification_deliveries" USING btree ("alert_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_profile_idx" ON "notification_deliveries" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_status_idx" ON "notification_deliveries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notification_deliveries_channel_idx" ON "notification_deliveries" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "notification_deliveries_scheduled_idx" ON "notification_deliveries" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_pending_idx" ON "notification_deliveries" USING btree ("status","scheduled_at");