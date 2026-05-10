-- ─── 1. Nuevo valor en enum user_role ────────────────────────────────────────
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'gerente';

-- ─── 2. Tabla territorios ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "territorios" (
  "id"          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "nombre"      text        NOT NULL UNIQUE,
  "descripcion" text,
  "activo"      boolean     NOT NULL DEFAULT true,
  "es_legacy"   boolean     NOT NULL DEFAULT false,
  "creado_por"  uuid        REFERENCES "users"("id"),
  "created_at"  timestamp   NOT NULL DEFAULT now(),
  "updated_at"  timestamp   NOT NULL DEFAULT now(),
  "deleted_at"  timestamp
);

CREATE INDEX IF NOT EXISTS "territorios_activo_idx" ON "territorios" ("activo");

-- ─── 3. Tabla territorio_agente ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "territorio_agente" (
  "id"                   uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  "territorio_id"        uuid      NOT NULL REFERENCES "territorios"("id"),
  "agente_id"            uuid      NOT NULL REFERENCES "users"("id"),
  "fecha_asignacion"     timestamp NOT NULL DEFAULT now(),
  "fecha_desasignacion"  timestamp
);

-- Un solo agente activo por territorio a la vez
CREATE UNIQUE INDEX IF NOT EXISTS "territorio_agente_activo_idx"
  ON "territorio_agente" ("territorio_id")
  WHERE "fecha_desasignacion" IS NULL;

CREATE INDEX IF NOT EXISTS "territorio_agente_territorio_idx" ON "territorio_agente" ("territorio_id");
CREATE INDEX IF NOT EXISTS "territorio_agente_agente_idx"     ON "territorio_agente" ("agente_id");

-- ─── 4. Tabla territorio_gerente ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "territorio_gerente" (
  "territorio_id"     uuid      NOT NULL REFERENCES "territorios"("id"),
  "gerente_id"        uuid      NOT NULL REFERENCES "users"("id"),
  "fecha_asignacion"  timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("territorio_id", "gerente_id")
);

CREATE INDEX IF NOT EXISTS "territorio_gerente_gerente_idx" ON "territorio_gerente" ("gerente_id");

-- ─── 5. Tabla historial_territorio_cliente ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "historial_territorio_cliente" (
  "id"                     uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  "cliente_id"             uuid      NOT NULL REFERENCES "clientes"("id"),
  "territorio_anterior_id" uuid      REFERENCES "territorios"("id"),
  "territorio_nuevo_id"    uuid      REFERENCES "territorios"("id"),
  "fecha"                  timestamp NOT NULL DEFAULT now(),
  "cambiado_por"           uuid      NOT NULL REFERENCES "users"("id")
);

CREATE INDEX IF NOT EXISTS "historial_territorio_cliente_idx" ON "historial_territorio_cliente" ("cliente_id");
CREATE INDEX IF NOT EXISTS "historial_territorio_fecha_idx"   ON "historial_territorio_cliente" ("fecha");

-- ─── 6. Columnas nuevas en clientes ──────────────────────────────────────────
ALTER TABLE "clientes"
  ADD COLUMN IF NOT EXISTS "territorio_id" uuid REFERENCES "territorios"("id");

CREATE INDEX IF NOT EXISTS "clientes_territorio_idx" ON "clientes" ("territorio_id");

-- ─── 7. Columnas nuevas en pedidos ───────────────────────────────────────────
ALTER TABLE "pedidos"
  ADD COLUMN IF NOT EXISTS "creado_por"            uuid REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "territorio_id_imputado" uuid REFERENCES "territorios"("id");

CREATE INDEX IF NOT EXISTS "pedidos_territorio_imputado_idx" ON "pedidos" ("territorio_id_imputado");

-- ─── 8. Migración de datos: territorio "Sin asignar" ─────────────────────────
INSERT INTO "territorios" ("nombre", "activo", "es_legacy")
VALUES ('Sin asignar', true, true)
ON CONFLICT ("nombre") DO NOTHING;

-- Todos los clientes existentes quedan asignados al territorio "Sin asignar"
UPDATE "clientes"
SET "territorio_id" = (SELECT "id" FROM "territorios" WHERE "nombre" = 'Sin asignar')
WHERE "territorio_id" IS NULL;
