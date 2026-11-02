CREATE TABLE "product_process_mapping" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"process_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "processes" DROP CONSTRAINT "processes_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "product_process_mapping" ADD CONSTRAINT "product_process_mapping_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_process_mapping" ADD CONSTRAINT "product_process_mapping_process_id_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processes" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "processes" DROP COLUMN "product_id";