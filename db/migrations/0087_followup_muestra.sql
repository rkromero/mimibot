ALTER TABLE "follow_up_config" ADD COLUMN IF NOT EXISTS "muestra_seguimiento_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "follow_up_config" ADD COLUMN IF NOT EXISTS "muestra_seguimiento_dias" integer DEFAULT 5 NOT NULL;
--> statement-breakpoint
ALTER TABLE "follow_up_config" ADD COLUMN IF NOT EXISTS "muestra_seguimiento_template_name" text;
--> statement-breakpoint
ALTER TABLE "follow_up_config" ADD COLUMN IF NOT EXISTS "muestra_seguimiento_template_lang" text;
