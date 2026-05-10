import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { clientes, users } from '@/db/schema'
import { eq, and, ilike, or, isNull } from 'drizzle-orm'
import { createClienteSchema, clienteFiltersSchema } from '@/lib/validations/clientes'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const params = Object.fromEntries(req.nextUrl.searchParams)
    const filters = clienteFiltersSchema.safeParse(params)
    if (!filters.success) {
      return NextResponse.json({ error: 'Filtros inválidos' }, { status: 400 })
    }

    const { search, asignadoA } = filters.data

    const conditions: ReturnType<typeof eq>[] = [
      isNull(clientes.deletedAt) as ReturnType<typeof eq>,
    ]

    // Agents only see their own clients
    if (session.user.role === 'agent') {
      conditions.push(eq(clientes.asignadoA, session.user.id))
    } else if (asignadoA) {
      // Admin can filter by asignadoA
      conditions.push(eq(clientes.asignadoA, asignadoA))
    }

    if (search) {
      conditions.push(
        or(
          ilike(clientes.nombre, `%${search}%`),
          ilike(clientes.apellido, `%${search}%`),
          ilike(clientes.email, `%${search}%`),
          ilike(clientes.cuit, `%${search}%`),
        ) as ReturnType<typeof eq>,
      )
    }

    const rows = await db
      .select({
        cliente: clientes,
        asignadoAUser: {
          id: users.id,
          name: users.name,
          avatarColor: users.avatarColor,
        },
      })
      .from(clientes)
      .leftJoin(users, eq(clientes.asignadoA, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(clientes.createdAt)

    const data = rows.map((r) => ({
      ...r.cliente,
      asignadoNombre: r.asignadoAUser?.id ? r.asignadoAUser.name : null,
      asignadoColor: r.asignadoAUser?.id ? r.asignadoAUser.avatarColor : null,
    }))

    return NextResponse.json({ data })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body: unknown = await req.json()
    const parsed = createClienteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 })
    }

    const input = parsed.data

    // Determine asignadoA: agents always assign to themselves
    let asignadoA: string = session.user.id
    if (session.user.role === 'admin' && input.asignadoA) {
      asignadoA = input.asignadoA
    }

    const [cliente] = await db
      .insert(clientes)
      .values({
        nombre: input.nombre,
        apellido: input.apellido,
        email: input.email ?? null,
        telefono: input.telefono ?? null,
        direccion: input.direccion ?? null,
        cuit: input.cuit ?? null,
        origen: 'manual',
        asignadoA,
        creadoPor: session.user.id,
      })
      .returning()

    return NextResponse.json({ data: cliente }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
