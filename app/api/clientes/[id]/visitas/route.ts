import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { actividadesCliente } from '@/db/schema'
import { registrarVisitaSchema } from '@/lib/validations/actividades'
import { canAccessCliente } from '@/lib/authz/clientes'
import { toApiError } from '@/lib/errors'
import { validateUuidParam } from '@/lib/api/validate-params'

const RESULTADO_LABEL: Record<string, string> = {
  compro: 'Compró',
  no_compro: 'No compró',
  no_estaba: 'No estaba',
  reprogramar: 'Reprogramar',
}

/**
 * Registra una visita a un cliente (Fase 1 — backend).
 *
 * Crea una actividad tipo='visita', estado='completada' con el resultado y la
 * geolocalización (lat/lng/precisión) si vienen. Si el resultado es
 * 'reprogramar' y se envía `proximaVisita`, además crea una segunda actividad
 * tipo='visita', estado='pendiente' programada para esa fecha.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid
    await canAccessCliente(session.user, id)

    const body: unknown = await req.json()
    const parsed = registrarVisitaSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const { resultado, notas, lat, lng, precision, proximaVisita } = parsed.data
    const userId = session.user.id

    const actividades = await db.transaction(async (tx) => {
      const [visita] = await tx
        .insert(actividadesCliente)
        .values({
          clienteId: id,
          tipo: 'visita',
          titulo: `Visita - ${RESULTADO_LABEL[resultado] ?? resultado}`,
          notas: notas ?? null,
          estado: 'completada',
          resultado,
          fechaCompletada: new Date(),
          lat: lat != null ? String(lat) : null,
          lng: lng != null ? String(lng) : null,
          geoPrecision: precision != null ? String(precision) : null,
          asignadoA: userId,
          creadoPor: userId,
        })
        .returning()

      const creadas = [visita!]

      // Reprogramación: crear la próxima visita como actividad pendiente futura.
      if (resultado === 'reprogramar' && proximaVisita) {
        const [pendiente] = await tx
          .insert(actividadesCliente)
          .values({
            clienteId: id,
            tipo: 'visita',
            titulo: 'Visita reprogramada',
            estado: 'pendiente',
            fechaProgramada: new Date(proximaVisita),
            asignadoA: userId,
            creadoPor: userId,
          })
          .returning()
        creadas.push(pendiente!)
      }

      return creadas
    })

    return NextResponse.json({ data: actividades }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
