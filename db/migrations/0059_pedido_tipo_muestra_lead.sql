CREATE TYPE "public"."tipo_pedido" AS ENUM('venta', 'muestra');--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "muestra_entregada_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "tipo" "tipo_pedido" DEFAULT 'venta' NOT NULL;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "lead_id" uuid;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pedidos_lead_idx" ON "pedidos" USING btree ("lead_id");
--> statement-breakpoint
-- Backfill: las muestras CDA cargadas antes de esta migración se identificaban
-- solo por la observación generada por el botón del lead. Las marcamos como
-- tipo = muestra y les asignamos el lead a través del cliente vinculado.
UPDATE "pedidos" p
SET "tipo" = 'muestra', "lead_id" = c."lead_id"
FROM "clientes" c
WHERE p."cliente_id" = c."id"
  AND p."tipo" = 'venta'
  AND p."observaciones" LIKE 'Muestra CDA — generado desde el lead%';--> statement-breakpoint
-- Muestras ya entregadas antes de esta migración: dejar la fecha en el lead
-- (sin nota ni cambio de etapa retroactivos).
UPDATE "leads" l
SET "muestra_entregada_at" = p."entregado_at"
FROM "pedidos" p
WHERE p."lead_id" = l."id"
  AND p."tipo" = 'muestra'
  AND p."estado" = 'entregado'
  AND p."deleted_at" IS NULL
  AND l."muestra_entregada_at" IS NULL;
