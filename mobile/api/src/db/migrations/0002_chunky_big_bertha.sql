CREATE TABLE "machine_process_mapping" (
	"id" serial PRIMARY KEY NOT NULL,
	"process_id" integer NOT NULL,
	"machine_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "machines" DROP CONSTRAINT "machines_process_id_processes_id_fk";
--> statement-breakpoint
ALTER TABLE "machine_process_mapping" ADD CONSTRAINT "machine_process_mapping_process_id_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_process_mapping" ADD CONSTRAINT "machine_process_mapping_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machines" DROP COLUMN "process_id";