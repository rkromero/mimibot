--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."metodo_entrega" AS ENUM ('retiro_fabrica', 'expreso');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "expreso_nombre" text;
--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "expreso_direccion" text;
--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "metodo_entrega" "metodo_entrega";
--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "expreso_nombre" text;
--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "expreso_direccion" text;
