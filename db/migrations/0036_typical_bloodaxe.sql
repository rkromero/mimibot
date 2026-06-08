ALTER TABLE "whatsapp_config" ADD COLUMN IF NOT EXISTS "apertura_template_name" text;--> statement-breakpoint
ALTER TABLE "whatsapp_config" ADD COLUMN IF NOT EXISTS "apertura_template_lang" text;--> statement-breakpoint
ALTER TABLE "whatsapp_config" ADD COLUMN IF NOT EXISTS "pedido_creado_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_config" ADD COLUMN IF NOT EXISTS "pedido_creado_template_name" text;--> statement-breakpoint
ALTER TABLE "whatsapp_config" ADD COLUMN IF NOT EXISTS "pedido_creado_template_lang" text;--> statement-breakpoint
ALTER TABLE "whatsapp_templates" ADD COLUMN IF NOT EXISTS "variables" jsonb DEFAULT '[]' NOT NULL;
