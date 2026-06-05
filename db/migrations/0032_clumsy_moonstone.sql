ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "geocode_status" text;--> statement-breakpoint
ALTER TABLE "empresa_config" ADD COLUMN IF NOT EXISTS "localidad" text;--> statement-breakpoint
ALTER TABLE "empresa_config" ADD COLUMN IF NOT EXISTS "provincia" text;