ALTER TABLE "processes" ADD COLUMN "standard_rate_per_hour" integer;--> statement-breakpoint
ALTER TABLE "production_entry" ADD COLUMN "rejected_units" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "production_entry" ADD COLUMN "downtime_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "production_entry" ADD COLUMN "downtime_reason" text;