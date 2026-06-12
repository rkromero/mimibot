import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { getCohortesSemanales } from '@/lib/admin/embudo.service'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_SEMANAS = 12

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

    let semanas = 4
    const semanasRaw = searchParams.get('semanas')
    if (semanasRaw !== null) {
      const n = parseInt(semanasRaw, 10)
      if (isNaN(n) || n < 1 || n > MAX_SEMANAS) {
        return NextResponse.json({ error: 'Parámetro "semanas" inválido' }, { status: 400 })
      }
      semanas = n
    }

    const territorioResult = parseOptionalUuid(searchParams.get('territorioId'))
    const gerenteResult = parseOptionalUuid(searchParams.get('gerenteId'))
    const vendedorResult = parseOptionalUuid(searchParams.get('vendedorId'))

    if (territorioResult.invalid || gerenteResult.invalid || vendedorResult.invalid) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
    }

    const data = await getCohortesSemanales({
      semanas,
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
