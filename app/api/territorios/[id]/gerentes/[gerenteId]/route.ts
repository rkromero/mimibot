import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { quitarGerente } from '@/lib/territorios/territorios.service'

type RouteCtx = { params: Promise<{ id: string; gerenteId: string }> }

export async function DELETE(_req: NextRequest, { params }: RouteCtx) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    requireAdmin(session.user)

    const { id: territorioId, gerenteId } = await params
    await quitarGerente(territorioId, gerenteId)
    return NextResponse.json({ data: { ok: true } })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
