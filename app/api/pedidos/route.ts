import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pedidos, clientes, users } from '@/db/schema'
import { eq, and, inArray, isNull, asc, desc, sql } from 'drizzle-orm'
import { createPedidoSchema } from '@/lib/validations/pedidos'
import { crearPedidoConItems } from '@/lib/pedidos/service'
import { toApiError, AuthzError, NotFoundError } from '@/lib/errors'
import { getSessionContext } from '@/lib/territorios/context'
import { parsePagination } from '@/lib/api/pagination'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const ctx = await getSessionContext(session.user)

    const { page, limit, sortBy, sortDir } = parsePagination(
      req.nextUrl.searchParams,
      { sortBy: 'fecha', sortDir: 'desc' },
    )

    const searchParams = req.nextUrl.searchParams
    const clienteId = searchParams.get('clienteId') ?? undefined
    const estado = searchParams.get('estado') ?? undefined
    const estadoPago = searchParams.get('estadoPago') ?? undefined
    const filterVendedorId = searchParams.get('vendedorId') ?? undefined

    const conditions: ReturnType<typeof eq>[] = [
      isNull(pedidos.deletedAt) as ReturnType<typeof eq>,
      isNull(clientes.deletedAt) as ReturnType<typeof eq>,
    ]

    if (ctx.role === 'agent') {
      conditions.push(eq(clientes.asignadoA, ctx.userId))
    } else if (ctx.role === 'gerente') {
      if (ctx.territoriosGestionados.length === 0) {
        return NextResponse.json({ data: [], page: 1, limit, total: 0, totalPages: 0 })
      }
      conditions.push(
        inArray(clientes.territorioId, ctx.territoriosGestionados) as ReturnType<typeof eq>,
      )
      if (filterVendedorId && ctx.agentesVisibles.includes(filterVendedorId)) {
        conditions.push(eq(clientes.asignadoA, filterVendedorId) as ReturnType<typeof eq>)
      }
    } else if (ctx.role === 'admin' && filterVendedorId) {
      conditions.push(eq(clientes.asignadoA, filterVendedorId) as ReturnType<typeof eq>)
    }

    if (clienteId) conditions.push(eq(pedidos.clienteId, clienteId))
    if (estado) conditions.push(eq(pedidos.estado, estado as typeof pedidos.$inferSelect['estado']))
    if (estadoPago) conditions.push(eq(pedidos.estadoPago, estadoPago as typeof pedidos.$inferSelect['estadoPago']))

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    const [countRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(pedidos)
      .innerJoin(clientes, eq(pedidos.clienteId, clientes.id))
      .innerJoin(users, eq(pedidos.vendedorId, users.id))
      .where(whereClause)

    const total = countRow?.total ?? 0
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit)

    const sortCol = (() => {
      switch (sortBy) {
        case 'total': return pedidos.total
        case 'estado': return pedidos.estado
        case 'createdAt': return pedidos.createdAt
        default: return pedidos.fecha
      }
    })()
    const orderFn = sortDir === 'asc' ? asc : desc

    const rows = await db
      .select({
        pedido: pedidos,
        cliente: {
          id: clientes.id,
          nombre: clientes.nombre,
          apellido: clientes.apellido,
        },
        vendedor: {
          id: users.id,
          name: users.name,
          avatarColor: users.avatarColor,
        },
      })
      .from(pedidos)
      .innerJoin(clientes, eq(pedidos.clienteId, clientes.id))
      .innerJoin(users, eq(pedidos.vendedorId, users.id))
      .where(whereClause)
      .orderBy(orderFn(sortCol))
      .limit(limit)
      .offset((page - 1) * limit)

    const data = rows.map((r) => ({
      ...r.pedido,
      clienteNombre: r.cliente.nombre,
      clienteApellido: r.cliente.apellido,
      vendedorNombre: r.vendedor.name ?? null,
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
    const parsed = createPedidoSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const input = parsed.data

    let vendedorId: string = session.user.id
    let creadoPor: string | null = null

    if (ctx.role === 'agent') {
      const cliente = await db.query.clientes.findFirst({
        where: and(
          eq(clientes.id, input.clienteId),
          eq(clientes.asignadoA, session.user.id),
          isNull(clientes.deletedAt),
        ),
        columns: { id: true, territorioId: true },
      })
      if (!cliente) throw new AuthzError('Solo podés crear pedidos para tus propios clientes')
      var territorioIdImputado = cliente.territorioId ?? null

    } else if (ctx.role === 'gerente') {
      if (!input.vendedorId) {
        throw new AuthzError('El gerente debe indicar el agente (vendedorId) al cargar un pedido')
      }
      if (!ctx.agentesVisibles.includes(input.vendedorId)) {
        throw new AuthzError('Ese agente no pertenece a tus territorios')
      }

      const cliente = await db.query.clientes.findFirst({
        where: and(
          eq(clientes.id, input.clienteId),
          inArray(clientes.territorioId, ctx.territoriosGestionados),
          isNull(clientes.deletedAt),
        ),
        columns: { id: true, territorioId: true },
      })
      if (!cliente) throw new AuthzError('Ese cliente no pertenece a tus territorios')

      vendedorId = input.vendedorId
      creadoPor = session.user.id
      var territorioIdImputado = cliente.territorioId ?? null

    } else {
      const cliente = await db.query.clientes.findFirst({
        where: and(eq(clientes.id, input.clienteId), isNull(clientes.deletedAt)),
        columns: { id: true, territorioId: true },
      })
      if (!cliente) throw new NotFoundError('Cliente')

      if (input.vendedorId) vendedorId = input.vendedorId
      var territorioIdImputado = cliente.territorioId ?? null
    }

    // Los pedidos creados por agentes nacen en 'pendiente_aprobacion'
    const crearComoPendienteAprobacion = ctx.role === 'agent'

    const pedido = await crearPedidoConItems(
      input.clienteId,
      vendedorId,
      input.fecha ?? null,
      input.observaciones ?? null,
      input.items,
      db,
      {
        creadoPor,
        territorioIdImputado,
        registradoPor: session.user.id,
        crearComoPendienteAprobacion,
      },
    )

    return NextResponse.json({ data: pedido }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
