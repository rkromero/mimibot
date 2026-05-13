import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { sql } from 'drizzle-orm'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'

// Admin-only POST endpoint that idempotently applies the migrations 0008-0011
// to the deployed database. These migrations were declared in the Drizzle
// journal but never actually ran in production (only 6 of 12 entries are
// present in __drizzle_migrations), which left the `productos` table missing
// 8 columns, the `stock_movements` and `whatsapp_config` tables missing
// entirely, and the `users` table missing the 2FA TOTP columns.
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
    })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

// GET returns 405 to nudge users to use POST so this isn't triggered by a prefetch
export async function GET(_req: NextRequest) {
  return NextResponse.json(
    { error: 'Use POST. This endpoint applies missing migrations 0008-0011.' },
    { status: 405 },
  )
}
