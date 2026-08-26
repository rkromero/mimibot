-- Seguimiento de leads en Nuevo que dejan de responder al bot (indagación):
-- primer seguimiento a N horas, mensaje final a M horas del último mensaje de
-- la persona, cierre en Perdido a K horas. Horario bloqueado configurable.
ALTER TABLE "follow_up_config" ADD COLUMN IF NOT EXISTS "indagacion_enabled" boolean NOT NULL DEFAULT true;--> statement-breakpoint
ALTER TABLE "follow_up_config" ADD COLUMN IF NOT EXISTS "indagacion_horas" integer NOT NULL DEFAULT 2;--> statement-breakpoint
ALTER TABLE "follow_up_config" ADD COLUMN IF NOT EXISTS "indagacion_final_horas" integer NOT NULL DEFAULT 23;--> statement-breakpoint
ALTER TABLE "follow_up_config" ADD COLUMN IF NOT EXISTS "indagacion_cierre_horas" integer NOT NULL DEFAULT 24;--> statement-breakpoint
ALTER TABLE "follow_up_config" ADD COLUMN IF NOT EXISTS "horario_desde" integer NOT NULL DEFAULT 8;--> statement-breakpoint
ALTER TABLE "follow_up_config" ADD COLUMN IF NOT EXISTS "horario_hasta" integer NOT NULL DEFAULT 22;--> statement-breakpoint
ALTER TABLE "follow_up_config" ADD COLUMN IF NOT EXISTS "indagacion_mensaje_final" text;--> statement-breakpoint
ALTER TABLE "follow_up_config" ADD COLUMN IF NOT EXISTS "indagacion_mensaje_retomar" text;
