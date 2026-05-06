ALTER TYPE "public"."activity_action" ADD VALUE 'follow_up_scheduled';--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE 'follow_up_sent';--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE 'follow_up_cancelled';--> statement-breakpoint
CREATE TYPE "public"."follow_up_status" AS ENUM('pending', 'sent', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."follow_up_scenario" AS ENUM('no_response', 'stalling', 'manual');--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "next_follow_up_at" timestamp;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "follow_up_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "follow_up_status" "follow_up_status";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "follow_up_reason" text;--> statement-breakpoint
CREATE TABLE "follow_up_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"template_name" text NOT NULL,
	"language" text DEFAULT 'es' NOT NULL,
	"scenario" "follow_up_scenario" DEFAULT 'no_response' NOT NULL,
	"body_preview" text DEFAULT '' NOT NULL,
	"parameters" jsonb DEFAULT '[]' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_up_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"no_response_hours" integer DEFAULT 24 NOT NULL,
	"stalling_delay_minutes" integer DEFAULT 60 NOT NULL,
	"max_follow_ups" integer DEFAULT 3 NOT NULL,
	"retry_hours" jsonb DEFAULT '[1, 22, 72]' NOT NULL,
	"stalling_phrases" text[] DEFAULT '{}' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "follow_up_config" ADD CONSTRAINT "follow_up_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_follow_up_idx" ON "leads" ("next_follow_up_at","follow_up_status");
