import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireAdminOrGerente } from '@/lib/authz'
import { db } from '@/db'
import { pedidos, clientes, users } from '@/db/schema'
import { eq, and, isNull, gte, lte, desc } from 'drizzle-orm'
import { toApiError } from '@/lib/errors'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdminOrGerente(session.user)

    const { searchParams } = req.nextUrl
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')
    const repartidorId = searchParams.get('repartidorId')

    const conditions = [
      eq(pedidos.estado, 'entregado'),
      isNull(pedidos.deletedAt),
    ]

    if (desde) conditions.push(gte(pedidos.entregadoAt, new Date(`${desde}T00:00:00.000Z`)))
    if (hasta) conditions.push(lte(pedidos.entregadoAt, new Date(`${hasta}T23:59:59.999Z`)))
    if (repartidorId) conditions.push(eq(pedidos.entregadoPor, repartidorId))

    const [data, repartidores] = await Promise.all([
      db
        .select({
          id: pedidos.id,
          entregadoAt: pedidos.entregadoAt,
          total: pedidos.total,
          firmaUrl: pedidos.firmaUrl,
          clienteNombre: clientes.nombre,
          clienteApellido: clientes.apellido,
          clienteLocalidad: clientes.localidad,
          repartidorNombre: users.name,
          repartidorId: pedidos.entregadoPor,
        })
        .from(pedidos)
        .leftJoin(clientes, eq(pedidos.clienteId, clientes.id))
        .leftJoin(users, eq(pedidos.entregadoPor, users.id))
        .where(and(...conditions))
        .orderBy(desc(pedidos.entregadoAt)),

      db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.role, 'repartidor'))
        .orderBy(users.name),
    ])

    return NextResponse.json({ data, repartidores })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
