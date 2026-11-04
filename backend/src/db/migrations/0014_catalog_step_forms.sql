ALTER TABLE "processes" ADD COLUMN "form_type" varchar(30) DEFAULT 'machining' NOT NULL;--> statement-breakpoint
ALTER TABLE "production_entry" ADD COLUMN "breakdown_start" timestamp;--> statement-breakpoint
ALTER TABLE "production_entry" ADD COLUMN "breakdown_end" timestamp;--> statement-breakpoint
ALTER TABLE "production_entry" ADD COLUMN "bits_changed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "production_entry" ADD COLUMN "units_inspected" integer;--> statement-breakpoint
ALTER TABLE "production_entry" ADD COLUMN "boxes" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "category" varchar(50);