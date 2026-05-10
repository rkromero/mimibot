import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { asignarAgenteSchema } from '@/lib/validations/territorios'
import { asignarAgente, desasignarAgente } from '@/lib/territorios/territorios.service'
import { sincronizarAgenteEnTerritorioClientes } from '@/lib/territorios/asignacion.service'

type RouteCtx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: RouteCtx) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    requireAdmin(session.user)

    const { id: territorioId } = await params
    const body: unknown = await req.json()
    const parsed = asignarAgenteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const row = await asignarAgente(territorioId, parsed.data.agenteId)

    // Sync all clients in the territory to the new agent
    await sincronizarAgenteEnTerritorioClientes(territorioId, parsed.data.agenteId)

    return NextResponse.json({ data: row }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteCtx) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    requireAdmin(session.user)

    const { id: territorioId } = await params
    await desasignarAgente(territorioId)

    // Clients stay in territory but agent becomes null
    await sincronizarAgenteEnTerritorioClientes(territorioId, null)

    return NextResponse.json({ data: { ok: true } })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
