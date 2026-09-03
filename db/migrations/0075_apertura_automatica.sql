-- Plantilla de apertura automática a leads nuevos: al entrar un lead desde una
-- landing (o al crearlo a mano con el tilde marcado) se le manda la plantilla
-- de apertura configurada en Ajustes → WhatsApp, con el nombre del vendedor
-- que le asignó la regla. Aditiva e idempotente.
ALTER TABLE "whatsapp_config" ADD COLUMN IF NOT EXISTS "apertura_auto_leads" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "whatsapp_config" ADD COLUMN IF NOT EXISTS "apertura_nombre_default" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "apertura_enviada_at" timestamp with time zone;
