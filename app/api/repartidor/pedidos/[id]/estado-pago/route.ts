import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pedidos } from '@/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { toApiError, AuthzError } from '@/lib/errors'
import { searchApprovedPaymentByExternalRef } from '@/lib/mercadopago/client'
import { confirmarPagoPedido } from '@/lib/mercadopago/confirmar-pago'
import { esRolReparto } from '@/lib/authz/roles'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const role = session.user.role
    if (!esRolReparto(role) && role !== 'admin' && role !== 'gerente') {
      throw new AuthzError('Acceso no permitido')
    }

    const { id } = await params

    const pedido = await db.query.pedidos.findFirst({
      where: and(eq(pedidos.id, id), isNull(pedidos.deletedAt)),
      columns: { estadoPago: true, saldoPendiente: true, montoPagado: true },
    })

    if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

    // If already paid, return immediately
    const saldo = parseFloat(pedido.saldoPendiente ?? '0')
    if (pedido.estadoPago === 'pagado' || saldo <= 0) {
      return NextResponse.json({
        estadoPago: pedido.estadoPago,
        saldoPendiente: pedido.saldoPendiente,
        montoPagado: pedido.montoPagado,
      })
    }

    // Active fallback: query MP directly for an approved payment
    try {
      const mpPayment = await searchApprovedPaymentByExternalRef(id)
      if (mpPayment) {
        await confirmarPagoPedido(mpPayment, session.user.id)

        // Re-read the updated state
        const updated = await db.query.pedidos.findFirst({
          where: and(eq(pedidos.id, id), isNull(pedidos.deletedAt)),
          columns: { estadoPago: true, saldoPendiente: true, montoPagado: true },
        })
        if (updated) {
          return NextResponse.json({
            estadoPago: updated.estadoPago,
            saldoPendiente: updated.saldoPendiente,
            montoPagado: updated.montoPagado,
          })
        }
      }
    } catch (mpErr) {
      console.warn('[estado-pago] MP search failed for pedido', id, ':', mpErr)
    }

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
