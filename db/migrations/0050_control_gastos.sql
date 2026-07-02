-- Módulo Control > Gastos: registro de gastos con categorías tipificadas
-- (costo directo = materia prima / packaging; gasto operativo = estructura).
DO $$ BEGIN
  CREATE TYPE "tipo_categoria_gasto" AS ENUM ('costo_directo', 'gasto_operativo');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gasto_categorias" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nombre" text NOT NULL,
  "tipo" "tipo_categoria_gasto" DEFAULT 'gasto_operativo' NOT NULL,
  "activo" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gasto_categorias_nombre_idx" ON "gasto_categorias" ("nombre");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gastos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "fecha" timestamp NOT NULL,
  "categoria_id" uuid NOT NULL REFERENCES "gasto_categorias"("id"),
  "monto" numeric(12, 2) NOT NULL,
  "descripcion" text,
  "proveedor" text,
  "comprobante" text,
  "metodo_pago" "metodo_pago",
  "registrado_por" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gastos_fecha_idx" ON "gastos" ("fecha");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gastos_categoria_idx" ON "gastos" ("categoria_id");
--> statement-breakpoint
-- Categorías iniciales (el admin puede crear más desde la app)
INSERT INTO "gasto_categorias" ("nombre", "tipo") VALUES
  ('Materia Prima', 'costo_directo'),
  ('Packaging', 'costo_directo'),
  ('Sueldos', 'gasto_operativo'),
  ('Alquiler', 'gasto_operativo'),
  ('Servicios (Luz/Gas/Agua)', 'gasto_operativo'),
  ('Librería', 'gasto_operativo'),
  ('Logística', 'gasto_operativo'),
  ('Mantenimiento', 'gasto_operativo'),
  ('Impuestos', 'gasto_operativo'),
  ('Otros', 'gasto_operativo')
ON CONFLICT ("nombre") DO NOTHING;
