-- FASE 1D — Producto enlazado a receta (aditiva e idempotente).
-- productos.costo se mantiene tal cual (no se borra); receta_id habilita el
-- costo calculado desde la receta, y costo_calculado/costo_actualizado_at
-- persisten el último recálculo.
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "receta_id" uuid;
--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "margen_pct" numeric(5, 2);
--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "costo_calculado" numeric(12, 2);
--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "costo_actualizado_at" timestamp;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "productos" ADD CONSTRAINT "productos_receta_id_recetas_id_fk" FOREIGN KEY ("receta_id") REFERENCES "public"."recetas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "productos_receta_idx" ON "productos" USING btree ("receta_id");
