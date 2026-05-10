import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { createTerritorioSchema } from '@/lib/validations/territorios'
import { listarTerritorios, crearTerritorio } from '@/lib/territorios/territorios.service'
import { getSessionContext } from '@/lib/territorios/context'

export async function GET(_req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    if (session.user.role === 'agent') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const ctx = await getSessionContext(session.user)
    const data = await listarTerritorios(ctx)
    return NextResponse.json({ data })
  } catch (err) {
    const { message, status } = toApiError(err)
    const detail = process.env.NODE_ENV !== 'production' && err instanceof Error ? err.stack : undefined
    return NextResponse.json({ error: message, detail }, { status })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    requireAdmin(session.user)

    const body: unknown = await req.json()
    const parsed = createTerritorioSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const territorio = await crearTerritorio(parsed.data, session.user.id)
    return NextResponse.json({ data: territorio }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    const detail = process.env.NODE_ENV !== 'production' && err instanceof Error ? err.stack : undefined
    return NextResponse.json({ error: message, detail }, { status })
  }
}
