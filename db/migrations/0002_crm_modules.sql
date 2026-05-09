-- CRM Modules: Clientes, Productos, Pedidos, Cuenta Corriente
-- Migration 0002

-- Add is_won to pipeline_stages
ALTER TABLE "pipeline_stages" ADD COLUMN "is_won" boolean NOT NULL DEFAULT false;

-- Mark cerrado-won stage as is_won
UPDATE "pipeline_stages" SET "is_won" = true WHERE "slug" = 'cerrado-won';

-- New enums
CREATE TYPE "origen_cliente" AS ENUM('manual', 'convertido_de_lead');
CREATE TYPE "estado_pedido" AS ENUM('pendiente', 'confirmado', 'entregado', 'cancelado');
CREATE TYPE "estado_pago_pedido" AS ENUM('impago', 'parcial', 'pagado');
CREATE TYPE "tipo_movimiento_cc" AS ENUM('debito', 'credito');

-- Clientes
CREATE TABLE "clientes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nombre" text NOT NULL,
  "apellido" text NOT NULL,
  "email" text,
  "telefono" text,
  "direccion" text,
  "cuit" text,
  "origen" "origen_cliente" NOT NULL DEFAULT 'manual',
  "lead_id" uuid REFERENCES "leads"("id"),
  "asignado_a" uuid REFERENCES "users"("id"),
  "creado_por" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX "clientes_asignado_idx" ON "clientes" ("asignado_a");
CREATE INDEX "clientes_email_idx" ON "clientes" ("email");
CREATE INDEX "clientes_cuit_idx" ON "clientes" ("cuit");
CREATE INDEX "clientes_lead_idx" ON "clientes" ("lead_id");

-- Productos
CREATE TABLE "productos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nombre" text NOT NULL,
  "descripcion" text,
  "precio" decimal(12, 2) NOT NULL,
  "activo" boolean NOT NULL DEFAULT true,
  "creado_por" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX "productos_activo_idx" ON "productos" ("activo");

-- Pedidos
CREATE TABLE "pedidos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cliente_id" uuid NOT NULL REFERENCES "clientes"("id"),
  "vendedor_id" uuid NOT NULL REFERENCES "users"("id"),
  "fecha" timestamp NOT NULL DEFAULT now(),
  "estado" "estado_pedido" NOT NULL DEFAULT 'pendiente',
  "total" decimal(12, 2) NOT NULL DEFAULT '0',
  "monto_pagado" decimal(12, 2) NOT NULL DEFAULT '0',
  "saldo_pendiente" decimal(12, 2) NOT NULL DEFAULT '0',
  "estado_pago" "estado_pago_pedido" NOT NULL DEFAULT 'impago',
  "observaciones" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX "pedidos_cliente_idx" ON "pedidos" ("cliente_id");
CREATE INDEX "pedidos_vendedor_idx" ON "pedidos" ("vendedor_id");
CREATE INDEX "pedidos_estado_pago_idx" ON "pedidos" ("cliente_id", "estado_pago");
CREATE INDEX "pedidos_fecha_idx" ON "pedidos" ("fecha");

-- Pedido Items
CREATE TABLE "pedido_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "pedido_id" uuid NOT NULL REFERENCES "pedidos"("id") ON DELETE CASCADE,
  "producto_id" uuid NOT NULL REFERENCES "productos"("id"),
  "cantidad" integer NOT NULL,
  "precio_unitario" decimal(12, 2) NOT NULL,
  "subtotal" decimal(12, 2) NOT NULL
);
CREATE INDEX "pedido_items_pedido_idx" ON "pedido_items" ("pedido_id");

-- Movimientos Cuenta Corriente
CREATE TABLE "movimientos_cc" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cliente_id" uuid NOT NULL REFERENCES "clientes"("id"),
  "tipo" "tipo_movimiento_cc" NOT NULL,
  "monto" decimal(12, 2) NOT NULL,
  "pedido_id" uuid REFERENCES "pedidos"("id"),
  "fecha" timestamp NOT NULL DEFAULT now(),
  "descripcion" text,
  "registrado_por" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX "movimientos_cc_cliente_idx" ON "movimientos_cc" ("cliente_id", "fecha");
CREATE INDEX "movimientos_cc_pedido_idx" ON "movimientos_cc" ("pedido_id");

-- Aplicaciones de Pago (trazabilidad FIFO)
CREATE TABLE "aplicaciones_pago" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "movimiento_credito_id" uuid NOT NULL REFERENCES "movimientos_cc"("id"),
  "pedido_id" uuid NOT NULL REFERENCES "pedidos"("id"),
  "monto_aplicado" decimal(12, 2) NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX "aplicaciones_pago_credito_idx" ON "aplicaciones_pago" ("movimiento_credito_id");
CREATE INDEX "aplicaciones_pago_pedido_idx" ON "aplicaciones_pago" ("pedido_id");
