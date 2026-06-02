ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "localidad" text;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "provincia" text;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "codigo_postal" text;--> statement-breakpoint
ALTER TABLE "metas" ADD COLUMN IF NOT EXISTS "pct_cobranza_objetivo" numeric(5, 2) DEFAULT '0' NOT NULL;
