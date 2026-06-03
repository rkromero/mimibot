ALTER TYPE "public"."metodo_pago" ADD VALUE IF NOT EXISTS 'mercadopago';--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "mp_preference_id" text;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "mp_payment_id" text;
