import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { getEmbudo } from '@/lib/admin/embudo.service'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_RANGO_DIAS = 92
const MS_POR_DIA = 24 * 60 * 60 * 1000

function parseOptionalUuid(value: string | null): { value: string | undefined; invalid: boolean } {
  if (value === null) return { value: undefined, invalid: false }
  if (UUID_RE.test(value)) return { value, invalid: false }
  return { value: undefined, invalid: true }
}

/**
 * Parses a YYYY-MM-DD string into a local-midnight Date (consistent with the
 * rest of the admin dashboard). Returns null for malformed or impossible dates.
 */
function parseFecha(value: string | null): Date | null {
  if (value === null || !FECHA_RE.test(value)) return null
  const [y, m, d] = value.split('-').map(Number) as [number, number, number]
  const date = new Date(y, m - 1, d)
  // Reject overflow (e.g. 2026-02-30, month 13) by checking the round-trip.
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null
  return date
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)

    const { searchParams } = new URL(req.url)

    const desde = parseFecha(searchParams.get('desde'))
    const hasta = parseFecha(searchParams.get('hasta'))

    if (!desde || !hasta) {
      return NextResponse.json(
        { error: 'Fechas inválidas (formato esperado YYYY-MM-DD)' },
        { status: 400 },
      )
    }
    if (hasta.getTime() <= desde.getTime()) {
      return NextResponse.json(
        { error: 'El rango es inválido: "hasta" debe ser posterior a "desde"' },
        { status: 400 },
      )
    }
    if (Math.round((hasta.getTime() - desde.getTime()) / MS_POR_DIA) > MAX_RANGO_DIAS) {
      return NextResponse.json(
        { error: `El rango no puede superar ${MAX_RANGO_DIAS} días` },
        { status: 400 },
      )
    }

    const territorioResult = parseOptionalUuid(searchParams.get('territorioId'))
    const gerenteResult = parseOptionalUuid(searchParams.get('gerenteId'))
    const vendedorResult = parseOptionalUuid(searchParams.get('vendedorId'))

    if (territorioResult.invalid || gerenteResult.invalid || vendedorResult.invalid) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
    }

    const data = await getEmbudo({
      desde,
      hasta,
      territorioId: territorioResult.value,
      gerenteId: gerenteResult.value,
      vendedorId: vendedorResult.value,
    })

    return NextResponse.json({ data })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
