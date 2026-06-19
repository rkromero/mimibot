import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pedidos, pedidoItems, productos, marcas } from '@/db/schema'
import { eq, and, isNull, sum, asc, countDistinct } from 'drizzle-orm'
import { toApiError, AuthzError } from '@/lib/errors'

// Número de unidades individuales que contiene un "display".
// Ajustar según el packaging real del producto.
const DISPLAY_UNIDADES = 1

const FACTOR: Record<string, number> = {
  unidad: 1,
  caja_12: 12,
  caja_24: 24,
  display: DISPLAY_UNIDADES,
}

export async function GET() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const role = session.user.role
    if (role !== 'fabrica' && role !== 'admin' && role !== 'gerente') {
      throw new AuthzError('Solo fábrica, admin o gerente pueden acceder a este endpoint')
    }

    const [rows, countResult] = await Promise.all([
      db
        .select({
          productoId: productos.id,
          sku: productos.sku,
          nombre: productos.nombre,
          descripcion: productos.descripcion,
          unidadVenta: productos.unidadVenta,
          marcaNombre: marcas.nombre,
          cantidadVenta: sum(pedidoItems.cantidad),
        })
        .from(pedidoItems)
        .innerJoin(pedidos, eq(pedidoItems.pedidoId, pedidos.id))
        .innerJoin(productos, eq(pedidoItems.productoId, productos.id))
        .leftJoin(marcas, eq(productos.marcaId, marcas.id))
        .where(and(eq(pedidos.estado, 'confirmado'), isNull(pedidos.deletedAt)))
        .groupBy(productos.id, productos.sku, productos.nombre, productos.descripcion, productos.unidadVenta, marcas.nombre)
        .orderBy(asc(marcas.nombre), asc(productos.nombre)),
      db
        .select({ totalPedidos: countDistinct(pedidos.id) })
        .from(pedidos)
        .where(and(eq(pedidos.estado, 'confirmado'), isNull(pedidos.deletedAt))),
    ])

    const totalPedidos = countResult[0]?.totalPedidos ?? 0

    const data = rows.map((row) => {
      const cantidadVenta = Number(row.cantidadVenta ?? '0')
      const factor = FACTOR[row.unidadVenta] ?? 1
      return {
        productoId: row.productoId,
        sku: row.sku,
        nombre: row.nombre,
        descripcion: row.descripcion,
        unidadVenta: row.unidadVenta,
        marcaNombre: row.marcaNombre ?? null,
        cantidadVenta,
        unidadesIndividuales: cantidadVenta * factor,
      }
    })

    return NextResponse.json({ data, totalPedidos })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
