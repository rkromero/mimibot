import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { movimientosCC, pedidos, clientes } from '@/db/schema'
import { eq, desc, sql } from 'drizzle-orm'
import { registrarPagoSchema } from '@/lib/validations/pedidos'
import { registrarPago } from '@/lib/cuenta-corriente/pago.service'
import { canAccessCliente } from '@/lib/authz/clientes'
import { toApiError, NotFoundError } from '@/lib/errors'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    await canAccessCliente(session.user, id)

    const cliente = await db.query.clientes.findFirst({
      where: eq(clientes.id, id),
      columns: { id: true },
    })
    if (!cliente) throw new NotFoundError('Cliente')

    // Fetch movements in chronological desc order
    const movimientos = await db.query.movimientosCC.findMany({
      where: eq(movimientosCC.clienteId, id),
      with: {
        registradoPor: { columns: { id: true, name: true } },
        pedido: { columns: { id: true, total: true, estado: true } },
      },
      orderBy: [desc(movimientosCC.fecha)],
    })

    // Calculate saldo: positive = debe al negocio, negative = saldo a favor del cliente
    // creditos = pagos recibidos (reducen deuda)
    // debitos = ventas/cargos (aumentan deuda)
    let saldo = 0
    for (const m of movimientos) {
      const monto = parseFloat(m.monto)
      if (m.tipo === 'debito') {
        saldo += monto
      } else {
        saldo -= monto
      }
    }

    // Fetch pedidos with pending balance info
    const pedidosPendientes = await db.query.pedidos.findMany({
      where: eq(pedidos.clienteId, id),
      columns: {
        id: true,
        total: true,
        montoPagado: true,
        saldoPendiente: true,
        estado: true,
        estadoPago: true,
        fecha: true,
      },
      orderBy: [desc(pedidos.fecha)],
    })

    return NextResponse.json({
      data: {
        movimientos,
        saldo,
        saldoLabel: saldo > 0 ? 'debe' : saldo < 0 ? 'a_favor' : 'saldado',
        pedidos: pedidosPendientes,
      },
    })
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

    const cliente = await db.query.clientes.findFirst({
      where: eq(clientes.id, id),
      columns: { id: true },
    })
    if (!cliente) throw new NotFoundError('Cliente')

    const body: unknown = await req.json()
    const parsed = registrarPagoSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const result = await registrarPago(
      {
        clienteId: id,
        monto: parsed.data.monto,
        descripcion: parsed.data.descripcion ?? null,
        fecha: parsed.data.fecha ? new Date(parsed.data.fecha) : new Date(),
        registradoPor: session.user.id,
      },
      db,
    )

    return NextResponse.json({ data: result }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
