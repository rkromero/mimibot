import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { toApiError } from '@/lib/errors'
import { cotizacionInputSchema } from '@/lib/validations/cotizador'
import { armarSnapshotCotizador } from '@/lib/cotizador/snapshot'
import { calcularEscenarios } from '@/lib/cotizador/escenarios'

// Calcula y devuelve el desglose con sus 3 escenarios. No persiste nada:
// es el cálculo en vivo del modal de cotización.
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body: unknown = await req.json()
    const parsed = cotizacionInputSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const snapshot = await armarSnapshotCotizador()
    const escenarios = calcularEscenarios(parsed.data, snapshot)

    return NextResponse.json({
      data: {
        escenarios,
        requiereAprobacion: parsed.data.descuentoManualPct > snapshot.topeDescuentoPct,
        topeDescuentoPct: snapshot.topeDescuentoPct,
        validezDias: snapshot.validezDias,
      },
    })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
