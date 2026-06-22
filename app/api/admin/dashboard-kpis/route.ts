import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { getAdminDashboardStats, type Granularidad } from '@/lib/admin/dashboard.service'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const GRANULARIDADES: Granularidad[] = ['dia', 'semana', 'mes']

function parseOptionalUuid(value: string | null): { value: string | undefined; invalid: boolean } {
  if (value === null) return { value: undefined, invalid: false }
  if (UUID_RE.test(value)) return { value, invalid: false }
  return { value: undefined, invalid: true }
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)

    const { searchParams } = new URL(req.url)
    const g = searchParams.get('granularidad') ?? 'dia'
    if (!GRANULARIDADES.includes(g as Granularidad)) {
      return NextResponse.json({ error: 'granularidad debe ser "dia", "semana" o "mes"' }, { status: 400 })
    }

    const territorioResult = parseOptionalUuid(searchParams.get('territorioId'))
    const gerenteResult = parseOptionalUuid(searchParams.get('gerenteId'))

    if (territorioResult.invalid || gerenteResult.invalid) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
    }

    const filtros =
      territorioResult.value !== undefined || gerenteResult.value !== undefined
        ? { territorioId: territorioResult.value, gerenteId: gerenteResult.value }
        : undefined

    const data = await getAdminDashboardStats(g as Granularidad, filtros)
    return NextResponse.json({ data })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
