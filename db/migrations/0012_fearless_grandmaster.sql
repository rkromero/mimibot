CREATE TYPE "public"."estado_actividad" AS ENUM('activo', 'inactivo', 'perdido');--> statement-breakpoint
CREATE TYPE "public"."tipo_stock_movement" AS ENUM('entrada', 'salida', 'ajuste', 'reserva', 'cancelacion_reserva');--> statement-breakpoint
CREATE TYPE "public"."unidad_venta" AS ENUM('unidad', 'caja_12', 'caja_24', 'display');--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'gerente' BEFORE 'agent';--> statement-breakpoint
CREATE TABLE "audit_log_metas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meta_id" uuid NOT NULL,
	"accion" text NOT NULL,
	"motivo" text,
	"cambiado_por" uuid NOT NULL,
	"old_values" jsonb,
	"new_values" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"cliente_nuevo_min_pedidos" integer DEFAULT 3 NOT NULL,
	"cliente_nuevo_ventana_dias" integer DEFAULT 90 NOT NULL,
	"cliente_nuevo_monto_minimo" numeric(12, 2),
	"cliente_activo_dias" integer DEFAULT 60 NOT NULL,
	"cliente_inactivo_dias" integer DEFAULT 90 NOT NULL,
	"cliente_perdido_dias" integer DEFAULT 180 NOT NULL,
	"cliente_moroso_dias" integer DEFAULT 30 NOT NULL,
	"alerta_lead_horas" integer DEFAULT 24 NOT NULL,
	"alerta_meta_dia" integer DEFAULT 20 NOT NULL,
	"alerta_meta_pct" numeric(5, 2) DEFAULT '0.50' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "historial_territorio_cliente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"territorio_anterior_id" uuid,
	"territorio_nuevo_id" uuid,
	"fecha" timestamp DEFAULT now() NOT NULL,
	"cambiado_por" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendedor_id" uuid NOT NULL,
	"periodo_anio" integer NOT NULL,
	"periodo_mes" integer NOT NULL,
	"clientes_nuevos_objetivo" integer DEFAULT 0 NOT NULL,
	"pedidos_objetivo" integer DEFAULT 0 NOT NULL,
	"monto_cobrado_objetivo" numeric(12, 2) DEFAULT '0' NOT NULL,
	"conversion_leads_objetivo" numeric(5, 2) DEFAULT '0' NOT NULL,
	"pct_clientes_con_pedido_objetivo" numeric(5, 2) DEFAULT '0' NOT NULL,
	"creado_por" uuid NOT NULL,
	"fecha_creacion" timestamp DEFAULT now() NOT NULL,
	"fecha_actualizacion" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"producto_id" uuid NOT NULL,
	"tipo" "tipo_stock_movement" NOT NULL,
	"cantidad" integer NOT NULL,
	"saldo_resultante" integer NOT NULL,
	"pedido_id" uuid,
	"referencia" text,
	"notas" text,
	"registrado_por" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "territorio_agente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"territorio_id" uuid NOT NULL,
	"agente_id" uuid NOT NULL,
	"fecha_asignacion" timestamp DEFAULT now() NOT NULL,
	"fecha_desasignacion" timestamp
);
--> statement-breakpoint
CREATE TABLE "territorio_gerente" (
	"territorio_id" uuid NOT NULL,
	"gerente_id" uuid NOT NULL,
	"fecha_asignacion" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "territorio_gerente_territorio_id_gerente_id_pk" PRIMARY KEY("territorio_id","gerente_id")
);
--> statement-breakpoint
CREATE TABLE "territorios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"activo" boolean DEFAULT true NOT NULL,
	"es_legacy" boolean DEFAULT false NOT NULL,
	"creado_por" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "territorios_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"phone_number_id" text DEFAULT '' NOT NULL,
	"access_token" text DEFAULT '' NOT NULL,
	"app_secret" text DEFAULT '' NOT NULL,
	"verify_token" text DEFAULT '' NOT NULL,
	"is_configured" boolean DEFAULT false NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "territorio_id" uuid;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "fecha_conversion_a_nuevo" timestamp;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "estado_actividad" "estado_actividad";--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "vendedor_conversion_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "won_at" timestamp;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "creado_por" uuid;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "territorio_id_imputado" uuid;--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "sku" text;--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "costo" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "categoria" text;--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "imagen_url" text;--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "unidad_venta" "unidad_venta" DEFAULT 'unidad' NOT NULL;--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "peso_g" integer;--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "iva_pct" numeric(5, 2) DEFAULT '21.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "stock_minimo" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log_metas" ADD CONSTRAINT "audit_log_metas_meta_id_metas_id_fk" FOREIGN KEY ("meta_id") REFERENCES "public"."metas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log_metas" ADD CONSTRAINT "audit_log_metas_cambiado_por_users_id_fk" FOREIGN KEY ("cambiado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_config" ADD CONSTRAINT "business_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_territorio_cliente" ADD CONSTRAINT "historial_territorio_cliente_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_territorio_cliente" ADD CONSTRAINT "historial_territorio_cliente_territorio_anterior_id_territorios_id_fk" FOREIGN KEY ("territorio_anterior_id") REFERENCES "public"."territorios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_territorio_cliente" ADD CONSTRAINT "historial_territorio_cliente_territorio_nuevo_id_territorios_id_fk" FOREIGN KEY ("territorio_nuevo_id") REFERENCES "public"."territorios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_territorio_cliente" ADD CONSTRAINT "historial_territorio_cliente_cambiado_por_users_id_fk" FOREIGN KEY ("cambiado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metas" ADD CONSTRAINT "metas_vendedor_id_users_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metas" ADD CONSTRAINT "metas_creado_por_users_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_registrado_por_users_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "territorio_agente" ADD CONSTRAINT "territorio_agente_territorio_id_territorios_id_fk" FOREIGN KEY ("territorio_id") REFERENCES "public"."territorios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "territorio_agente" ADD CONSTRAINT "territorio_agente_agente_id_users_id_fk" FOREIGN KEY ("agente_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "territorio_gerente" ADD CONSTRAINT "territorio_gerente_territorio_id_territorios_id_fk" FOREIGN KEY ("territorio_id") REFERENCES "public"."territorios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "territorio_gerente" ADD CONSTRAINT "territorio_gerente_gerente_id_users_id_fk" FOREIGN KEY ("gerente_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "territorios" ADD CONSTRAINT "territorios_creado_por_users_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_config" ADD CONSTRAINT "whatsapp_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_metas_meta_idx" ON "audit_log_metas" USING btree ("meta_id");--> statement-breakpoint
CREATE INDEX "historial_territorio_cliente_idx" ON "historial_territorio_cliente" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "historial_territorio_fecha_idx" ON "historial_territorio_cliente" USING btree ("fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "metas_vendedor_periodo_idx" ON "metas" USING btree ("vendedor_id","periodo_anio","periodo_mes");--> statement-breakpoint
CREATE INDEX "metas_periodo_idx" ON "metas" USING btree ("periodo_anio","periodo_mes");--> statement-breakpoint
CREATE INDEX "metas_vendedor_idx" ON "metas" USING btree ("vendedor_id");--> statement-breakpoint
CREATE INDEX "stock_movements_producto_idx" ON "stock_movements" USING btree ("producto_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_pedido_idx" ON "stock_movements" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX "territorio_agente_territorio_idx" ON "territorio_agente" USING btree ("territorio_id");--> statement-breakpoint
CREATE INDEX "territorio_agente_agente_idx" ON "territorio_agente" USING btree ("agente_id");--> statement-breakpoint
CREATE INDEX "territorio_gerente_gerente_idx" ON "territorio_gerente" USING btree ("gerente_id");--> statement-breakpoint
CREATE INDEX "territorios_activo_idx" ON "territorios" USING btree ("activo");--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_territorio_id_territorios_id_fk" FOREIGN KEY ("territorio_id") REFERENCES "public"."territorios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_vendedor_conversion_id_users_id_fk" FOREIGN KEY ("vendedor_conversion_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_creado_por_users_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_territorio_id_imputado_territorios_id_fk" FOREIGN KEY ("territorio_id_imputado") REFERENCES "public"."territorios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clientes_territorio_idx" ON "clientes" USING btree ("territorio_id");--> statement-breakpoint
CREATE INDEX "clientes_estado_actividad_idx" ON "clientes" USING btree ("estado_actividad");--> statement-breakpoint
CREATE INDEX "clientes_conversion_idx" ON "clientes" USING btree ("fecha_conversion_a_nuevo");--> statement-breakpoint
CREATE INDEX "leads_won_at_idx" ON "leads" USING btree ("won_at");--> statement-breakpoint
CREATE INDEX "pedidos_territorio_imputado_idx" ON "pedidos" USING btree ("territorio_id_imputado");--> statement-breakpoint
CREATE UNIQUE INDEX "productos_sku_idx" ON "productos" USING btree ("sku");