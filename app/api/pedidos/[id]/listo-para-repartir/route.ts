import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pedidos } from '@/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { toApiError, AuthzError, NotFoundError, ConflictError } from '@/lib/errors'
import { validateUuidParam } from '@/lib/api/validate-params'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const role = session.user.role
    if (role !== 'fabrica' && role !== 'admin') {
      throw new AuthzError('Solo fábrica o admin pueden ejecutar esta transición')
    }

    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid

    const current = await db.query.pedidos.findFirst({
      where: and(eq(pedidos.id, id), isNull(pedidos.deletedAt)),
      columns: { id: true, estado: true, esReparto: true, metodoEntrega: true },
    })
    if (!current) throw new NotFoundError('Pedido')

    if (current.estado !== 'confirmado') {
      throw new ConflictError(
        `El pedido está en estado '${current.estado}'. Solo se puede marcar listo_para_repartir desde 'confirmado'.`,
      )
    }

    if (!current.esReparto && current.metodoEntrega !== 'expreso') {
      throw new ConflictError(
        'Solo pedidos de camioneta o expreso pueden pasar a listo_para_repartir.',
      )
    }

    const [updated] = await db
      .update(pedidos)
      .set({ estado: 'listo_para_repartir', updatedAt: new Date() })
      .where(eq(pedidos.id, id))
      .returning()

    return NextResponse.json({ data: updated })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
