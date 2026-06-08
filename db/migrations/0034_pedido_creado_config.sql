ALTER TABLE "whatsapp_config" ADD COLUMN IF NOT EXISTS "pedido_creado_enabled" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "whatsapp_config" ADD COLUMN IF NOT EXISTS "pedido_creado_template_name" text;--> statement-breakpoint
ALTER TABLE "whatsapp_config" ADD COLUMN IF NOT EXISTS "pedido_creado_template_lang" text;
