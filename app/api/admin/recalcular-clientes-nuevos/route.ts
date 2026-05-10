import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/authz'
import { recalcularClientesNuevos } from '@/lib/clientes/actividad.service'
import { toApiError } from '@/lib/errors'

export async function POST() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)

    const result = await recalcularClientesNuevos()

    return NextResponse.json({ data: result })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
