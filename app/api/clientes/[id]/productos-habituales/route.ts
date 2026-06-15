import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pedidos, pedidoItems, productos, marcas } from '@/db/schema'
import { eq, and, isNull, desc, sql } from 'drizzle-orm'
import { validateUuidParam } from '@/lib/api/validate-params'
import { marcaVisibleFilter } from '@/lib/authz/marcas'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id: clienteId } = await params
    const invalid = validateUuidParam(clienteId)
    if (invalid) return invalid

    // Ventas no reciben sugerencias de productos de marcas no habilitadas.
    const marcaFilter = await marcaVisibleFilter(session.user)

    const rows = await db
      .select({
        productoId: pedidoItems.productoId,
        nombre: productos.nombre,
        precio: productos.precio,
        sku: productos.sku,
        categoria: productos.categoria,
        marcaNombre: marcas.nombre,
        veces: sql<number>`count(*)::int`,
      })
      .from(pedidoItems)
      .innerJoin(pedidos, eq(pedidoItems.pedidoId, pedidos.id))
      .innerJoin(productos, eq(pedidoItems.productoId, productos.id))
      .leftJoin(marcas, eq(productos.marcaId, marcas.id))
      .where(
        and(
          eq(pedidos.clienteId, clienteId),
          isNull(pedidos.deletedAt),
          eq(productos.activo, true),
          isNull(productos.deletedAt),
          ...(marcaFilter ? [marcaFilter] : []),
        ),
      )
      .groupBy(
        pedidoItems.productoId,
        productos.nombre,
        productos.precio,
        productos.sku,
        productos.categoria,
        marcas.nombre,
      )
      .orderBy(desc(sql`count(*)`))
      .limit(10)

    const data = rows.map((r) => ({
      id: r.productoId,
      nombre: r.nombre,
      precio: r.precio,
      sku: r.sku,
      categoria: r.categoria,
      marcaNombre: r.marcaNombre ?? null,
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
