import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { requireAdminOrGerente } from '@/lib/authz'
import { db } from '@/db'
import { pedidos } from '@/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { toApiError } from '@/lib/errors'
import { registrarPagoPedido } from '@/lib/cuenta-corriente/pago.service'

const postSchema = z.object({
  monto: z.number().positive(),
  metodoPago: z.enum(['efectivo', 'transferencia']),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdminOrGerente(session.user)

    const { id } = await params
    const body = postSchema.safeParse(await req.json())
    if (!body.success) {
      return NextResponse.json({ error: 'Cuerpo inválido', details: body.error.flatten() }, { status: 400 })
    }
    const { monto, metodoPago } = body.data

    const pedido = await db.query.pedidos.findFirst({
      where: and(eq(pedidos.id, id), isNull(pedidos.deletedAt)),
      columns: { id: true, estado: true },
    })

    if (!pedido) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    }
    if (pedido.estado !== 'entregado') {
      return NextResponse.json({ error: 'El pedido no está en estado entregado' }, { status: 409 })
    }

    const result = await registrarPagoPedido({
      pedidoId: id,
      monto: monto.toFixed(2),
      metodoPago,
      registradoPor: session.user.id,
    })

    return NextResponse.json({
      data: result.pedidoActualizado,
      sobrante: result.sobrante,
    })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

