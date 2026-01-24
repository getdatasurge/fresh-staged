CREATE TABLE "reading_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"period_start" timestamp (3) with time zone NOT NULL,
	"period_end" timestamp (3) with time zone NOT NULL,
	"granularity" varchar(16) NOT NULL,
	"temp_min" numeric(7, 2) NOT NULL,
	"temp_max" numeric(7, 2) NOT NULL,
	"temp_avg" numeric(7, 2) NOT NULL,
	"temp_sum" numeric(12, 2) NOT NULL,
	"humidity_min" numeric(5, 2),
	"humidity_max" numeric(5, 2),
	"humidity_avg" numeric(5, 2),
	"reading_count" integer DEFAULT 0 NOT NULL,
	"anomaly_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reading_metrics" ADD CONSTRAINT "reading_metrics_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reading_metrics_unit_period_idx" ON "reading_metrics" USING btree ("unit_id","period_start","granularity");--> statement-breakpoint
CREATE INDEX "reading_metrics_granularity_idx" ON "reading_metrics" USING btree ("granularity","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "reading_metrics_unique_period" ON "reading_metrics" USING btree ("unit_id","period_start","granularity");
