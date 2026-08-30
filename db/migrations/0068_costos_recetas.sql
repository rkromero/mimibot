-- FASE 1A — Schema de costos (solo DB, sin cambiar comportamiento).
-- Aditiva e idempotente: puede re-ejecutarse sin efecto (IF NOT EXISTS / guards).
--   1) insumo_precios: histórico de precios (insumos.precio queda como vigente
--      denormalizado).
--   2) recetas: nombre / cliente_id / es_cotizador / bobina / caja /
--      alfajores_por_caja / margen_pct. El UNIQUE global de gramaje se
--      reemplaza por un único PARCIAL entre recetas activas del cotizador.
--   3) receta_items.cantidad, backfilleada desde gramos (gramos NO se toca).
CREATE TABLE IF NOT EXISTS "insumo_precios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"insumo_id" uuid NOT NULL,
	"precio" numeric(12, 2) NOT NULL,
	"vigente_desde" timestamp DEFAULT now() NOT NULL,
	"registrado_por" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "insumo_precios" ADD CONSTRAINT "insumo_precios_insumo_id_insumos_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "insumo_precios" ADD CONSTRAINT "insumo_precios_registrado_por_users_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "insumo_precios_insumo_vigente_idx" ON "insumo_precios" USING btree ("insumo_id", "vigente_desde" DESC);
--> statement-breakpoint
-- recetas: columnas nuevas, nullable primero (NOT NULL recién tras el backfill)
ALTER TABLE "recetas" ADD COLUMN IF NOT EXISTS "nombre" text;
--> statement-breakpoint
ALTER TABLE "recetas" ADD COLUMN IF NOT EXISTS "cliente_id" uuid;
--> statement-breakpoint
ALTER TABLE "recetas" ADD COLUMN IF NOT EXISTS "es_cotizador" boolean;
--> statement-breakpoint
ALTER TABLE "recetas" ADD COLUMN IF NOT EXISTS "bobina_insumo_id" uuid;
--> statement-breakpoint
ALTER TABLE "recetas" ADD COLUMN IF NOT EXISTS "caja_insumo_id" uuid;
--> statement-breakpoint
ALTER TABLE "recetas" ADD COLUMN IF NOT EXISTS "alfajores_por_caja" integer;
--> statement-breakpoint
ALTER TABLE "recetas" ADD COLUMN IF NOT EXISTS "margen_pct" numeric(5, 2);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "recetas" ADD CONSTRAINT "recetas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "recetas" ADD CONSTRAINT "recetas_bobina_insumo_id_insumos_id_fk" FOREIGN KEY ("bobina_insumo_id") REFERENCES "public"."insumos"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "recetas" ADD CONSTRAINT "recetas_caja_insumo_id_insumos_id_fk" FOREIGN KEY ("caja_insumo_id") REFERENCES "public"."insumos"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "receta_items" ADD COLUMN IF NOT EXISTS "cantidad" numeric(12, 4);
--> statement-breakpoint
-- Backfill: hoy TODAS las recetas existentes son del cotizador.
UPDATE "recetas" SET "nombre" = 'Alfajor ' || "gramaje" || 'g' WHERE "nombre" IS NULL;
--> statement-breakpoint
UPDATE "recetas" SET "es_cotizador" = true WHERE "es_cotizador" IS NULL;
--> statement-breakpoint
UPDATE "receta_items" SET "cantidad" = "gramos" WHERE "cantidad" IS NULL;
--> statement-breakpoint
-- NOT NULL recién después del backfill.
ALTER TABLE "recetas" ALTER COLUMN "nombre" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "recetas" ALTER COLUMN "es_cotizador" SET DEFAULT false;
--> statement-breakpoint
ALTER TABLE "recetas" ALTER COLUMN "es_cotizador" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recetas_cliente_idx" ON "recetas" USING btree ("cliente_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recetas_es_cotizador_idx" ON "recetas" USING btree ("es_cotizador");
--> statement-breakpoint
-- Una receta del cotizador nunca pertenece a un cliente.
DO $$ BEGIN
	ALTER TABLE "recetas" ADD CONSTRAINT "recetas_cotizador_sin_cliente_check" CHECK (NOT ("es_cotizador" AND "cliente_id" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
-- Único PARCIAL que reemplaza al UNIQUE global de gramaje: solo entre recetas
-- activas del cotizador. drizzle-kit no genera únicos parciales, se crea con
-- SQL crudo — mismo criterio que clientes_cuit_unique_idx (migración 0048).
-- Si hubiera gramajes duplicados, ABORTA con la lista para resolverlos primero.
DO $$
DECLARE
	duplicados text;
BEGIN
	SELECT string_agg(d."gramaje"::text || ' g (' || d.cnt || ' recetas)', ', ' ORDER BY d."gramaje")
		INTO duplicados
	FROM (
		SELECT "gramaje", count(*) AS cnt
		FROM "recetas"
		WHERE "activo" = true AND "es_cotizador" = true
		GROUP BY "gramaje"
		HAVING count(*) > 1
	) d;

	IF duplicados IS NOT NULL THEN
		RAISE EXCEPTION 'Migración 0068 abortada: gramajes duplicados entre recetas activas del cotizador: %. Resolver los duplicados y re-ejecutar.', duplicados;
	END IF;

	CREATE UNIQUE INDEX IF NOT EXISTS "recetas_gramaje_cotizador_unique_idx"
		ON "recetas" ("gramaje")
		WHERE "es_cotizador" = true AND "activo" = true;
END $$;
--> statement-breakpoint
-- Recién con el único parcial creado se suelta el UNIQUE global viejo.
ALTER TABLE "recetas" DROP CONSTRAINT IF EXISTS "recetas_gramaje_unique";
