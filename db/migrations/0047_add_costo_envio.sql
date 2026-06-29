ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "costo_envio" numeric(12, 2) DEFAULT '0' NOT NULL;
