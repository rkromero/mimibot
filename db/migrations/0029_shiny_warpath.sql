CREATE TABLE "whatsapp_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meta_template_id" text,
	"name" text NOT NULL,
	"language" text NOT NULL,
	"category" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"body_text" text NOT NULL,
	"header_text" text,
	"footer_text" text,
	"buttons" jsonb DEFAULT '[]' NOT NULL,
	"rejected_reason" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"synced_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "whatsapp_config" ADD COLUMN "waba_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_templates_name_language_idx" ON "whatsapp_templates" USING btree ("name","language");