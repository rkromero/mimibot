ALTER TABLE "bot_config" ADD COLUMN IF NOT EXISTS "post_propuesta_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "bot_config" ADD COLUMN IF NOT EXISTS "post_propuesta_prompt" text;
--> statement-breakpoint
ALTER TABLE "bot_config" ADD COLUMN IF NOT EXISTS "post_propuesta_max_turns" integer DEFAULT 12 NOT NULL;
--> statement-breakpoint
ALTER TABLE "bot_config" ADD COLUMN IF NOT EXISTS "conocimiento_bot" text;
--> statement-breakpoint
ALTER TABLE "bot_config" ADD COLUMN IF NOT EXISTS "retiro_fabrica_info" text;
