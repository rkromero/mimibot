import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pedidos } from '@/db/schema'
import { eq, and, isNull, desc } from 'drizzle-orm'
import { z } from 'zod'
import { toApiError, AuthzError } from '@/lib/errors'
import { optimizarRuta, type Parada } from '@/lib/geo/route-optimizer.service'

const bodySchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
})

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const role = session.user.role
    if (role !== 'repartidor' && role !== 'admin' && role !== 'gerente' && role !== 'fabrica') {
      throw new AuthzError('Solo repartidor, fabrica, admin o gerente pueden optimizar la ruta')
    }

    const raw: unknown = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Ubicación inválida: lat (-90..90) y lng (-180..180) deben ser números válidos' },
        { status: 400 },
      )
    }
    const origen = { lat: parsed.data.lat, lng: parsed.data.lng }

    // Repartidor y fábrica solo optimizan sus propios pedidos; admin/gerente, todos.
    const whereClause = (role === 'repartidor' || role === 'fabrica')
      ? and(
          isNull(pedidos.deletedAt),
          eq(pedidos.estado, 'en_reparto'),
          eq(pedidos.repartidorId, session.user.id),
        )
      : and(
          isNull(pedidos.deletedAt),
          eq(pedidos.estado, 'en_reparto'),
        )

    const rows = await db.query.pedidos.findMany({
      where: whereClause,
      columns: { id: true },
      orderBy: [desc(pedidos.fecha)],
      with: {
        cliente: {
          columns: { lat: true, lng: true },
        },
      },
    })

    // Separar pedidos con coordenadas (van al optimizador) de los que no las tienen
    // (quedan al final, en su orden actual).
    const conCoords: Parada[] = []
    const sinCoords: string[] = []
    for (const row of rows) {
      const lat = row.cliente?.lat
      const lng = row.cliente?.lng
      if (lat != null && lng != null) {
        conCoords.push({ pedidoId: row.id, lat, lng })
      } else {
        sinCoords.push(row.id)
      }
    }

    const ordenOptimo = await optimizarRuta(origen, conCoords)
    // Los pedidos sin ubicación continúan la numeración después de los optimizados.
    const ordenFinal = [...ordenOptimo, ...sinCoords]

    // Persistir orden_ruta 1..N en una transacción.
    await db.transaction(async (tx) => {
      for (let i = 0; i < ordenFinal.length; i++) {
        const pedidoId = ordenFinal[i]
        if (!pedidoId) continue
        await tx
          .update(pedidos)
          .set({ ordenRuta: i + 1, updatedAt: new Date() })
          .where(eq(pedidos.id, pedidoId))
      }
    })

    return NextResponse.json({
      data: { ordenados: ordenOptimo.length, sinUbicacion: sinCoords.length },
    })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
