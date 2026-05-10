import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pedidos, clientes, users } from '@/db/schema'
import { eq, and, or, inArray } from 'drizzle-orm'
import { createPedidoSchema } from '@/lib/validations/pedidos'
import { crearPedidoConItems } from '@/lib/pedidos/service'
import { toApiError, AuthzError, NotFoundError } from '@/lib/errors'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const searchParams = req.nextUrl.searchParams
    const clienteId = searchParams.get('clienteId') ?? undefined
    const estado = searchParams.get('estado') ?? undefined
    const estadoPago = searchParams.get('estadoPago') ?? undefined

    // For agents: find their own clients first, then filter pedidos
    let clienteIdsForAgent: string[] | undefined
    if (session.user.role === 'agent') {
      const agentClientes = await db
        .select({ id: clientes.id })
        .from(clientes)
        .where(eq(clientes.asignadoA, session.user.id))
      clienteIdsForAgent = agentClientes.map((c) => c.id)
    }

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
        const conditions: ReturnType<typeof eq>[] = []

        if (session.user.role === 'agent') {
          // Agents see pedidos where vendedor = self OR cliente.asignadoA = self
          const agentConditions = [eq(pedidos.vendedorId, session.user.id)]
          if (clienteIdsForAgent && clienteIdsForAgent.length > 0) {
            agentConditions.push(inArray(pedidos.clienteId, clienteIdsForAgent) as ReturnType<typeof eq>)
          }
          conditions.push(or(...agentConditions) as ReturnType<typeof eq>)
        }

        if (clienteId) conditions.push(eq(pedidos.clienteId, clienteId))
        if (estado) conditions.push(eq(pedidos.estado, estado as typeof pedidos.$inferSelect['estado']))
        if (estadoPago) conditions.push(eq(pedidos.estadoPago, estadoPago as typeof pedidos.$inferSelect['estadoPago']))

        return conditions.length > 0 ? and(...conditions) : undefined
      })
      .orderBy(pedidos.fecha)

    const data = rows.map((r) => ({
      ...r.pedido,
      cliente: r.cliente,
      vendedor: r.vendedor,
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
    const parsed = createPedidoSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 })
    }

    const input = parsed.data

    // Agents can only create pedidos for their own clients
    if (session.user.role === 'agent') {
      const cliente = await db.query.clientes.findFirst({
        where: and(
          eq(clientes.id, input.clienteId),
          eq(clientes.asignadoA, session.user.id),
        ),
        columns: { id: true },
      })
      if (!cliente) {
        throw new AuthzError('Solo podés crear pedidos para tus propios clientes')
      }
    } else {
      // Admin: verify cliente exists
      const cliente = await db.query.clientes.findFirst({
        where: eq(clientes.id, input.clienteId),
        columns: { id: true },
      })
      if (!cliente) throw new NotFoundError('Cliente')
    }

    const pedido = await crearPedidoConItems(
      input.clienteId,
      session.user.id,
      input.fecha ?? null,
      input.observaciones ?? null,
      input.items,
    )

    return NextResponse.json({ data: pedido }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
