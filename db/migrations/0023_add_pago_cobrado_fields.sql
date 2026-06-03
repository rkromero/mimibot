ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "pago_cobrado_por" uuid REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "pago_cobrado_at" timestamptz;
