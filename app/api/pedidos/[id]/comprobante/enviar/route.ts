export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canAccessCliente } from '@/lib/authz/clientes'
import { toApiError, ValidationError } from '@/lib/errors'
import { validateUuidParam } from '@/lib/api/validate-params'
import {
  buscarPedidoParaComprobante,
  enviarComprobanteEntregaPorWhatsapp,
} from '@/lib/pedidos/enviar-comprobante-whatsapp'

/**
 * POST /api/pedidos/[id]/comprobante/enviar — manda el comprobante de entrega
 * (foto del remito firmado o firma del cliente) como imagen por el WhatsApp
 * embebido a la conversación del cliente. Con la ventana de 24 hs cerrada va
 * como plantilla (Ajustes → WhatsApp → Comprobante de entrega); si no hay
 * plantilla configurada, 422 WINDOW_CLOSED.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid

    const pedido = await buscarPedidoParaComprobante(id)
    if (pedido.estado === 'cancelado') {
      throw new ValidationError('El pedido está cancelado: no se puede enviar el comprobante')
    }

    // Misma regla que la ficha del cliente y el chat: ventas su cartera, gerente su territorio.
    await canAccessCliente(session.user, pedido.clienteId)

    const result = await enviarComprobanteEntregaPorWhatsapp({
      pedido,
      user: { id: session.user.id, name: session.user.name ?? null },
    })

    return NextResponse.json({ data: { via: 'whatsapp', ...result } })
  } catch (err) {
    const { message, code, status } = toApiError(err)
    return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status })
  }
}
