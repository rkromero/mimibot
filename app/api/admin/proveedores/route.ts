import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { proveedores } from '@/db/schema'
import { eq, and, asc, desc, ilike, or, sql } from 'drizzle-orm'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { createProveedorSchema } from '@/lib/validations/gastos'
import { parsePagination } from '@/lib/api/pagination'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)

    const { page, limit, sortBy, sortDir, search } = parsePagination(
      req.nextUrl.searchParams,
      { sortBy: 'nombre', sortDir: 'asc' },
    )

    const conditions = [eq(proveedores.activo, true)]
    if (search) {
      conditions.push(
        or(
          ilike(proveedores.nombre, `%${search}%`),
          ilike(proveedores.cuit, `%${search}%`),
        ) as typeof conditions[number],
      )
    }
    const whereClause = and(...conditions)

    const [countRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(proveedores)
      .where(whereClause)

    const total = countRow?.total ?? 0
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit)

    const sortCol = sortBy === 'createdAt' ? proveedores.createdAt : proveedores.nombre
    const orderFn = sortDir === 'desc' ? desc : asc

    const data = await db
      .select()
      .from(proveedores)
      .where(whereClause)
      .orderBy(orderFn(sortCol))
      .limit(limit)
      .offset((page - 1) * limit)

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
    const parsed = createProveedorSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const existente = await db.query.proveedores.findFirst({
      where: eq(proveedores.nombre, parsed.data.nombre),
      columns: { id: true, activo: true },
    })
    if (existente?.activo) {
      return NextResponse.json({ error: 'Ya existe un proveedor con ese nombre' }, { status: 409 })
    }
    // Si existía dado de baja, se reactiva con los datos nuevos
    if (existente) {
      const [reactivado] = await db
        .update(proveedores)
        .set({ ...parsed.data, activo: true, updatedAt: new Date() })
        .where(eq(proveedores.id, existente.id))
        .returning()
      return NextResponse.json({ data: reactivado }, { status: 201 })
    }

    const [proveedor] = await db
      .insert(proveedores)
      .values(parsed.data)
      .returning()

    return NextResponse.json({ data: proveedor }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
