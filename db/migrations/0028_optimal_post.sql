CREATE TYPE "public"."assignment_rule" AS ENUM('fixed', 'random', 'weighted', 'round_robin');--> statement-breakpoint
CREATE TABLE "assignment_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"rule" "assignment_rule" DEFAULT 'round_robin' NOT NULL,
	"fixed_agent_id" uuid,
	"weights" jsonb DEFAULT '[]' NOT NULL,
	"round_robin_pointer" integer DEFAULT 0 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assignment_config" ADD CONSTRAINT "assignment_config_fixed_agent_id_users_id_fk" FOREIGN KEY ("fixed_agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_config" ADD CONSTRAINT "assignment_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
