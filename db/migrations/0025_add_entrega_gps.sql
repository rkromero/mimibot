ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "entrega_lat" double precision;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "entrega_lng" double precision;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "entrega_precision_m" double precision;
