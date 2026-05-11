import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { stockMovements, productos } from '@/db/schema'
import { eq, sql, isNull, and } from 'drizzle-orm'
import { toApiError } from '@/lib/errors'

export async function GET(_req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // Simpler approach: get all products and their latest movement
    const productosActivos = await db
      .select({
        id: productos.id,
        sku: productos.sku,
        nombre: productos.nombre,
        categoria: productos.categoria,
        unidadVenta: productos.unidadVenta,
        stockMinimo: productos.stockMinimo,
        activo: productos.activo,
      })
      .from(productos)
      .where(and(isNull(productos.deletedAt), eq(productos.activo, true)))
      .orderBy(productos.nombre)

    // For each product, get the latest stock movement
    const result = await Promise.all(
      productosActivos.map(async (p) => {
        const [latest] = await db
          .select({
            saldoResultante: stockMovements.saldoResultante,
            ultimoMovimiento: stockMovements.createdAt,
          })
          .from(stockMovements)
          .where(eq(stockMovements.productoId, p.id))
          .orderBy(sql`${stockMovements.createdAt} DESC`)
          .limit(1)

        return {
          ...p,
          stockActual: latest?.saldoResultante ?? 0,
          ultimoMovimiento: latest?.ultimoMovimiento ?? null,
          bajoCritico: (latest?.saldoResultante ?? 0) < p.stockMinimo,
        }
      }),
    )

    return NextResponse.json({ data: result })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
