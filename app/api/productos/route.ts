import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { productos } from '@/db/schema'
import { eq, and, ilike, isNull, asc, desc, sql } from 'drizzle-orm'
import { createProductoSchema } from '@/lib/validations/productos'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { parsePagination } from '@/lib/api/pagination'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { page, limit, sortBy, sortDir, search } = parsePagination(
      req.nextUrl.searchParams,
      { sortBy: 'nombre', sortDir: 'asc' },
    )

    const searchParams = req.nextUrl.searchParams
    const includeInactiveParam = searchParams.get('includeInactive')
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

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    try {
      const [countRow] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(productos)
        .where(whereClause)

      const total = countRow?.total ?? 0
      const totalPages = total === 0 ? 0 : Math.ceil(total / limit)

      const sortCol = (() => {
        switch (sortBy) {
          case 'precio': return productos.precio
          case 'sku': return productos.sku
          case 'categoria': return productos.categoria
          default: return productos.nombre
        }
      })()
      const orderFn = sortDir === 'asc' ? asc : desc

      const rows = await db
        .select()
        .from(productos)
        .where(whereClause)
        .orderBy(orderFn(sortCol))
        .limit(limit)
        .offset((page - 1) * limit)

      return NextResponse.json({ data: rows, page, limit, total, totalPages })
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
        .where(whereClause)
        .orderBy(asc(productos.nombre))
        .limit(limit)
        .offset((page - 1) * limit)

      return NextResponse.json({ data: rows, page, limit, total: rows.length, totalPages: 1, _degraded: true })
    }
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : String(err)
    console.error('[productos GET] returning empty fallback:', rawMessage, err)
    return NextResponse.json({ data: [], page: 1, limit: 50, total: 0, totalPages: 0, _degraded: true }, { status: 200 })
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
