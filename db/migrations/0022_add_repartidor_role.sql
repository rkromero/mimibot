ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'repartidor';--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "entregado_at" timestamptz;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "entregado_por" uuid REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "firma_url" text;
