import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pedidos } from '@/db/schema'
import { eq, and, isNull, desc, sql } from 'drizzle-orm'
import { toApiError, AuthzError } from '@/lib/errors'

export async function GET() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const role = session.user.role
    if (role !== 'repartidor' && role !== 'admin' && role !== 'gerente' && role !== 'fabrica') {
      throw new AuthzError('Solo repartidor, fabrica, admin o gerente pueden acceder a este endpoint')
    }

    // Repartidores y fábrica ven solo sus pedidos aceptados; admin/gerente ven todos
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

    const data = await db.query.pedidos.findMany({
      where: whereClause,
      // Orden óptimo de reparto primero (orden_ruta asc); los sin optimizar
      // (orden_ruta NULL) van al final, ordenados por fecha desc.
      orderBy: [sql`${pedidos.ordenRuta} asc nulls last`, desc(pedidos.fecha)],
      columns: {
        id: true,
        fecha: true,
        total: true,
        saldoPendiente: true,
        estado: true,
        estadoPago: true,
        esReparto: true,
        metodoEntrega: true,
        expresoNombre: true,
        expresoDireccion: true,
        ordenRuta: true,
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
            telefono: true,
            lat: true,
            lng: true,
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

    return NextResponse.json({ data })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
