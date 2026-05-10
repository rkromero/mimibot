CREATE TYPE "public"."estado_pago_pedido" AS ENUM('impago', 'parcial', 'pagado');--> statement-breakpoint
CREATE TYPE "public"."estado_pedido" AS ENUM('pendiente', 'confirmado', 'entregado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."follow_up_scenario" AS ENUM('no_response', 'stalling', 'manual');--> statement-breakpoint
CREATE TYPE "public"."follow_up_status" AS ENUM('pending', 'sent', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."origen_cliente" AS ENUM('manual', 'convertido_de_lead');--> statement-breakpoint
CREATE TYPE "public"."tipo_movimiento_cc" AS ENUM('debito', 'credito');--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE 'follow_up_scheduled';--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE 'follow_up_sent';--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE 'follow_up_cancelled';--> statement-breakpoint
CREATE TABLE "aplicaciones_pago" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"movimiento_credito_id" uuid NOT NULL,
	"pedido_id" uuid NOT NULL,
	"monto_aplicado" numeric(12, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"apellido" text NOT NULL,
	"email" text,
	"telefono" text,
	"direccion" text,
	"cuit" text,
	"origen" "origen_cliente" DEFAULT 'manual' NOT NULL,
	"lead_id" uuid,
	"asignado_a" uuid,
	"creado_por" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_up_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"no_response_hours" integer DEFAULT 24 NOT NULL,
	"stalling_delay_minutes" integer DEFAULT 60 NOT NULL,
	"max_follow_ups" integer DEFAULT 3 NOT NULL,
	"retry_hours" jsonb DEFAULT '[1, 22, 72]' NOT NULL,
	"stalling_phrases" text[] DEFAULT '{}' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_up_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"template_name" text NOT NULL,
	"language" text DEFAULT 'es' NOT NULL,
	"scenario" "follow_up_scenario" DEFAULT 'no_response' NOT NULL,
	"body_preview" text DEFAULT '' NOT NULL,
	"parameters" jsonb DEFAULT '[]' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movimientos_cc" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"tipo" "tipo_movimiento_cc" NOT NULL,
	"monto" numeric(12, 2) NOT NULL,
	"pedido_id" uuid,
	"fecha" timestamp DEFAULT now() NOT NULL,
	"descripcion" text,
	"registrado_por" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedido_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"cantidad" integer NOT NULL,
	"precio_unitario" numeric(12, 2) NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedidos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"vendedor_id" uuid NOT NULL,
	"fecha" timestamp DEFAULT now() NOT NULL,
	"estado" "estado_pedido" DEFAULT 'pendiente' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"monto_pagado" numeric(12, 2) DEFAULT '0' NOT NULL,
	"saldo_pendiente" numeric(12, 2) DEFAULT '0' NOT NULL,
	"estado_pago" "estado_pago_pedido" DEFAULT 'impago' NOT NULL,
	"observaciones" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "productos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"precio" numeric(12, 2) NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_por" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "userId" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "userId" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "next_follow_up_at" timestamp;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "follow_up_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "follow_up_status" "follow_up_status";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "follow_up_reason" text;--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD COLUMN "is_won" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "aplicaciones_pago" ADD CONSTRAINT "aplicaciones_pago_movimiento_credito_id_movimientos_cc_id_fk" FOREIGN KEY ("movimiento_credito_id") REFERENCES "public"."movimientos_cc"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aplicaciones_pago" ADD CONSTRAINT "aplicaciones_pago_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_asignado_a_users_id_fk" FOREIGN KEY ("asignado_a") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_creado_por_users_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_config" ADD CONSTRAINT "follow_up_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_cc" ADD CONSTRAINT "movimientos_cc_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_cc" ADD CONSTRAINT "movimientos_cc_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_cc" ADD CONSTRAINT "movimientos_cc_registrado_por_users_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_items" ADD CONSTRAINT "pedido_items_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_items" ADD CONSTRAINT "pedido_items_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_vendedor_id_users_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_creado_por_users_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aplicaciones_pago_credito_idx" ON "aplicaciones_pago" USING btree ("movimiento_credito_id");--> statement-breakpoint
CREATE INDEX "aplicaciones_pago_pedido_idx" ON "aplicaciones_pago" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX "clientes_asignado_idx" ON "clientes" USING btree ("asignado_a");--> statement-breakpoint
CREATE INDEX "clientes_email_idx" ON "clientes" USING btree ("email");--> statement-breakpoint
CREATE INDEX "clientes_cuit_idx" ON "clientes" USING btree ("cuit");--> statement-breakpoint
CREATE INDEX "clientes_lead_idx" ON "clientes" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "movimientos_cc_cliente_idx" ON "movimientos_cc" USING btree ("cliente_id","fecha");--> statement-breakpoint
CREATE INDEX "movimientos_cc_pedido_idx" ON "movimientos_cc" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX "pedido_items_pedido_idx" ON "pedido_items" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX "pedidos_cliente_idx" ON "pedidos" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "pedidos_vendedor_idx" ON "pedidos" USING btree ("vendedor_id");--> statement-breakpoint
CREATE INDEX "pedidos_estado_pago_idx" ON "pedidos" USING btree ("cliente_id","estado_pago");--> statement-breakpoint
CREATE INDEX "pedidos_fecha_idx" ON "pedidos" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "productos_activo_idx" ON "productos" USING btree ("activo");--> statement-breakpoint
CREATE INDEX "leads_follow_up_idx" ON "leads" USING btree ("next_follow_up_at","follow_up_status");