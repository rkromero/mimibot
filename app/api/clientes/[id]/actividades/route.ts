import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { actividadesCliente, users } from '@/db/schema'
import { eq, desc, asc, sql } from 'drizzle-orm'
import { createActividadSchema } from '@/lib/validations/actividades'
import { canAccessCliente } from '@/lib/authz/clientes'
import { toApiError } from '@/lib/errors'
import { parsePagination } from '@/lib/api/pagination'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    await canAccessCliente(session.user, id)

    const { page, limit, sortBy, sortDir } = parsePagination(req.nextUrl.searchParams, {
      page: 1,
      limit: 50,
      sortBy: 'fechaProgramada',
      sortDir: 'desc',
    })

    const [countRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(actividadesCliente)
      .where(eq(actividadesCliente.clienteId, id))

    const total = countRow?.total ?? 0
    const totalPages = Math.max(1, Math.ceil(total / limit))
    const orderFn = sortDir === 'asc' ? asc : desc
    const sortCol = sortBy === 'createdAt' ? actividadesCliente.createdAt : actividadesCliente.fechaProgramada

    const rows = await db
      .select({
        actividad: actividadesCliente,
        asignadoNombre: users.name,
        asignadoColor: users.avatarColor,
      })
      .from(actividadesCliente)
      .leftJoin(users, eq(actividadesCliente.asignadoA, users.id))
      .where(eq(actividadesCliente.clienteId, id))
      .orderBy(orderFn(sortCol), desc(actividadesCliente.createdAt))
      .limit(limit)
      .offset((page - 1) * limit)

    const data = rows.map((r) => ({
      ...r.actividad,
      asignadoNombre: r.asignadoNombre,
      asignadoColor: r.asignadoColor,
    }))

    return NextResponse.json({ data, page, limit, total, totalPages })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    await canAccessCliente(session.user, id)

    const body: unknown = await req.json()
    const parsed = createActividadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const { tipo, titulo, notas, fechaProgramada, asignadoA } = parsed.data

    const assignee = session.user.role === 'admin'
      ? (asignadoA ?? session.user.id)
      : session.user.id

    const [actividad] = await db
      .insert(actividadesCliente)
      .values({
        clienteId: id,
        tipo,
        titulo,
        notas: notas ?? null,
        estado: 'pendiente',
        fechaProgramada: fechaProgramada ? new Date(fechaProgramada) : null,
        asignadoA: assignee,
        creadoPor: session.user.id,
      })
      .returning()

    return NextResponse.json({ data: actividad }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
