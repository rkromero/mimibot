CREATE TABLE "whatsapp_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"phone_number_id" text DEFAULT '' NOT NULL,
	"access_token" text DEFAULT '' NOT NULL,
	"app_secret" text DEFAULT '' NOT NULL,
	"verify_token" text DEFAULT '' NOT NULL,
	"is_configured" boolean DEFAULT false NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_config" ADD CONSTRAINT "whatsapp_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
