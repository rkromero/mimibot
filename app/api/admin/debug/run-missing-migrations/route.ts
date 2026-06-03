import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { sql } from 'drizzle-orm'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'

// Admin-only POST endpoint that idempotently applies missing migrations
// to the deployed database.
//
// All DDL statements use IF NOT EXISTS / EXCEPTION WHEN duplicate_object so
// this endpoint can be re-run safely without side effects.
//
// Usage: POST /api/admin/debug/run-missing-migrations  (no body)

type StepResult = { migration: string; step: number; statement: string; status: 'ok' | 'error'; error?: string }

const MIGRATION_0008_STATEMENTS: string[] = [
  `DO $$ BEGIN
    CREATE TYPE "unidad_venta" AS ENUM('unidad', 'caja_12', 'caja_24', 'display');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,

  `ALTER TABLE "productos"
    ADD COLUMN IF NOT EXISTS "sku" text,
    ADD COLUMN IF NOT EXISTS "categoria" text,
    ADD COLUMN IF NOT EXISTS "imagen_url" text,
    ADD COLUMN IF NOT EXISTS "costo" numeric(12,2),
    ADD COLUMN IF NOT EXISTS "unidad_venta" "unidad_venta" NOT NULL DEFAULT 'unidad',
    ADD COLUMN IF NOT EXISTS "peso_g" integer,
    ADD COLUMN IF NOT EXISTS "iva_pct" numeric(5,2) NOT NULL DEFAULT 21.00,
    ADD COLUMN IF NOT EXISTS "stock_minimo" integer NOT NULL DEFAULT 0`,

  `DO $$
  DECLARE
    r RECORD;
    counter INTEGER := 1;
  BEGIN
    FOR r IN SELECT id FROM "productos" WHERE sku IS NULL ORDER BY created_at LOOP
      UPDATE "productos" SET sku = 'MIM-' || LPAD(counter::TEXT, 3, '0') WHERE id = r.id;
      counter := counter + 1;
    END LOOP;
  END $$`,

  `CREATE UNIQUE INDEX IF NOT EXISTS "productos_sku_idx" ON "productos" ("sku")`,
]

const MIGRATION_0009_STATEMENTS: string[] = [
  `DO $$ BEGIN
    CREATE TYPE "tipo_stock_movement" AS ENUM('entrada', 'salida', 'ajuste', 'reserva', 'cancelacion_reserva');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,

  `CREATE TABLE IF NOT EXISTS "stock_movements" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "producto_id" uuid NOT NULL REFERENCES "productos"("id"),
    "tipo" "tipo_stock_movement" NOT NULL,
    "cantidad" integer NOT NULL,
    "saldo_resultante" integer NOT NULL,
    "pedido_id" uuid REFERENCES "pedidos"("id"),
    "referencia" text,
    "notas" text,
    "registrado_por" uuid NOT NULL REFERENCES "users"("id"),
    "created_at" timestamp NOT NULL DEFAULT now()
  )`,

  `CREATE INDEX IF NOT EXISTS "stock_movements_producto_idx" ON "stock_movements" ("producto_id", "created_at")`,
  `CREATE INDEX IF NOT EXISTS "stock_movements_pedido_idx" ON "stock_movements" ("pedido_id")`,

  `ALTER TABLE "business_config"
    ADD COLUMN IF NOT EXISTS "alerta_lead_horas" integer NOT NULL DEFAULT 24,
    ADD COLUMN IF NOT EXISTS "alerta_meta_dia" integer NOT NULL DEFAULT 20,
    ADD COLUMN IF NOT EXISTS "alerta_meta_pct" numeric(5,2) NOT NULL DEFAULT 0.50`,
]

