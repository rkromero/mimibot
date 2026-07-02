import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { gastos, gastoCategorias, proveedores, users } from '@/db/schema'
import { eq, and, isNull, gte, lt, asc, desc, sql } from 'drizzle-orm'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { createGastoSchema } from '@/lib/validations/gastos'
import { parsePagination } from '@/lib/api/pagination'
import { parseFechaAR, rangoMesAR } from '@/lib/dates'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)

    const { page, limit, sortBy, sortDir } = parsePagination(
      req.nextUrl.searchParams,
      { sortBy: 'fecha', sortDir: 'desc' },
    )
    const mes = req.nextUrl.searchParams.get('mes') ?? undefined
    const categoriaId = req.nextUrl.searchParams.get('categoriaId') ?? undefined

    const conditions = [isNull(gastos.deletedAt)]
    if (mes) {
      const rango = rangoMesAR(mes)
      if (!rango) return NextResponse.json({ error: 'Mes inválido (YYYY-MM)' }, { status: 400 })
      conditions.push(gte(gastos.fecha, rango.desde), lt(gastos.fecha, rango.hasta))
    }
    if (categoriaId) conditions.push(eq(gastos.categoriaId, categoriaId))

    const whereClause = and(...conditions)

    const [countRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(gastos)
      .where(whereClause)

    const total = countRow?.total ?? 0
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit)

    const sortCol = (() => {
      switch (sortBy) {
        case 'monto': return gastos.monto
        case 'createdAt': return gastos.createdAt
        default: return gastos.fecha
      }
    })()
    const orderFn = sortDir === 'asc' ? asc : desc

    const rows = await db
      .select({
        gasto: gastos,
        categoriaNombre: gastoCategorias.nombre,
        categoriaTipo: gastoCategorias.tipo,
        proveedorNombre: proveedores.nombre,
        registradoPorNombre: users.name,
      })
      .from(gastos)
      .innerJoin(gastoCategorias, eq(gastos.categoriaId, gastoCategorias.id))
      .leftJoin(proveedores, eq(gastos.proveedorId, proveedores.id))
      .leftJoin(users, eq(gastos.registradoPor, users.id))
      .where(whereClause)
      .orderBy(orderFn(sortCol), desc(gastos.createdAt))
      .limit(limit)
      .offset((page - 1) * limit)

    const data = rows.map((r) => ({
      ...r.gasto,
      categoriaNombre: r.categoriaNombre,
      categoriaTipo: r.categoriaTipo,
      proveedorNombre: r.proveedorNombre ?? null,
      registradoPorNombre: r.registradoPorNombre ?? null,
    }))

    return NextResponse.json({ data, page, limit, total, totalPages })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)

    const body: unknown = await req.json()
    const parsed = createGastoSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const input = parsed.data

    const categoria = await db.query.gastoCategorias.findFirst({
      where: and(eq(gastoCategorias.id, input.categoriaId), eq(gastoCategorias.activo, true)),
      columns: { id: true },
    })
    if (!categoria) {
      return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 400 })
    }

    if (input.proveedorId) {
      const proveedor = await db.query.proveedores.findFirst({
        where: and(eq(proveedores.id, input.proveedorId), eq(proveedores.activo, true)),
        columns: { id: true },
      })
      if (!proveedor) {
        return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 400 })
      }
    }

    const [gasto] = await db
      .insert(gastos)
      .values({
        fecha: parseFechaAR(input.fecha),
        categoriaId: input.categoriaId,
        monto: input.monto.toFixed(2),
        descripcion: input.descripcion ?? null,
        proveedorId: input.proveedorId ?? null,
        comprobante: input.comprobante ?? null,
        metodoPago: input.metodoPago ?? null,
        registradoPor: session.user.id,
      })
      .returning()

    return NextResponse.json({ data: gasto }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
