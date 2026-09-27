import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { armarTablero } from '@/lib/tablero/consultas'

/**
 * GET /api/admin/tablero?mes=YYYY-MM — Tablero de comando (solo admin):
 * resultado del mes con semáforo, punto de equilibrio y proyección, caja y
 * deuda, ventas por marca / vendedor, embudo comercial y gastos por categoría.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)

    const mes = req.nextUrl.searchParams.get('mes')
    if (!mes) return NextResponse.json({ error: 'Falta el parámetro mes (YYYY-MM)' }, { status: 400 })

    const data = await armarTablero(mes)
    if (!data) return NextResponse.json({ error: 'Mes inválido (YYYY-MM)' }, { status: 400 })

    return NextResponse.json({ data })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
