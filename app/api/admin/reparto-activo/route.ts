import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireAdminOrGerente } from '@/lib/authz'
import { db } from '@/db'
import { pedidos, clientes, users } from '@/db/schema'
import { eq, and, isNull, asc, inArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { toApiError } from '@/lib/errors'
import { ROLES_REPARTO } from '@/lib/authz/roles'

const repartidoresT = alias(users, 'repartidores')

/**
 * GET /api/admin/reparto-activo
 *
 * Lista los pedidos que cada repartidor tiene en curso (estado='en_reparto'),
 * con los datos del cliente y del repartidor asignado. Solo admin/gerente.
 *
 * Filtro opcional ?repartidorId= para acotar a un repartidor.
 * Devuelve también la lista de repartidores (para poblar el filtro en la UI).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdminOrGerente(session.user)

    const repartidorId = req.nextUrl.searchParams.get('repartidorId')

    const conditions = [
      eq(pedidos.estado, 'en_reparto'),
      isNull(pedidos.deletedAt),
    ]
    if (repartidorId) conditions.push(eq(pedidos.repartidorId, repartidorId))

    const [data, repartidores] = await Promise.all([
      db
        .select({
          id: pedidos.id,
          fecha: pedidos.fecha,
          total: pedidos.total,
          estadoPago: pedidos.estadoPago,
          metodoEntrega: pedidos.metodoEntrega,
          esReparto: pedidos.esReparto,
          aceptadoAt: pedidos.aceptadoAt,
          clienteNombre: clientes.nombre,
          clienteApellido: clientes.apellido,
          repartidorId: pedidos.repartidorId,
          repartidorNombre: repartidoresT.name,
        })
        .from(pedidos)
        .leftJoin(clientes, eq(pedidos.clienteId, clientes.id))
        .leftJoin(repartidoresT, eq(pedidos.repartidorId, repartidoresT.id))
        .where(and(...conditions))
        .orderBy(asc(repartidoresT.name), asc(pedidos.aceptadoAt)),

      db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.role, [...ROLES_REPARTO]))
        .orderBy(asc(users.name)),
    ])

    return NextResponse.json({ data, repartidores })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
