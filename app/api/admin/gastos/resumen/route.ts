import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { gastos, gastoCategorias } from '@/db/schema'
import { eq, and, isNull, gte, lt, desc, sql } from 'drizzle-orm'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { rangoMesAR } from '@/lib/dates'

// Resumen del mes: total general, por tipo (costo directo / gasto operativo)
// y desglose por categoría — la vista con la que se controla el gasto mensual.
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)

    const mes = req.nextUrl.searchParams.get('mes')
    if (!mes) return NextResponse.json({ error: 'Falta el parámetro mes (YYYY-MM)' }, { status: 400 })
    const rango = rangoMesAR(mes)
    if (!rango) return NextResponse.json({ error: 'Mes inválido (YYYY-MM)' }, { status: 400 })

    const porCategoria = await db
      .select({
        categoriaId: gastoCategorias.id,
        nombre: gastoCategorias.nombre,
        tipo: gastoCategorias.tipo,
        total: sql<string>`COALESCE(SUM(${gastos.monto}), 0)::text`,
        cantidad: sql<number>`count(*)::int`,
      })
      .from(gastos)
      .innerJoin(gastoCategorias, eq(gastos.categoriaId, gastoCategorias.id))
      .where(and(
        isNull(gastos.deletedAt),
        gte(gastos.fecha, rango.desde),
        lt(gastos.fecha, rango.hasta),
      ))
      .groupBy(gastoCategorias.id, gastoCategorias.nombre, gastoCategorias.tipo)
      .orderBy(desc(sql`SUM(${gastos.monto})`))

    let total = 0
    let costoDirecto = 0
    let gastoOperativo = 0
    for (const c of porCategoria) {
      const monto = parseFloat(c.total)
      total += monto
      if (c.tipo === 'costo_directo') costoDirecto += monto
      else gastoOperativo += monto
    }

    return NextResponse.json({
      data: {
        mes,
        total: total.toFixed(2),
        costoDirecto: costoDirecto.toFixed(2),
        gastoOperativo: gastoOperativo.toFixed(2),
        porCategoria,
      },
    })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
