import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pedidos } from '@/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { toApiError, AuthzError } from '@/lib/errors'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const role = session.user.role
    if (role !== 'repartidor' && role !== 'admin' && role !== 'gerente') {
      throw new AuthzError('Acceso no permitido')
    }

    const { id } = await params

    const pedido = await db.query.pedidos.findFirst({
      where: and(eq(pedidos.id, id), isNull(pedidos.deletedAt)),
      columns: { estadoPago: true, saldoPendiente: true, montoPagado: true },
    })

    if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

    return NextResponse.json({
      estadoPago: pedido.estadoPago,
      saldoPendiente: pedido.saldoPendiente,
      montoPagado: pedido.montoPagado,
    })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
