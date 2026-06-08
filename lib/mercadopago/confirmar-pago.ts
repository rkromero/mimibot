// Server-only. Shared idempotent logic for confirming an approved MP payment.
// Used by the webhook and by the active-polling fallback in estado-pago.

import { db } from '@/db'
import { pedidos, users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { registrarPagoPedido } from '@/lib/cuenta-corriente/pago.service'

export interface MpApprovedPayment {
  id: number
  transaction_amount: number
  external_reference: string | null
}

export interface ConfirmarPagoResult {
  ok: boolean
  alreadyProcessed?: boolean
  pedidoId?: string
}

/**
 * Idempotent: if the pedido already has this mpPaymentId, returns early.
 * Otherwise registers the payment in CC and marks the pedido as 'entregado'.
 */
export async function confirmarPagoPedido(
  payment: MpApprovedPayment,
  fallbackUserId?: string,
): Promise<ConfirmarPagoResult> {
  const pedidoId = payment.external_reference
  if (!pedidoId) {
    console.warn('[confirmarPago] Payment', payment.id, 'has no external_reference')
    return { ok: true }
  }

  const pedido = await db.query.pedidos.findFirst({
    where: eq(pedidos.id, pedidoId),
    columns: { id: true, mpPaymentId: true, entregadoPor: true, entregadoAt: true },
  })

  if (!pedido) {
    console.warn('[confirmarPago] Pedido not found:', pedidoId)
    return { ok: true }
  }

  if (pedido.mpPaymentId === String(payment.id)) {
    return { ok: true, alreadyProcessed: true, pedidoId }
  }

  let registradoPor = pedido.entregadoPor ?? fallbackUserId ?? null
  if (!registradoPor) {
    const admin = await db.query.users.findFirst({
      where: eq(users.role, 'admin'),
      columns: { id: true },
    })
    if (!admin) {
      console.error('[confirmarPago] No registradoPor available for pedido', pedidoId)
      return { ok: false }
    }
    registradoPor = admin.id
  }

  const monto = payment.transaction_amount.toFixed(2)
  await registrarPagoPedido({
    pedidoId,
    monto,
    metodoPago: 'mercadopago',
    registradoPor,
  })

  await db
    .update(pedidos)
    .set({
      estado: 'entregado',
      entregadoAt: pedido.entregadoAt ?? new Date(),
      mpPaymentId: String(payment.id),
      updatedAt: new Date(),
    })
    .where(eq(pedidos.id, pedidoId))

  console.info('[confirmarPago] Payment', payment.id, 'applied to pedido', pedidoId, '— monto', monto)
  return { ok: true, pedidoId }
}
