import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireAdminOrGerente } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { getVisitasStats, type Granularidad } from '@/lib/admin/visitas-stats.service'

const VALIDAS: Granularidad[] = ['dia', 'semana', 'mes']

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdminOrGerente(session.user)

    const g = req.nextUrl.searchParams.get('granularidad') ?? 'dia'
    if (!VALIDAS.includes(g as Granularidad)) {
      return NextResponse.json(
        { error: 'granularidad debe ser "dia", "semana" o "mes"' },
        { status: 400 },
      )
    }

    const data = await getVisitasStats(g as Granularidad)
    return NextResponse.json({ data })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
