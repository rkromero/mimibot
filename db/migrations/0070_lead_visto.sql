-- Bubble "Nuevo" del kanban (aditiva e idempotente): visto_at null = nadie
-- abrió todavía la tarjeta del lead; se marca al abrir el panel
-- (GET /api/leads/[id]).
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "visto_at" timestamp;
--> statement-breakpoint
-- Backfill: los leads existentes no son "nuevos" — el badge lo estrenan solo
-- los que entren después de este deploy.
UPDATE "leads" SET "visto_at" = now() WHERE "visto_at" IS NULL;
