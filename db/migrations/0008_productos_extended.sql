-- Migration 0008: Extend productos with commercial and stock fields

-- Create enum type for unidad_venta
DO $$ BEGIN
  CREATE TYPE "unidad_venta" AS ENUM('unidad', 'caja_12', 'caja_24', 'display');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add new columns to productos
ALTER TABLE "productos"
  ADD COLUMN IF NOT EXISTS "sku" text,
  ADD COLUMN IF NOT EXISTS "categoria" text,
  ADD COLUMN IF NOT EXISTS "imagen_url" text,
  ADD COLUMN IF NOT EXISTS "costo" numeric(12,2),
  ADD COLUMN IF NOT EXISTS "unidad_venta" "unidad_venta" NOT NULL DEFAULT 'unidad',
  ADD COLUMN IF NOT EXISTS "peso_g" integer,
  ADD COLUMN IF NOT EXISTS "iva_pct" numeric(5,2) NOT NULL DEFAULT 21.00,
  ADD COLUMN IF NOT EXISTS "stock_minimo" integer NOT NULL DEFAULT 0;

-- Auto-generate SKU for existing products that don't have one
DO $$
DECLARE
  r RECORD;
  counter INTEGER := 1;
BEGIN
  FOR r IN SELECT id FROM "productos" WHERE sku IS NULL ORDER BY created_at LOOP
    UPDATE "productos" SET sku = 'MIM-' || LPAD(counter::TEXT, 3, '0') WHERE id = r.id;
    counter := counter + 1;
  END LOOP;
END $$;

-- Add unique index on sku (allows NULL but enforces uniqueness for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS "productos_sku_idx" ON "productos" ("sku");
