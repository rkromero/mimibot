import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { movimientosCC, gastos } from '@/db/schema'
import { eq, and, isNull, gte, lt, sql } from 'drizzle-orm'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { rangoMesAR } from '@/lib/dates'

// Criterio caja (plata real): ingresos = cobranzas registradas (créditos de
// cuenta corriente); egresos = gastos registrados. A diferencia del Resultado
// (devengado), acá cuenta cuándo entra/sale la plata, no cuándo se vende.

type PorMetodo = Record<string, string>

async function totalesPorMetodo(
  mes: string,
): Promise<{ ingresos: { total: string; porMetodo: PorMetodo }; egresos: { total: string; porMetodo: PorMetodo } } | null> {
  const rango = rangoMesAR(mes)
  if (!rango) return null

  const ingresosRows = await db
    .select({
      metodo: movimientosCC.metodoPago,
      total: sql<string>`COALESCE(SUM(${movimientosCC.monto}), 0)::text`,
    })
    .from(movimientosCC)
    .where(and(
      eq(movimientosCC.tipo, 'credito'),
      isNull(movimientosCC.deletedAt),
      gte(movimientosCC.fecha, rango.desde),
      lt(movimientosCC.fecha, rango.hasta),
    ))
    .groupBy(movimientosCC.metodoPago)

  const egresosRows = await db
    .select({
      metodo: gastos.metodoPago,
      total: sql<string>`COALESCE(SUM(${gastos.monto}), 0)::text`,
    })
    .from(gastos)
    .where(and(
      isNull(gastos.deletedAt),
      gte(gastos.fecha, rango.desde),
      lt(gastos.fecha, rango.hasta),
    ))
    .groupBy(gastos.metodoPago)

  function agrupar(rows: Array<{ metodo: string | null; total: string }>) {
    const porMetodo: PorMetodo = {}
    let total = 0
    for (const r of rows) {
      const monto = parseFloat(r.total)
      total += monto
      porMetodo[r.metodo ?? 'sin_especificar'] = monto.toFixed(2)
    }
    return { total: total.toFixed(2), porMetodo }
  }

  return { ingresos: agrupar(ingresosRows), egresos: agrupar(egresosRows) }
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)

    const mes = req.nextUrl.searchParams.get('mes')
    if (!mes) return NextResponse.json({ error: 'Falta el parámetro mes (YYYY-MM)' }, { status: 400 })
    const rango = rangoMesAR(mes)
    if (!rango) return NextResponse.json({ error: 'Mes inválido (YYYY-MM)' }, { status: 400 })

    const totales = await totalesPorMetodo(mes)
    if (!totales) return NextResponse.json({ error: 'Mes inválido (YYYY-MM)' }, { status: 400 })

    // Serie semanal: ingresos y egresos agrupados por semana (lunes) del mes
    const ingresosSemana = await db
      .select({
        semana: sql<string>`date_trunc('week', ${movimientosCC.fecha})::date::text`,
        total: sql<string>`COALESCE(SUM(${movimientosCC.monto}), 0)::text`,
      })
      .from(movimientosCC)
      .where(and(
        eq(movimientosCC.tipo, 'credito'),
        isNull(movimientosCC.deletedAt),
        gte(movimientosCC.fecha, rango.desde),
        lt(movimientosCC.fecha, rango.hasta),
      ))
      .groupBy(sql`date_trunc('week', ${movimientosCC.fecha})`)

    const egresosSemana = await db
      .select({
        semana: sql<string>`date_trunc('week', ${gastos.fecha})::date::text`,
        total: sql<string>`COALESCE(SUM(${gastos.monto}), 0)::text`,
      })
      .from(gastos)
      .where(and(
        isNull(gastos.deletedAt),
        gte(gastos.fecha, rango.desde),
        lt(gastos.fecha, rango.hasta),
      ))
      .groupBy(sql`date_trunc('week', ${gastos.fecha})`)

    const semanas = new Map<string, { ingresos: number; egresos: number }>()
    for (const r of ingresosSemana) {
      const s = semanas.get(r.semana) ?? { ingresos: 0, egresos: 0 }
      s.ingresos += parseFloat(r.total)
      semanas.set(r.semana, s)
    }
    for (const r of egresosSemana) {
      const s = semanas.get(r.semana) ?? { ingresos: 0, egresos: 0 }
      s.egresos += parseFloat(r.total)
      semanas.set(r.semana, s)
    }
    const porSemana = [...semanas.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([semana, s]) => ({
        semana,
        ingresos: s.ingresos.toFixed(2),
        egresos: s.egresos.toFixed(2),
        neto: (s.ingresos - s.egresos).toFixed(2),
      }))

    // Mes anterior para comparar
    const [y, m] = mes.split('-').map(Number)
    const prevMes = `${m === 1 ? y! - 1 : y!}-${String(m === 1 ? 12 : m! - 1).padStart(2, '0')}`
    const anterior = await totalesPorMetodo(prevMes)

    const neto = (parseFloat(totales.ingresos.total) - parseFloat(totales.egresos.total)).toFixed(2)
    const netoAnterior = anterior
      ? (parseFloat(anterior.ingresos.total) - parseFloat(anterior.egresos.total)).toFixed(2)
      : null

    return NextResponse.json({
      data: {
        mes,
        ingresos: totales.ingresos,
        egresos: totales.egresos,
        neto,
        porSemana,
        anterior: anterior
          ? { ingresos: anterior.ingresos.total, egresos: anterior.egresos.total, neto: netoAnterior }
          : null,
      },
    })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
