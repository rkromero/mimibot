-- Control > Proveedores: ABM de proveedores; el gasto pasa de proveedor texto
-- libre a una referencia al listado. Los valores ya tipeados se migran.
CREATE TABLE IF NOT EXISTS "proveedores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nombre" text NOT NULL,
  "cuit" text,
  "telefono" text,
  "email" text,
  "direccion" text,
  "notas" text,
  "activo" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "proveedores_nombre_idx" ON "proveedores" ("nombre");
--> statement-breakpoint
ALTER TABLE "gastos" ADD COLUMN IF NOT EXISTS "proveedor_id" uuid REFERENCES "proveedores"("id");
--> statement-breakpoint
-- Migrar los proveedores tipeados como texto libre en gastos existentes
INSERT INTO "proveedores" ("nombre")
SELECT DISTINCT btrim("proveedor") FROM "gastos"
WHERE "proveedor" IS NOT NULL AND btrim("proveedor") <> ''
ON CONFLICT ("nombre") DO NOTHING;
--> statement-breakpoint
UPDATE "gastos" g
SET "proveedor_id" = p."id"
FROM "proveedores" p
WHERE g."proveedor_id" IS NULL
  AND g."proveedor" IS NOT NULL
  AND btrim(g."proveedor") = p."nombre";
--> statement-breakpoint
ALTER TABLE "gastos" DROP COLUMN IF EXISTS "proveedor";
