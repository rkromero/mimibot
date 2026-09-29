import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { validateUuidParam } from '@/lib/api/validate-params'
import { detalleEnvio } from '@/lib/envios-masivos/detalle'
import { cancelarEnvioMasivo } from '@/lib/envios-masivos/crear'

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/admin/envios-masivos/[id] — detalle con destinatarios, tildes y respuestas. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)
    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid
    return NextResponse.json({ data: await detalleEnvio(id) })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

/** DELETE /api/admin/envios-masivos/[id] — cancela un envío programado o en curso. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)
    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid
    return NextResponse.json({ data: await cancelarEnvioMasivo(id) })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
