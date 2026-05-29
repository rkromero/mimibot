CREATE TYPE "public"."metodo_entrega" AS ENUM('retiro_fabrica', 'expreso');--> statement-breakpoint
ALTER TYPE "public"."estado_pedido" ADD VALUE 'pendiente_aprobacion' BEFORE 'confirmado';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'vendedor';--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "expreso_nombre" text;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "expreso_direccion" text;--> statement-breakpoint
ALTER TABLE "metas" ADD COLUMN "pct_pedidos_pagados_objetivo" numeric(5, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "metodo_entrega" "metodo_entrega";--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "expreso_nombre" text;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "expreso_direccion" text;