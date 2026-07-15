import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { productos, marcas } from '@/db/schema'
import { eq, and, ilike, isNull, asc, desc, sql, getTableColumns } from 'drizzle-orm'
import { createProductoSchema } from '@/lib/validations/productos'
import { requireAdmin } from '@/lib/authz'
import { marcaVisibleFilter } from '@/lib/authz/marcas'
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

    // Filtro explícito por marca (uuid válido, si no se ignora para evitar
    // errores de cast en Postgres).
    const marcaIdParam = searchParams.get('marcaId')
    if (marcaIdParam && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(marcaIdParam)) {
      conditions.push(eq(productos.marcaId, marcaIdParam))
    }

    // Filtro de marcas visibles: ventas sólo ven Mimi (default) + sus marcas
    // asignadas; admin/gerente/fabrica/repartidor ven todas (filtro = undefined).
    const marcaFilter = await marcaVisibleFilter(session.user)
    if (marcaFilter) {
      conditions.push(marcaFilter as ReturnType<typeof eq>)
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

      // Incluye el nombre de la marca por producto (el front no debe asumir
      // marca única — cada producto muestra su propia marca).
      const rows = await db
        .select({ ...getTableColumns(productos), marcaNombre: marcas.nombre })
        .from(productos)
        .leftJoin(marcas, eq(marcas.id, productos.marcaId))
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

function getPgCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined
  const e = err as Record<string, unknown>
  if (typeof e['code'] === 'string') return e['code']
  const cause = e['cause']
  if (cause && typeof cause === 'object') {
    const c = cause as Record<string, unknown>
    if (typeof c['code'] === 'string') return c['code']
  }
  return undefined
}

async function nextMimSku(): Promise<string> {
  const [row] = await db
    .select({ maxNum: sql<number | null>`MAX(CAST(SUBSTRING(sku FROM 5) AS INTEGER))` })
    .from(productos)
    .where(sql`sku ~ '^MIM-[0-9]+$'`)
  const next = (row?.maxNum ?? 0) + 1
  return `MIM-${String(next).padStart(3, '0')}`
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
    const skuFromUser = input.sku?.trim().toUpperCase() || null
    const autoGenerated = !skuFromUser

    // Marca obligatoria: debe existir y estar activa.
    const marca = await db.query.marcas.findFirst({
      where: and(eq(marcas.id, input.marcaId), eq(marcas.activo, true)),
      columns: { id: true },
    })
    if (!marca) {
      return NextResponse.json({ error: 'Marca inválida o inactiva' }, { status: 400 })
    }
    const marcaId = marca.id

    let sku = skuFromUser
    let producto: (typeof productos.$inferSelect) | undefined

    for (let attempt = 0; attempt < 5; attempt++) {
      if (autoGenerated) sku = await nextMimSku()

      try {
        const [row] = await db
          .insert(productos)
          .values({
            sku,
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
            marcaId,
            creadoPor: session.user.id,
          })
          .returning()
        producto = row
        break
      } catch (insertErr) {
        if (getPgCode(insertErr) === '23505') {
          if (!autoGenerated) {
            return NextResponse.json({ error: 'Ya existe un producto con ese SKU' }, { status: 409 })
          }
          continue
        }
        throw insertErr
      }
    }

    if (!producto) {
      return NextResponse.json({ error: 'No se pudo generar un SKU único, intentá de nuevo' }, { status: 500 })
    }

    return NextResponse.json({ data: producto }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
