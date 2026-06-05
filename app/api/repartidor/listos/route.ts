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

    const data = await db.query.pedidos.findMany({
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
