import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { toApiError } from '@/lib/errors'
import { listarMuestrasPendientesAviso } from '@/lib/leads/muestra-despachada'

/**
 * Muestras CDA entregadas a las que todavía no se le avisó al cliente (ver
 * lib/leads/muestra-aviso.ts). Alimenta el popup al abrir el sistema, el
 * toast en tiempo real y la tarjeta "Muestras por avisar" de Mi día.
 *
 * Alcance por rol: admin todas, gerente las de sus agentes, ventas las suyas.
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const data = await listarMuestrasPendientesAviso(session.user)
    return NextResponse.json({ data, total: data.length })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