const MIGRATION_0010_STATEMENTS: string[] = [
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_secret" text`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_enabled" boolean NOT NULL DEFAULT false`,
]

const MIGRATION_0015_STATEMENTS: string[] = [
  // Migration 0015: Add 'vendedor' role — decoupled copy of 'agent'.
  // ALTER TYPE ADD VALUE cannot run inside a transaction; the IF NOT EXISTS
  // makes this idempotent so re-runs are safe.
  `ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'vendedor'`,
]

const MIGRATION_0016_STATEMENTS: string[] = [
  // Migration 0016: Delivery method (metodo_entrega) for Agent orders.
  // Creates the enum and adds columns to clientes + pedidos.
  // All DDL uses IF NOT EXISTS / EXCEPTION WHEN duplicate_object for idempotency.
  `DO $$ BEGIN
    CREATE TYPE "public"."metodo_entrega" AS ENUM ('retiro_fabrica', 'expreso');
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,

  `ALTER TABLE "clientes"
    ADD COLUMN IF NOT EXISTS "expreso_nombre" text,
    ADD COLUMN IF NOT EXISTS "expreso_direccion" text`,

  `ALTER TABLE "pedidos"
    ADD COLUMN IF NOT EXISTS "metodo_entrega" "metodo_entrega",
    ADD COLUMN IF NOT EXISTS "expreso_nombre" text,
    ADD COLUMN IF NOT EXISTS "expreso_direccion" text`,
]

const MIGRATION_0017_STATEMENTS: string[] = [
  // Migration 0017: % pedidos pagados objective for agents.
  `ALTER TABLE "metas"
    ADD COLUMN IF NOT EXISTS "pct_pedidos_pagados_objetivo" numeric(5, 2) NOT NULL DEFAULT '0'`,
]

const MIGRATION_0018_STATEMENTS: string[] = [
  // Migration 0018: % cobranza objective for agents/vendedores.
  `ALTER TABLE "metas"
    ADD COLUMN IF NOT EXISTS "pct_cobranza_objetivo" numeric(5, 2) NOT NULL DEFAULT '0'`,
]

const MIGRATION_0019_STATEMENTS: string[] = [
  // Migration 0019: localidad, provincia, cp for clientes.
  `ALTER TABLE "clientes"
    ADD COLUMN IF NOT EXISTS "localidad" text,
    ADD COLUMN IF NOT EXISTS "provincia" text,
    ADD COLUMN IF NOT EXISTS "codigo_postal" text`,
]

const MIGRATION_0020_STATEMENTS: string[] = [
  // Migration 0020: en_reparto estado and fabrica role.
  // ADD VALUE cannot run inside a transaction; IF NOT EXISTS makes it idempotent.
  `ALTER TYPE "public"."estado_pedido" ADD VALUE IF NOT EXISTS 'en_reparto' BEFORE 'entregado'`,
  `ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'fabrica'`,
]

const MIGRATION_0021_STATEMENTS: string[] = [
  // Migration 0021: fiscal fields for empresa_config.
  `ALTER TABLE "empresa_config"
    ADD COLUMN IF NOT EXISTS "cuit" text,
    ADD COLUMN IF NOT EXISTS "condicion_iva" text DEFAULT 'Responsable Inscripto',
    ADD COLUMN IF NOT EXISTS "punto_venta" text DEFAULT '0001'`,
]

const MIGRATION_0022_STATEMENTS: string[] = [
  // Migration 0022: repartidor role + delivery fields on pedidos.
  `ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'repartidor'`,
  `ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "entregado_at" timestamptz`,
  `ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "entregado_por" uuid REFERENCES "public"."users"("id")`,
  `ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "firma_url" text`,
]

const MIGRATION_0023_STATEMENTS: string[] = [
  // Migration 0023: payment collection tracking fields on pedidos.
  `ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "pago_cobrado_por" uuid REFERENCES "public"."users"("id")`,
  `ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "pago_cobrado_at" timestamptz`,
]

const MIGRATION_0011_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "whatsapp_config" (
    "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
    "phone_number_id" text DEFAULT '' NOT NULL,
    "access_token" text DEFAULT '' NOT NULL,
    "app_secret" text DEFAULT '' NOT NULL,
    "verify_token" text DEFAULT '' NOT NULL,
    "is_configured" boolean DEFAULT false NOT NULL,
    "updated_by" uuid,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`,
  `DO $$ BEGIN
    ALTER TABLE "whatsapp_config" ADD CONSTRAINT "whatsapp_config_updated_by_users_id_fk"
      FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,
]

async function runStatements(migrationName: string, statements: string[]): Promise<StepResult[]> {
  const results: StepResult[] = []
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]!
    try {
      await db.execute(sql.raw(stmt))
      results.push({
        migration: migrationName,
        step: i,
        statement: stmt.split('\n')[0]!.slice(0, 80),
        status: 'ok',
      })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      results.push({
        migration: migrationName,
        step: i,
        statement: stmt.split('\n')[0]!.slice(0, 80),
        status: 'error',
        error: errMsg,
      })
      // Stop on first error within a migration; let the user see partial state
      break
    }
  }
  return results
}

