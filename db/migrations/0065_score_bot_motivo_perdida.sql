-- Score del bot guardado en el lead (para priorizar A/B/C) y motivo de pérdida.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "bot_score" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "bot_grado" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "perdido_at" timestamp;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "motivo_perdida" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "motivo_perdida_detalle" text;--> statement-breakpoint
-- Leads ya cerrados como perdidos: fecha de cierre = última modificación (mejor proxy disponible)
UPDATE "leads" l SET "perdido_at" = l."updated_at"
FROM "pipeline_stages" s
WHERE s."id" = l."stage_id" AND s."is_terminal" = true AND s."is_won" = false AND l."perdido_at" IS NULL;
