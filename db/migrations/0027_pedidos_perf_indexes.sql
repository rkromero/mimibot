CREATE INDEX IF NOT EXISTS "pedidos_estado_idx" ON "pedidos" ("estado") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pedidos_estado_entregado_at_idx" ON "pedidos" ("estado","entregado_at") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pedidos_entregado_por_idx" ON "pedidos" ("entregado_por");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pedidos_morosos_idx" ON "pedidos" ("fecha") WHERE "estado_pago" IN ('impago','parcial') AND "deleted_at" IS NULL;
