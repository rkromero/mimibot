-- Seguimiento automático después de enviar una propuesta.
-- Se programa a N horas del último mensaje del cliente (dentro de la ventana de
-- 24 hs, sale como texto libre); si la ventana está cerrada usa la plantilla de
-- respaldo configurada o deja una nota interna.
ALTER TABLE "follow_up_config" ADD COLUMN IF NOT EXISTS "propuesta_enabled" boolean NOT NULL DEFAULT true;--> statement-breakpoint
ALTER TABLE "follow_up_config" ADD COLUMN IF NOT EXISTS "propuesta_horas" integer NOT NULL DEFAULT 23;--> statement-breakpoint
ALTER TABLE "follow_up_config" ADD COLUMN IF NOT EXISTS "propuesta_mensaje" text;--> statement-breakpoint
ALTER TABLE "follow_up_config" ADD COLUMN IF NOT EXISTS "propuesta_template_name" text;--> statement-breakpoint
ALTER TABLE "follow_up_config" ADD COLUMN IF NOT EXISTS "propuesta_template_lang" text;
