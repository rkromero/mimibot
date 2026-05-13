import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { productos, users } from '@/db/schema'
import { eq, and, ilike, isNull } from 'drizzle-orm'
import { createProductoSchema } from '@/lib/validations/productos'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const searchParams = req.nextUrl.searchParams
    const search = searchParams.get('search') ?? undefined
    const includeInactiveParam = searchParams.get('includeInactive')

    // includeInactive is admin-only
    const includeInactive =
      session.user.role === 'admin' && includeInactiveParam === 'true'

    const conditions: ReturnType<typeof eq>[] = [
      isNull(productos.deletedAt) as ReturnType<typeof eq>,
    ]

    if (!includeInactive) {
      conditions.push(eq(productos.activo, true))
    }

    if (search) {
      conditions.push(ilike(productos.nombre, `%${search}%`) as ReturnType<typeof eq>)
    }

    // Defensive: project only columns that have existed in the schema since
    // migration 0002. If newer columns (added in 0008) are missing in the
    // deployed DB, a `select()` (which projects every column declared in the
    // Drizzle schema) would fail with a 500. Selecting an explicit safe subset
    // keeps the list view alive while ops investigates the schema drift.
    try {
      const rows = await db
        .select()
        .from(productos)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(productos.nombre)

      return NextResponse.json({ data: rows })
    } catch (innerErr) {
      const rawMessage = innerErr instanceof Error ? innerErr.message : String(innerErr)
      console.error('[productos GET] full select failed, trying minimal projection:', rawMessage)

      const rows = await db
        .select({
          id: productos.id,
          nombre: productos.nombre,
          descripcion: productos.descripcion,
          precio: productos.precio,
          activo: productos.activo,
          creadoPor: productos.creadoPor,
          createdAt: productos.createdAt,
          updatedAt: productos.updatedAt,
        })
        .from(productos)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(productos.nombre)

      return NextResponse.json({ data: rows, _degraded: true })
    }
  } catch (err) {
    // Final safety net: log full error and degrade to empty list so the
    // productos page can still render its empty state.
    const rawMessage = err instanceof Error ? err.message : String(err)
    console.error('[productos GET] returning empty fallback:', rawMessage, err)
    return NextResponse.json({ data: [], _degraded: true }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    requireAdmin(session.user)

    const body: unknown = await req.json()
    const parsed = createProductoSchema.safeParse(body)
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Datos inválidos'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const input = parsed.data

    const [producto] = await db
      .insert(productos)
      .values({
        sku: input.sku ?? null,
        nombre: input.nombre,
        descripcion: input.descripcion ?? null,
        precio: input.precio,
        costo: input.costo ?? null,
        categoria: input.categoria ?? null,
        imagenUrl: input.imagenUrl ?? null,
        unidadVenta: input.unidadVenta ?? 'unidad',
        pesoG: input.pesoG ?? null,
        ivaPct: input.ivaPct ?? '21.00',
        stockMinimo: input.stockMinimo ?? 0,
        activo: true,
        creadoPor: session.user.id,
      })
      .returning()

    return NextResponse.json({ data: producto }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
