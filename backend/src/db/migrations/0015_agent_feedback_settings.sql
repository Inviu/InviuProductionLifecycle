CREATE TABLE "agent_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule" varchar(40) NOT NULL,
	"scope" varchar(120) NOT NULL,
	"title" text NOT NULL,
	"action" varchar(20) NOT NULL,
	"metric_kind" varchar(40),
	"metric_key" varchar(120),
	"metric_label" varchar(120),
	"metric_before" text,
	"user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" varchar(60) PRIMARY KEY NOT NULL,
	"value" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
