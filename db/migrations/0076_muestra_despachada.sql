-- Aviso al cliente de que salió la muestra CDA, con la foto de la guía de envío
-- (remito firmado que sube fábrica al despacharla por expreso) como encabezado
-- de una plantilla de WhatsApp. Aditiva e idempotente.
--
-- leads.muestra_avisada_at: cuándo se mandó el aviso (null = pendiente). Las
-- muestras entregadas antes de esta migración se marcan como avisadas para
-- que no aparezcan todas como pendientes el primer día.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "muestra_avisada_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "leads" SET "muestra_avisada_at" = "muestra_entregada_at" WHERE "muestra_entregada_at" IS NOT NULL AND "muestra_avisada_at" IS NULL;
--> statement-breakpoint
-- Formato del encabezado de la plantilla según Meta (TEXT / IMAGE / DOCUMENT / VIDEO;
-- null = sin encabezado). Se completa al sincronizar contra la WABA.
ALTER TABLE "whatsapp_templates" ADD COLUMN IF NOT EXISTS "header_format" text;
--> statement-breakpoint
ALTER TABLE "whatsapp_config" ADD COLUMN IF NOT EXISTS "muestra_template_name" text;
--> statement-breakpoint
ALTER TABLE "whatsapp_config" ADD COLUMN IF NOT EXISTS "muestra_template_lang" text;
--> statement-breakpoint
ALTER TABLE "whatsapp_config" ADD COLUMN IF NOT EXISTS "muestra_auto" boolean NOT NULL DEFAULT false;
