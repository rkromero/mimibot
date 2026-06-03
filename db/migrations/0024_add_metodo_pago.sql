DO $$ BEGIN
  CREATE TYPE "public"."metodo_pago" AS ENUM ('efectivo', 'transferencia');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
ALTER TABLE "movimientos_cc" ADD COLUMN IF NOT EXISTS "metodo_pago" "metodo_pago";
