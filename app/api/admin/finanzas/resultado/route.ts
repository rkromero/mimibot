import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pedidos, gastos, gastoCategorias } from '@/db/schema'
import { eq, and, isNull, gte, lt, inArray, sql } from 'drizzle-orm'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { rangoMesAR } from '@/lib/dates'

// Criterio devengado: la venta cuenta cuando el pedido queda confirmado
// (o más avanzado), no cuando se cobra. Pendientes y cancelados no son venta.
const ESTADOS_VENTA = ['confirmado', 'listo_para_repartir', 'en_reparto', 'entregado'] as const

type ResultadoMes = {
  ventas: string
  cantidadPedidos: number
  costoDirecto: string
  gastoOperativo: string
  margenBruto: string
  resultadoNeto: string
}

async function calcularResultado(mes: string): Promise<ResultadoMes | null> {
  const rango = rangoMesAR(mes)
  if (!rango) return null

  const [ventasRow] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${pedidos.total}), 0)::text`,
      cantidad: sql<number>`count(*)::int`,
    })
    .from(pedidos)
    .where(and(
      isNull(pedidos.deletedAt),
      inArray(pedidos.estado, [...ESTADOS_VENTA]),
      gte(pedidos.fecha, rango.desde),
      lt(pedidos.fecha, rango.hasta),
    ))

  const gastosRows = await db
    .select({
      tipo: gastoCategorias.tipo,
      total: sql<string>`COALESCE(SUM(${gastos.monto}), 0)::text`,
    })
    .from(gastos)
    .innerJoin(gastoCategorias, eq(gastos.categoriaId, gastoCategorias.id))
    .where(and(
      isNull(gastos.deletedAt),
      gte(gastos.fecha, rango.desde),
      lt(gastos.fecha, rango.hasta),
    ))
    .groupBy(gastoCategorias.tipo)

  const ventas = parseFloat(ventasRow?.total ?? '0')
  const costoDirecto = parseFloat(gastosRows.find((g) => g.tipo === 'costo_directo')?.total ?? '0')
  const gastoOperativo = parseFloat(gastosRows.find((g) => g.tipo === 'gasto_operativo')?.total ?? '0')
  const margenBruto = ventas - costoDirecto
  const resultadoNeto = margenBruto - gastoOperativo

  return {
    ventas: ventas.toFixed(2),
    cantidadPedidos: ventasRow?.cantidad ?? 0,
    costoDirecto: costoDirecto.toFixed(2),
    gastoOperativo: gastoOperativo.toFixed(2),
    margenBruto: margenBruto.toFixed(2),
    resultadoNeto: resultadoNeto.toFixed(2),
  }
}

function mesAnteriorDe(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  const prevY = m === 1 ? y! - 1 : y!
  const prevM = m === 1 ? 12 : m! - 1
  return `${prevY}-${String(prevM).padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)

    const mes = req.nextUrl.searchParams.get('mes')
    if (!mes) return NextResponse.json({ error: 'Falta el parámetro mes (YYYY-MM)' }, { status: 400 })

    const actual = await calcularResultado(mes)
    if (!actual) return NextResponse.json({ error: 'Mes inválido (YYYY-MM)' }, { status: 400 })
    const anterior = await calcularResultado(mesAnteriorDe(mes))

    return NextResponse.json({ data: { mes, actual, anterior } })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
