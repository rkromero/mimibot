-- Migration 0009: Stock movements table + business_config alert fields

-- Create enum type for stock movement types
DO $$ BEGIN
  CREATE TYPE "tipo_stock_movement" AS ENUM('entrada', 'salida', 'ajuste', 'reserva', 'cancelacion_reserva');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create stock_movements table
CREATE TABLE IF NOT EXISTS "stock_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "producto_id" uuid NOT NULL REFERENCES "productos"("id"),
  "tipo" "tipo_stock_movement" NOT NULL,
  "cantidad" integer NOT NULL,
  "saldo_resultante" integer NOT NULL,
  "pedido_id" uuid REFERENCES "pedidos"("id"),
  "referencia" text,
  "notas" text,
  "registrado_por" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "stock_movements_producto_idx" ON "stock_movements" ("producto_id", "created_at");
CREATE INDEX IF NOT EXISTS "stock_movements_pedido_idx" ON "stock_movements" ("pedido_id");

-- Add alert configuration fields to business_config
ALTER TABLE "business_config"
  ADD COLUMN IF NOT EXISTS "alerta_lead_horas" integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS "alerta_meta_dia" integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS "alerta_meta_pct" numeric(5,2) NOT NULL DEFAULT 0.50;
