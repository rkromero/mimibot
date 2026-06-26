import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireAdminOrGerente } from '@/lib/authz'
import { db } from '@/db'
import { pedidos } from '@/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { toApiError, NotFoundError, ConflictError } from '@/lib/errors'
import { validateUuidParam } from '@/lib/api/validate-params'

/**
 * POST /api/admin/pedidos/[id]/liberar-reparto
 *
 * Saca un pedido de un repartidor y lo devuelve al pool (listo_para_repartir)
 * para que pueda volver a tomarse. Solo admin/gerente.
 *
 * "Aceptar" un pedido no genera movimientos de CC ni toca stock, así que
 * liberar es una simple reversión de estado: no hay nada que revertir más allá
 * de los campos de asignación.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdminOrGerente(session.user)

    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid

    const current = await db.query.pedidos.findFirst({
      where: and(eq(pedidos.id, id), isNull(pedidos.deletedAt)),
      columns: { id: true, estado: true },
    })
    if (!current) throw new NotFoundError('Pedido')

    if (current.estado !== 'en_reparto') {
      throw new ConflictError('Solo se puede liberar un pedido en reparto')
    }

    const [updated] = await db
      .update(pedidos)
      .set({
        estado: 'listo_para_repartir',
        repartidorId: null,
        aceptadoAt: null,
        ordenRuta: null,
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
