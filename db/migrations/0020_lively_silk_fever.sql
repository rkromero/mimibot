ALTER TYPE "public"."estado_pedido" ADD VALUE IF NOT EXISTS 'en_reparto' BEFORE 'entregado';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'fabrica';