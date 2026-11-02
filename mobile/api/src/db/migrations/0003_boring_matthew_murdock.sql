CREATE TABLE "production_entry" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"process_id" integer NOT NULL,
	"machine_id" integer NOT NULL,
	"worker_name" varchar(255) NOT NULL,
	"shift_start_time" timestamp NOT NULL,
	"shift_end_time" timestamp NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"units_produced" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "production_entry" ADD CONSTRAINT "production_entry_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_entry" ADD CONSTRAINT "production_entry_process_id_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_entry" ADD CONSTRAINT "production_entry_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;