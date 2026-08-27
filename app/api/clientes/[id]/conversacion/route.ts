import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { toApiError } from '@/lib/errors'
import { ensureConversacionParaCliente } from '@/lib/inbox/ensure-conversacion'
import { validateUuidParam } from '@/lib/api/validate-params'
import { canAccessCliente } from '@/lib/authz/clientes'

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

    // Misma regla que la ficha del cliente: ventas su cartera, gerente su territorio.
    await canAccessCliente(session.user, id)

    const result = await ensureConversacionParaCliente(id)
    return NextResponse.json({ data: result })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
