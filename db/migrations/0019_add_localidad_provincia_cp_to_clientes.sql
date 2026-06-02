ALTER TABLE "clientes" ADD COLUMN "localidad" text;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "provincia" text;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "codigo_postal" text;--> statement-breakpoint
ALTER TABLE "metas" ADD COLUMN "pct_cobranza_objetivo" numeric(5, 2) DEFAULT '0' NOT NULL;