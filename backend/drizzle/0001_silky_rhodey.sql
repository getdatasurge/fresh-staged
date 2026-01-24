CREATE TYPE "public"."gateway_status" AS ENUM('online', 'offline', 'disconnected', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."temp_unit" AS ENUM('F', 'C');--> statement-breakpoint
CREATE TABLE "gateways" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ttn_connection_id" uuid NOT NULL,
	"site_id" uuid,
	"gateway_id" varchar(36) NOT NULL,
	"gateway_eui" varchar(16) NOT NULL,
	"name" varchar(256),
	"description" text,
	"frequency_plan_id" varchar(64),
	"status" "gateway_status" DEFAULT 'unknown' NOT NULL,
	"latitude" varchar(32),
	"longitude" varchar(32),
	"altitude" integer,
	"last_seen_at" timestamp (3) with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"telnyx_api_key" varchar(512) NOT NULL,
	"telnyx_phone_number" varchar(32) NOT NULL,
	"telnyx_messaging_profile_id" varchar(256),
	"is_enabled" boolean DEFAULT true NOT NULL,
	"last_test_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ttn_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"application_id" varchar(256),
	"webhook_secret" varchar(256) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "units" ALTER COLUMN "temp_unit" SET DATA TYPE temp_unit;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "digest_daily" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "digest_weekly" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "timezone" varchar(64) DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "gateways" ADD CONSTRAINT "gateways_ttn_connection_id_ttn_connections_id_fk" FOREIGN KEY ("ttn_connection_id") REFERENCES "public"."ttn_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateways" ADD CONSTRAINT "gateways_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_configs" ADD CONSTRAINT "sms_configs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ttn_connections" ADD CONSTRAINT "ttn_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gateways_ttn_connection_idx" ON "gateways" USING btree ("ttn_connection_id");--> statement-breakpoint
CREATE INDEX "gateways_site_idx" ON "gateways" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gateways_gateway_id_idx" ON "gateways" USING btree ("gateway_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gateways_gateway_eui_idx" ON "gateways" USING btree ("gateway_eui");--> statement-breakpoint
CREATE INDEX "sms_configs_org_idx" ON "sms_configs" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sms_configs_org_unique_idx" ON "sms_configs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ttn_connections_org_idx" ON "ttn_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ttn_connections_webhook_secret_idx" ON "ttn_connections" USING btree ("webhook_secret");