export async function POST(_req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)

    const results: StepResult[] = []
    results.push(...await runStatements('0008_productos_extended', MIGRATION_0008_STATEMENTS))
    results.push(...await runStatements('0009_stock_movements', MIGRATION_0009_STATEMENTS))
    results.push(...await runStatements('0010_2fa_totp', MIGRATION_0010_STATEMENTS))
    results.push(...await runStatements('0011_whatsapp_config', MIGRATION_0011_STATEMENTS))
    results.push(...await runStatements('0015_add_vendedor_role', MIGRATION_0015_STATEMENTS))
    results.push(...await runStatements('0016_expreso_entrega', MIGRATION_0016_STATEMENTS))
    results.push(...await runStatements('0017_pct_pedidos_pagados', MIGRATION_0017_STATEMENTS))
    results.push(...await runStatements('0018_pct_cobranza_objetivo', MIGRATION_0018_STATEMENTS))
    results.push(...await runStatements('0019_localidad_clientes', MIGRATION_0019_STATEMENTS))
    results.push(...await runStatements('0020_en_reparto_fabrica', MIGRATION_0020_STATEMENTS))
    results.push(...await runStatements('0021_empresa_fiscal', MIGRATION_0021_STATEMENTS))
    results.push(...await runStatements('0022_repartidor_entrega', MIGRATION_0022_STATEMENTS))
    results.push(...await runStatements('0023_pago_cobrado_fields', MIGRATION_0023_STATEMENTS))

    // Snapshot what's now in the DB so the response confirms success
    const productosCols = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'productos'
      ORDER BY ordinal_position
    `)
    const stockExists = await db.execute(sql`
      SELECT to_regclass('public.stock_movements') AS exists
    `)
    const whatsappExists = await db.execute(sql`
      SELECT to_regclass('public.whatsapp_config') AS exists
    `)
    const userTotpCols = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name IN ('totp_secret','totp_enabled')
    `)
    const clientesExpresoCols = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'clientes'
        AND column_name IN ('expreso_nombre','expreso_direccion')
    `)
    const pedidosExpresoCols = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'pedidos'
        AND column_name IN ('metodo_entrega','expreso_nombre','expreso_direccion')
    `)
    const metasPctPedidosCols = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'metas'
        AND column_name = 'pct_pedidos_pagados_objetivo'
    `)
    const metasPctCobranzaCols = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'metas'
        AND column_name = 'pct_cobranza_objetivo'
    `)
    const pedidosEntregaCols = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'pedidos'
        AND column_name IN ('entregado_at', 'entregado_por', 'firma_url')
    `)
    const pedidosPagoCobradoCols = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'pedidos'
        AND column_name IN ('pago_cobrado_por', 'pago_cobrado_at')
    `)
    const repartidorRole = await db.execute(sql`
      SELECT enumlabel FROM pg_enum
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
      WHERE pg_type.typname = 'user_role' AND enumlabel = 'repartidor'
    `)

    const okCount = results.filter((r) => r.status === 'ok').length
    const errCount = results.filter((r) => r.status === 'error').length

    const unwrap = (v: unknown) =>
      Array.isArray(v) ? v : ((v as { rows?: unknown[] }).rows ?? [])

    return NextResponse.json({
      summary: { totalSteps: results.length, ok: okCount, error: errCount },
      results,
      productosColumns: unwrap(productosCols),
      stockMovementsTable: unwrap(stockExists),
      whatsappConfigTable: unwrap(whatsappExists),
      usersTotpColumns: unwrap(userTotpCols),
      clientesExpresoColumns: unwrap(clientesExpresoCols),
      pedidosExpresoColumns: unwrap(pedidosExpresoCols),
      metasPctPedidosColumn: unwrap(metasPctPedidosCols),
      metasPctCobranzaColumn: unwrap(metasPctCobranzaCols),
      pedidosEntregaColumns: unwrap(pedidosEntregaCols),
      pedidosPagoCobradoColumns: unwrap(pedidosPagoCobradoCols),
      repartidorRoleExists: unwrap(repartidorRole).length > 0,
    })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

// GET returns 405 to nudge users to use POST so this isn't triggered by a prefetch
export async function GET(_req: NextRequest) {
  return NextResponse.json(
    { error: 'Use POST. This endpoint applies missing migrations 0008-0011, 0015-0023.' },
    { status: 405 },
  )
}
