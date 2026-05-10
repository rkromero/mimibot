DO $$ BEGIN
  CREATE TYPE "public"."estado_actividad" AS ENUM('activo', 'inactivo', 'perdido');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "business_config" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "cliente_nuevo_min_pedidos" integer NOT NULL DEFAULT 3,
  "cliente_nuevo_ventana_dias" integer NOT NULL DEFAULT 90,
  "cliente_nuevo_monto_minimo" numeric(12, 2),
  "cliente_activo_dias" integer NOT NULL DEFAULT 60,
  "cliente_inactivo_dias" integer NOT NULL DEFAULT 90,
  "cliente_perdido_dias" integer NOT NULL DEFAULT 180,
  "cliente_moroso_dias" integer NOT NULL DEFAULT 30,
  "updated_by" uuid REFERENCES "users"("id"),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

INSERT INTO "business_config" ("id") VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE "clientes"
  ADD COLUMN IF NOT EXISTS "fecha_conversion_a_nuevo" timestamp,
  ADD COLUMN IF NOT EXISTS "estado_actividad" "estado_actividad",
  ADD COLUMN IF NOT EXISTS "vendedor_conversion_id" uuid REFERENCES "users"("id");

ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "won_at" timestamp;

CREATE TABLE IF NOT EXISTS "metas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "vendedor_id" uuid NOT NULL REFERENCES "users"("id"),
  "periodo_anio" integer NOT NULL,
  "periodo_mes" integer NOT NULL,
  "clientes_nuevos_objetivo" integer NOT NULL DEFAULT 0,
  "pedidos_objetivo" integer NOT NULL DEFAULT 0,
  "monto_cobrado_objetivo" numeric(12, 2) NOT NULL DEFAULT '0',
  "conversion_leads_objetivo" numeric(5, 2) NOT NULL DEFAULT '0',
  "creado_por" uuid NOT NULL REFERENCES "users"("id"),
  "fecha_creacion" timestamp NOT NULL DEFAULT now(),
  "fecha_actualizacion" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "metas_vendedor_periodo_idx" ON "metas" ("vendedor_id", "periodo_anio", "periodo_mes");
CREATE INDEX IF NOT EXISTS "metas_periodo_idx" ON "metas" ("periodo_anio", "periodo_mes");
CREATE INDEX IF NOT EXISTS "metas_vendedor_idx" ON "metas" ("vendedor_id");

CREATE TABLE IF NOT EXISTS "audit_log_metas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "meta_id" uuid NOT NULL REFERENCES "metas"("id"),
  "accion" text NOT NULL,
  "motivo" text,
  "cambiado_por" uuid NOT NULL REFERENCES "users"("id"),
  "old_values" jsonb,
  "new_values" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "audit_log_metas_meta_idx" ON "audit_log_metas" ("meta_id");

CREATE INDEX IF NOT EXISTS "clientes_estado_actividad_idx" ON "clientes" ("estado_actividad");
CREATE INDEX IF NOT EXISTS "clientes_conversion_idx" ON "clientes" ("fecha_conversion_a_nuevo") WHERE "fecha_conversion_a_nuevo" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "leads_won_at_idx" ON "leads" ("won_at") WHERE "won_at" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "pedidos_vendedor_fecha_estado_idx" ON "pedidos" ("vendedor_id", "fecha", "estado");
CREATE INDEX IF NOT EXISTS "movimientos_cc_fecha_tipo_idx" ON "movimientos_cc" ("fecha", "tipo");
