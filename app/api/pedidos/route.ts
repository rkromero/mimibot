import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pedidos, clientes, users } from '@/db/schema'
import { eq, and, inArray, isNull } from 'drizzle-orm'
import { createPedidoSchema } from '@/lib/validations/pedidos'
import { crearPedidoConItems } from '@/lib/pedidos/service'
import { toApiError, AuthzError, NotFoundError } from '@/lib/errors'
import { getSessionContext } from '@/lib/territorios/context'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const ctx = await getSessionContext(session.user)

    const searchParams = req.nextUrl.searchParams
    const clienteId = searchParams.get('clienteId') ?? undefined
    const estado = searchParams.get('estado') ?? undefined
    const estadoPago = searchParams.get('estadoPago') ?? undefined
    // Selector "Ver por agente" para gerente/admin (filtra por clientes
    // asignados a ese agente, no por pedidos.vendedorId — así el filtro
    // refleja el estado actual de la asignación, no el histórico).
    const filterVendedorId = searchParams.get('vendedorId') ?? undefined

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
      .where(() => {
        const conditions: ReturnType<typeof eq>[] = [
          isNull(pedidos.deletedAt) as ReturnType<typeof eq>,
          isNull(clientes.deletedAt) as ReturnType<typeof eq>,
        ]

        // Regla acordada con el usuario: el agente SOLO ve pedidos cuyo
        // cliente sigue asignado a él HOY. Si reasignan al cliente a otro
        // agente, los pedidos viejos desaparecen de su vista (aunque él
        // siga siendo el `vendedorId` original a efectos de metas).
        // Por eso el filtro es por `clientes.asignadoA`, no por
        // `pedidos.vendedorId`.
        if (ctx.role === 'agent') {
          conditions.push(eq(clientes.asignadoA, ctx.userId))
        } else if (ctx.role === 'gerente') {
          if (ctx.territoriosGestionados.length === 0) return and(...conditions)
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

        return conditions.length > 0 ? and(...conditions) : undefined
      })
      .orderBy(pedidos.fecha)

    const data = rows.map((r) => ({
      ...r.pedido,
      clienteNombre: r.cliente.nombre,
      clienteApellido: r.cliente.apellido,
      vendedorNombre: r.vendedor.name ?? null,
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

    const ctx = await getSessionContext(session.user)

    const body: unknown = await req.json()
    const parsed = createPedidoSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const input = parsed.data

    // Determine vendedorId (quien recibe el crédito para metas) y creadoPor
    let vendedorId: string = session.user.id
    let creadoPor: string | null = null

    if (ctx.role === 'agent') {
      // Agent creates for their own clients
      const cliente = await db.query.clientes.findFirst({
        where: and(
          eq(clientes.id, input.clienteId),
          eq(clientes.asignadoA, session.user.id),
          isNull(clientes.deletedAt),
        ),
        columns: { id: true, territorioId: true },
      })
      if (!cliente) throw new AuthzError('Solo podés crear pedidos para tus propios clientes')

      // Snapshot territory
      var territorioIdImputado = cliente.territorioId ?? null

    } else if (ctx.role === 'gerente') {
      // Gerente loads on behalf of an agent — vendedorId must be provided
      if (!input.vendedorId) {
        throw new AuthzError('El gerente debe indicar el agente (vendedorId) al cargar un pedido')
      }
      if (!ctx.agentesVisibles.includes(input.vendedorId)) {
        throw new AuthzError('Ese agente no pertenece a tus territorios')
      }

      // Verify the client belongs to their territories
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
      // Admin
      const cliente = await db.query.clientes.findFirst({
        where: and(eq(clientes.id, input.clienteId), isNull(clientes.deletedAt)),
        columns: { id: true, territorioId: true },
      })
      if (!cliente) throw new NotFoundError('Cliente')

      if (input.vendedorId) vendedorId = input.vendedorId
      var territorioIdImputado = cliente.territorioId ?? null
    }

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
        // Quien queda registrado como autor del débito de CC y los stock
        // movements es siempre el usuario logueado (la sesión actual),
        // independientemente de a qué vendedor se le acredite la venta.
        registradoPor: session.user.id,
      },
    )

    return NextResponse.json({ data: pedido }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
