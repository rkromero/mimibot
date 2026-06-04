import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { stockMovements, productos } from '@/db/schema'
import { eq, sql, isNull, and, asc, desc, inArray } from 'drizzle-orm'
import { parsePagination } from '@/lib/api/pagination'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { page, limit, sortBy, sortDir } = parsePagination(req.nextUrl.searchParams, {
      page: 1,
      limit: 50,
      sortBy: 'nombre',
      sortDir: 'asc',
    })

    const whereClause = and(isNull(productos.deletedAt), eq(productos.activo, true))

    const [countRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(productos)
      .where(whereClause)

    const total = countRow?.total ?? 0
    const totalPages = Math.max(1, Math.ceil(total / limit))
    const orderFn = sortDir === 'asc' ? asc : desc
    const sortCol =
      sortBy === 'sku' ? productos.sku :
      sortBy === 'categoria' ? productos.categoria :
      productos.nombre

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
      .where(whereClause)
      .orderBy(orderFn(sortCol))
      .limit(limit)
      .offset((page - 1) * limit)

    // Single DISTINCT ON query replaces the N+1 (one per product) pattern
    const productoIds = productosActivos.map((p) => p.id)
    const latestMovements = productoIds.length > 0
      ? await db
          .selectDistinctOn([stockMovements.productoId], {
            productoId: stockMovements.productoId,
            saldoResultante: stockMovements.saldoResultante,
            createdAt: stockMovements.createdAt,
          })
          .from(stockMovements)
          .where(inArray(stockMovements.productoId, productoIds))
          .orderBy(asc(stockMovements.productoId), desc(stockMovements.createdAt))
      : []

    const movMap = new Map(latestMovements.map((m) => [m.productoId, m]))

    const result = productosActivos.map((p) => {
      const latest = movMap.get(p.id)
      return {
        ...p,
        stockActual: latest?.saldoResultante ?? 0,
        ultimoMovimiento: latest?.createdAt ?? null,
        bajoCritico: (latest?.saldoResultante ?? 0) < p.stockMinimo,
      }
    })

    return NextResponse.json({ data: result, page, limit, total, totalPages })
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : String(err)
    console.error('[stock/saldos] DB error, returning empty fallback:', rawMessage, err)
    return NextResponse.json({ data: [], page: 1, limit: 50, total: 0, totalPages: 1, _degraded: true }, { status: 200 })
  }
}
