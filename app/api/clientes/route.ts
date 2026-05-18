import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { clientes, users, territorios } from '@/db/schema'
import { eq, and, ilike, or, isNull, inArray, asc, desc, sql } from 'drizzle-orm'
import { createClienteSchema, clienteFiltersSchema } from '@/lib/validations/clientes'
import { toApiError } from '@/lib/errors'
import { getSessionContext } from '@/lib/territorios/context'
import { resolverTerritorioPorRol } from '@/lib/territorios/asignacion.service'
import { parsePagination } from '@/lib/api/pagination'
import type { Paginated } from '@/lib/types/pagination'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const ctx = await getSessionContext(session.user)

    const { page, limit, sortBy, sortDir, search } = parsePagination(
      req.nextUrl.searchParams,
      { sortBy: 'createdAt', sortDir: 'desc' },
    )

    const params = Object.fromEntries(req.nextUrl.searchParams)
    const filters = clienteFiltersSchema.safeParse(params)
    if (!filters.success) {
      return NextResponse.json({ error: 'Filtros inválidos' }, { status: 400 })
    }
    const { asignadoA, territorioId, estadoActividad } = filters.data

    const conditions: ReturnType<typeof eq>[] = [
      isNull(clientes.deletedAt) as ReturnType<typeof eq>,
    ]

    if (ctx.role === 'agent') {
      conditions.push(eq(clientes.asignadoA, ctx.userId))
    } else if (ctx.role === 'gerente') {
      if (ctx.territoriosGestionados.length === 0) {
        return NextResponse.json<Paginated<unknown>>({ data: [], page: 1, limit, total: 0, totalPages: 0 })
      }
      const scopeTerritorioId = territorioId && ctx.territoriosGestionados.includes(territorioId)
        ? [territorioId]
        : ctx.territoriosGestionados
      conditions.push(
        inArray(clientes.territorioId, scopeTerritorioId) as ReturnType<typeof eq>,
      )
      if (asignadoA && ctx.agentesVisibles.includes(asignadoA)) {
        conditions.push(eq(clientes.asignadoA, asignadoA))
      }
    } else {
      if (asignadoA) conditions.push(eq(clientes.asignadoA, asignadoA))
      if (territorioId) conditions.push(eq(clientes.territorioId, territorioId))
    }

    if (estadoActividad) {
      conditions.push(eq(clientes.estadoActividad, estadoActividad))
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

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    const [countRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(clientes)
      .where(whereClause)

    const total = countRow?.total ?? 0
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit)

    const sortCol = (() => {
      switch (sortBy) {
        case 'nombre': return clientes.nombre
        case 'apellido': return clientes.apellido
        case 'email': return clientes.email
        default: return clientes.createdAt
      }
    })()
    const orderFn = sortDir === 'asc' ? asc : desc

    const rows = await db
      .select({
        cliente: clientes,
        asignadoAUser: {
          id: users.id,
          name: users.name,
          avatarColor: users.avatarColor,
        },
        territorio: {
          id: territorios.id,
          nombre: territorios.nombre,
        },
      })
      .from(clientes)
      .leftJoin(users, eq(clientes.asignadoA, users.id))
      .leftJoin(territorios, eq(clientes.territorioId, territorios.id))
      .where(whereClause)
      .orderBy(orderFn(sortCol))
      .limit(limit)
      .offset((page - 1) * limit)

    const data = rows.map((r) => ({
      ...r.cliente,
      asignadoNombre: r.asignadoAUser?.id ? r.asignadoAUser.name : null,
      asignadoColor: r.asignadoAUser?.id ? r.asignadoAUser.avatarColor : null,
      territorioNombre: r.territorio?.id ? r.territorio.nombre : null,
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

    const ctx = await getSessionContext(session.user)

    const body: unknown = await req.json()
    const parsed = createClienteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const input = parsed.data

    const { territorioId, agenteId } = await resolverTerritorioPorRol(
      ctx,
      input.territorioId,
    )

    let asignadoA: string | null = null
    if (ctx.role === 'agent') {
      asignadoA = ctx.userId
    } else if (ctx.role === 'admin' && input.asignadoA) {
      asignadoA = input.asignadoA
    } else if (agenteId) {
      asignadoA = agenteId
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
        territorioId,
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
