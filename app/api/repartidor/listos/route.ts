import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pedidos } from '@/db/schema'
import { eq, and, isNull, desc } from 'drizzle-orm'
import { toApiError, AuthzError } from '@/lib/errors'

export async function GET() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const role = session.user.role
    if (role !== 'repartidor' && role !== 'admin' && role !== 'gerente') {
      throw new AuthzError('Solo repartidor, admin o gerente pueden acceder a este endpoint')
    }

    const todos = await db.query.pedidos.findMany({
      where: and(
        isNull(pedidos.deletedAt),
        eq(pedidos.estado, 'listo_para_repartir'),
        eq(pedidos.esReparto, true),
      ),
      orderBy: [desc(pedidos.fecha)],
      columns: {
        id: true,
        fecha: true,
        total: true,
      },
      with: {
        cliente: {
          columns: {
            id: true,
            nombre: true,
            apellido: true,
            direccion: true,
            localidad: true,
            provincia: true,
            lat: true,
            lng: true,
            geocodeStatus: true,
          },
        },
        items: {
          with: {
            producto: {
              columns: { id: true, nombre: true, sku: true },
            },
          },
        },
      },
    })

    // Fase 2 ORS: separar pedidos con/sin coordenadas para el cálculo de ruta.
    // Los pedidos cuyo cliente no tiene lat/lng o tiene geocodeStatus='failed'
    // se excluyen del cálculo de ruta y se listan aparte para corrección.
    const conUbicacion = todos.filter(
      (p) => p.cliente?.lat != null && p.cliente?.lng != null && p.cliente?.geocodeStatus !== 'failed',
    )
    const sinUbicacion = todos.filter(
      (p) => p.cliente?.lat == null || p.cliente?.lng == null || p.cliente?.geocodeStatus === 'failed',
    )

    return NextResponse.json({ data: todos, conUbicacion, sinUbicacion })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
