export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pedidos } from '@/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { canAccessCliente } from '@/lib/authz/clientes'
import { toApiError, NotFoundError, ValidationError } from '@/lib/errors'
import { validateUuidParam } from '@/lib/api/validate-params'
import { enviarDocumentoPorWhatsapp } from '@/lib/pedidos/enviar-documento-whatsapp'

// Por ahora solo la proforma (el agente se la manda al cliente para que pague).
const enviarSchema = z.object({
  tipo: z.literal('proforma', { errorMap: () => ({ message: 'El campo "tipo" debe ser "proforma"' }) }),
  via: z.literal('whatsapp', { errorMap: () => ({ message: 'via debe ser whatsapp' }) }),
})

/**
 * POST /api/pedidos/[id]/documentos/enviar — emite la proforma del pedido y la
 * manda como documento por el WhatsApp embebido a la conversación del cliente.
 * 422 WINDOW_CLOSED si el cliente no escribió en las últimas 24 hs.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid

    const body: unknown = await req.json().catch(() => null)
    const parsed = enviarSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const pedido = await db.query.pedidos.findFirst({
      where: and(eq(pedidos.id, id), isNull(pedidos.deletedAt)),
      columns: { id: true, clienteId: true, estado: true },
    })
    if (!pedido) throw new NotFoundError('Pedido')
    if (pedido.estado === 'cancelado') {
      throw new ValidationError('El pedido está cancelado: no se puede enviar la proforma')
    }

    // Misma regla que la ficha del cliente y el chat: ventas su cartera, gerente su territorio.
    await canAccessCliente(session.user, pedido.clienteId)

    const result = await enviarDocumentoPorWhatsapp({
      pedidoId: pedido.id,
      clienteId: pedido.clienteId,
      tipo: parsed.data.tipo,
      userId: session.user.id,
    })

    return NextResponse.json({ data: { via: parsed.data.via, ...result } })
  } catch (err) {
    const { message, code, status } = toApiError(err)
    return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status })
  }
}
