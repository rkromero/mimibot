import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireAdminOrGerente } from '@/lib/authz'
import { db } from '@/db'
import { pedidos, clientes, users, movimientosCC } from '@/db/schema'
import { eq, and, isNull, gte, lte, desc, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { toApiError } from '@/lib/errors'

const repartidoresT = alias(users, 'repartidores')
const cobradoresT = alias(users, 'cobradores')

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

    const metodosConditions = [
      eq(pedidos.estado, 'entregado'),
      isNull(pedidos.deletedAt),
      eq(movimientosCC.tipo, 'credito'),
      isNull(movimientosCC.deletedAt),
    ]
    if (desde) metodosConditions.push(gte(pedidos.entregadoAt, new Date(`${desde}T00:00:00.000Z`)))
    if (hasta) metodosConditions.push(lte(pedidos.entregadoAt, new Date(`${hasta}T23:59:59.999Z`)))
    if (repartidorId) metodosConditions.push(eq(pedidos.entregadoPor, repartidorId))

    const [data, repartidores, metodosPago] = await Promise.all([
      db
        .select({
          id: pedidos.id,
          entregadoAt: pedidos.entregadoAt,
          total: pedidos.total,
          montoPagado: pedidos.montoPagado,
          saldoPendiente: pedidos.saldoPendiente,
          firmaUrl: pedidos.firmaUrl,
          estadoPago: pedidos.estadoPago,
          pagoCobradoAt: pedidos.pagoCobradoAt,
          cobradorNombre: cobradoresT.name,
          clienteNombre: clientes.nombre,
          clienteApellido: clientes.apellido,
          clienteLocalidad: clientes.localidad,
          repartidorNombre: repartidoresT.name,
          repartidorId: pedidos.entregadoPor,
        })
        .from(pedidos)
        .leftJoin(clientes, eq(pedidos.clienteId, clientes.id))
        .leftJoin(repartidoresT, eq(pedidos.entregadoPor, repartidoresT.id))
        .leftJoin(cobradoresT, eq(pedidos.pagoCobradoPor, cobradoresT.id))
        .where(and(...conditions))
        .orderBy(desc(pedidos.entregadoAt)),

      db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.role, 'repartidor'))
        .orderBy(users.name),

      db
        .select({
          repartidorId: pedidos.entregadoPor,
          metodoPago: movimientosCC.metodoPago,
          total: sql<string>`COALESCE(SUM(${movimientosCC.monto}), 0)`,
        })
        .from(movimientosCC)
        .innerJoin(pedidos, eq(movimientosCC.pedidoId, pedidos.id))
        .where(and(...metodosConditions))
        .groupBy(pedidos.entregadoPor, movimientosCC.metodoPago),
    ])

    return NextResponse.json({ data, repartidores, metodosPago })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
