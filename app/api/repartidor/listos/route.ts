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
      ),
      orderBy: [desc(pedidos.fecha)],
      columns: {
        id: true,
        fecha: true,
        total: true,
        esReparto: true,
        metodoEntrega: true,
        expresoNombre: true,
        expresoDireccion: true,
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

    const camioneta = todos.filter((p) => p.esReparto)
    const expreso = todos.filter((p) => !p.esReparto && p.metodoEntrega === 'expreso')

    // conUbicacion / sinUbicacion solo aplican a camioneta (para el cálculo de ruta)
    const conUbicacion = camioneta.filter(
      (p) => p.cliente?.lat != null && p.cliente?.lng != null && p.cliente?.geocodeStatus !== 'failed',
    )
    const sinUbicacion = camioneta.filter(
      (p) => p.cliente?.lat == null || p.cliente?.lng == null || p.cliente?.geocodeStatus === 'failed',
    )

    return NextResponse.json({ camioneta, expreso, conUbicacion, sinUbicacion })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
