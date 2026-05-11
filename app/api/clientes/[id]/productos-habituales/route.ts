import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pedidos, pedidoItems, productos } from '@/db/schema'
import { eq, and, isNull, desc, sql } from 'drizzle-orm'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id: clienteId } = await params

    const rows = await db
      .select({
        productoId: pedidoItems.productoId,
        nombre: productos.nombre,
        precio: productos.precio,
        sku: productos.sku,
        categoria: productos.categoria,
        veces: sql<number>`count(*)::int`,
      })
      .from(pedidoItems)
      .innerJoin(pedidos, eq(pedidoItems.pedidoId, pedidos.id))
      .innerJoin(productos, eq(pedidoItems.productoId, productos.id))
      .where(
        and(
          eq(pedidos.clienteId, clienteId),
          isNull(pedidos.deletedAt),
          eq(productos.activo, true),
          isNull(productos.deletedAt),
        ),
      )
      .groupBy(
        pedidoItems.productoId,
        productos.nombre,
        productos.precio,
        productos.sku,
        productos.categoria,
      )
      .orderBy(desc(sql`count(*)`))
      .limit(10)

    const data = rows.map((r) => ({
      id: r.productoId,
      nombre: r.nombre,
      precio: r.precio,
      sku: r.sku,
      categoria: r.categoria,
      stockActual: 0,
      stockMinimo: 0,
      bajoCritico: false,
    }))

    return NextResponse.json({ data })
  } catch (err) {
    console.error('[productos-habituales]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
