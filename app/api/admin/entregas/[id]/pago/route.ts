import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { requireAdminOrGerente } from '@/lib/authz'
import { db } from '@/db'
import { pedidos } from '@/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { toApiError } from '@/lib/errors'

const bodySchema = z.object({
  estadoPago: z.enum(['impago', 'parcial', 'pagado']),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdminOrGerente(session.user)

    const { id } = await params
    const body = bodySchema.safeParse(await req.json())
    if (!body.success) {
      return NextResponse.json({ error: 'Cuerpo inválido', details: body.error.flatten() }, { status: 400 })
    }
    const { estadoPago } = body.data

    const pedido = await db.query.pedidos.findFirst({
      where: and(eq(pedidos.id, id), isNull(pedidos.deletedAt)),
      columns: { id: true, estado: true },
    })

    if (!pedido) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    }
    if (pedido.estado !== 'entregado') {
      return NextResponse.json(
        { error: 'El pedido no está en estado entregado' },
        { status: 409 },
      )
    }

    const cobradoPor = estadoPago !== 'impago' ? session.user.id : null
    const cobradoAt = estadoPago !== 'impago' ? new Date() : null

    const [updated] = await db
      .update(pedidos)
      .set({
        estadoPago,
        pagoCobradoPor: cobradoPor,
        pagoCobradoAt: cobradoAt,
        updatedAt: new Date(),
      })
      .where(eq(pedidos.id, id))
      .returning()

    return NextResponse.json({ data: updated })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
