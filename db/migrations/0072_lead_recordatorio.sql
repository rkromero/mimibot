-- Recordatorio de llamada del lead (uno por lead): día en que hay que volver
-- a hablarle (fecha calendario de Argentina, sin hora), nota corta y quién
-- lo puso. Lo usan el botón "Recordar" del panel del lead, el chip del
-- kanban y el inbox, el filtro "Para llamar hoy" del pipeline, la tarjeta de
-- Mi día y el popup al abrir el sistema. Aditiva e idempotente.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "recordatorio_at" date;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "recordatorio_nota" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "recordatorio_por" uuid REFERENCES "users"("id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_recordatorio_idx" ON "leads" ("recordatorio_at") WHERE "recordatorio_at" IS NOT NULL;
