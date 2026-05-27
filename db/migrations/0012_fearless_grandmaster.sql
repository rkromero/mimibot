ALTER TABLE "metas" ADD COLUMN IF NOT EXISTS "pct_clientes_con_pedido_objetivo" numeric(5, 2) DEFAULT '0' NOT NULL;
