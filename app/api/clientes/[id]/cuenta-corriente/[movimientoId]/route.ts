import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/authz'
import { canAccessCliente } from '@/lib/authz/clientes'
import { deleteMovimientoCC } from '@/lib/delete/delete.service'
import { toApiError } from '@/lib/errors'
import { validateUuidParam } from '@/lib/api/validate-params'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; movimientoId: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    requireAdmin(session.user)

    const { id, movimientoId } = await params
    const invalidId = validateUuidParam(id)
    if (invalidId) return invalidId
    const invalidMov = validateUuidParam(movimientoId)
    if (invalidMov) return invalidMov
    await canAccessCliente(session.user, id)

    await deleteMovimientoCC(movimientoId, session.user.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
