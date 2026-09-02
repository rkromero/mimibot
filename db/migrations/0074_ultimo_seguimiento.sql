-- Botón "Último seguimiento" del panel del lead: manda la plantilla aprobada
-- configurada y, si nadie contesta en N horas (contadas dentro del horario
-- permitido de seguimientos), el lead pasa a Perdido con "Dejó de responder".
-- Las frases de respuestas automáticas de negocios ("estamos cerrados, te
-- contestamos a la brevedad") no cuentan como respuesta. Aditiva e idempotente.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "ultimo_seguimiento_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "follow_up_config" ADD COLUMN IF NOT EXISTS "ultimo_seguimiento_template_name" text;
--> statement-breakpoint
ALTER TABLE "follow_up_config" ADD COLUMN IF NOT EXISTS "ultimo_seguimiento_template_lang" text;
--> statement-breakpoint
ALTER TABLE "follow_up_config" ADD COLUMN IF NOT EXISTS "ultimo_seguimiento_horas" integer NOT NULL DEFAULT 10;
--> statement-breakpoint
ALTER TABLE "follow_up_config" ADD COLUMN IF NOT EXISTS "respuestas_automaticas_frases" text[] NOT NULL DEFAULT '{}';
