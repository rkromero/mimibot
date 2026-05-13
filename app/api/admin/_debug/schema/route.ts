import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { sql } from 'drizzle-orm'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'

// Admin-only diagnostic endpoint. Returns the live column list for a given
// table from PostgreSQL's information_schema, plus the list of applied
// Drizzle migrations. Useful for diagnosing schema drift between source
// and deployed DB without needing shell access to Railway.
//
// Usage: GET /api/admin/_debug/schema?table=productos
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)

    const table = req.nextUrl.searchParams.get('table') ?? 'productos'

    // Columns from information_schema
    const cols = await db.execute(sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table}
      ORDER BY ordinal_position
    `)

    // Applied Drizzle migrations (table created by drizzle-orm migrator)
    let migrations: unknown[] = []
    try {
      const rows = await db.execute(sql`
        SELECT id, hash, created_at
        FROM drizzle.__drizzle_migrations
        ORDER BY id
      `)
      migrations = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []
    } catch {
      // Migrations table not in expected place; ignore.
    }

    // Enum types referenced from the requested table
    const enums = await db.execute(sql`
      SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      GROUP BY t.typname
      ORDER BY t.typname
    `)

    return NextResponse.json({
      table,
      columns: Array.isArray(cols) ? cols : (cols as { rows?: unknown[] }).rows ?? [],
      enums: Array.isArray(enums) ? enums : (enums as { rows?: unknown[] }).rows ?? [],
      appliedMigrations: migrations,
    })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
