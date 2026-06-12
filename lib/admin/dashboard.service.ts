import { db } from '@/db'
import { pedidos, pedidoItems, territorioGerente, clientes } from '@/db/schema'
import { and, gte, lt, isNull, sql, eq, inArray, count } from 'drizzle-orm'

export interface DayDataPoint {
  day: number
  primerPedido: number
  clienteNuevo: number
}

export interface AdminDashboardStats {
  chartData: DayDataPoint[]
  productosVendidos: number
  carteraActiva: number
  mesNombre: string
  clientesCreadosPorDia: Array<{ day: number; total: number; conPedido: number }>
}

export const MESES_NOMBRES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/**
 * Builds a pedidoId → rank (1-based) map within each client's paid order history,
 * sorted ascending by fecha. Exported for unit testing.
 */
export function buildRankMap(
  orders: Array<{ id: string; clienteId: string; fecha: Date | null }>,
): Map<string, number> {
  const byCliente = new Map<string, Array<{ id: string; ts: number }>>()

  for (const o of orders) {
    if (!byCliente.has(o.clienteId)) byCliente.set(o.clienteId, [])
    byCliente.get(o.clienteId)!.push({ id: o.id, ts: o.fecha?.getTime() ?? 0 })
  }

  const rankMap = new Map<string, number>()
  for (const [, list] of byCliente) {
    list.sort((a, b) => a.ts - b.ts)
    list.forEach((o, idx) => rankMap.set(o.id, idx + 1))
  }
  return rankMap
}

/**
 * Given a rank map and the current-month paid orders, fills a chartData array
 * (indexed by day - 1) with primerPedido (rank 1) and clienteNuevo (rank 3) counts.
 * Exported for unit testing.
 */
export function aggregateChartData(
  chartData: DayDataPoint[],
  pedidosMes: Array<{ id: string; fecha: Date | null }>,
  rankMap: Map<string, number>,
): void {
  const diasEnMes = chartData.length
  for (const p of pedidosMes) {
    const rank = rankMap.get(p.id)
    const day = p.fecha?.getDate()
    if (day == null) continue
    const idx = day - 1
    if (idx < 0 || idx >= diasEnMes) continue
    const point = chartData[idx]
    if (!point) continue
    if (rank === 1) point.primerPedido++
    if (rank === 3) point.clienteNuevo++
  }
}

export async function getAdminDashboardStats(
  anio: number,
  mes: number,
  filtros?: { territorioId?: string; gerenteId?: string },
): Promise<AdminDashboardStats> {
  const mesStart = new Date(anio, mes - 1, 1)
  const mesEnd = new Date(anio, mes, 1)
  const diasEnMes = new Date(anio, mes, 0).getDate()

  // Resolve territory filter condition
  let territorioIds: string[] | null = null

  if (filtros?.territorioId) {
    territorioIds = [filtros.territorioId]
  } else if (filtros?.gerenteId) {
    const rows = await db
      .select({ territorioId: territorioGerente.territorioId })
      .from(territorioGerente)
      .where(eq(territorioGerente.gerenteId, filtros.gerenteId))
    if (rows.length === 0) {
      return {
        chartData: Array.from({ length: diasEnMes }, (_, i) => ({ day: i + 1, primerPedido: 0, clienteNuevo: 0 })),
        productosVendidos: 0,
        carteraActiva: 0,
        mesNombre: MESES_NOMBRES[mes - 1] ?? '',
        clientesCreadosPorDia: Array.from({ length: diasEnMes }, (_, i) => ({ day: i + 1, total: 0, conPedido: 0 })),
      }
    }
    territorioIds = rows.map((r) => r.territorioId)
  }

  const territorioCondition =
    territorioIds !== null
      ? territorioIds.length === 1
        ? eq(pedidos.territorioIdImputado, territorioIds[0]!)
        : inArray(pedidos.territorioIdImputado, territorioIds)
      : undefined

  const territorioConditionClientes =
    territorioIds !== null
      ? territorioIds.length === 1
        ? eq(clientes.territorioId, territorioIds[0]!)
        : inArray(clientes.territorioId, territorioIds)
      : undefined

  const chartData: DayDataPoint[] = Array.from({ length: diasEnMes }, (_, i) => ({
    day: i + 1,
    primerPedido: 0,
    clienteNuevo: 0,
  }))

  // Paid orders this month (filtered by territory when applicable)
  const pedidosMes = await db
    .select({ id: pedidos.id, clienteId: pedidos.clienteId, fecha: pedidos.fecha })
    .from(pedidos)
    .where(
      and(
        isNull(pedidos.deletedAt),
        eq(pedidos.estadoPago, 'pagado'),
        gte(pedidos.fecha, mesStart),
        lt(pedidos.fecha, mesEnd),
        territorioCondition,
      ),
    )

  if (pedidosMes.length > 0) {
    const clienteIds = [...new Set(pedidosMes.map((p) => p.clienteId))]

    // All paid orders for those clients (all time, global — no territory filter)
    const allPaid = await db
      .select({ id: pedidos.id, clienteId: pedidos.clienteId, fecha: pedidos.fecha })
      .from(pedidos)
      .where(
        and(
          isNull(pedidos.deletedAt),
          eq(pedidos.estadoPago, 'pagado'),
          inArray(pedidos.clienteId, clienteIds),
        ),
      )

    const rankMap = buildRankMap(allPaid)
    aggregateChartData(chartData, pedidosMes, rankMap)
  }

  // Sum of product units in paid orders this month (filtered by territory)
  const [productosRow] = await db
    .select({ total: sql<number>`coalesce(sum(${pedidoItems.cantidad}), 0)::int` })
    .from(pedidoItems)
    .innerJoin(pedidos, eq(pedidoItems.pedidoId, pedidos.id))
    .where(
      and(
        isNull(pedidos.deletedAt),
        eq(pedidos.estadoPago, 'pagado'),
        gte(pedidos.fecha, mesStart),
        lt(pedidos.fecha, mesEnd),
        territorioCondition,
      ),
    )

  // Pending receivables (impago + parcial) in orders from this month (filtered by territory)
  const [carteraRow] = await db
    .select({ total: sql<string>`coalesce(sum(${pedidos.saldoPendiente}::numeric), 0)` })
    .from(pedidos)
    .where(
      and(
        isNull(pedidos.deletedAt),
        sql`${pedidos.estadoPago} IN ('impago', 'parcial')`,
        gte(pedidos.fecha, mesStart),
        lt(pedidos.fecha, mesEnd),
        territorioCondition,
      ),
    )

  // Clients created this month grouped by day (filtered by territory when applicable)
  const creadosPorDiaRows = await db
    .select({
      day: sql<number>`extract(day from ${clientes.createdAt})::int`,
      total: count(),
    })
    .from(clientes)
    .where(
      and(
        gte(clientes.createdAt, mesStart),
        lt(clientes.createdAt, mesEnd),
        isNull(clientes.deletedAt),
        territorioConditionClientes,
      ),
    )
    .groupBy(sql`extract(day from ${clientes.createdAt})`)

  // Clients created this month with at least one non-deleted order placed on the
  // same calendar day they were created (filtered by territory when applicable)
  const conPedidoMismoDiaRows = await db
    .select({
      day: sql<number>`extract(day from ${clientes.createdAt})::int`,
      conPedido: sql<number>`count(distinct ${clientes.id})::int`,
    })
    .from(clientes)
    .innerJoin(pedidos, eq(pedidos.clienteId, clientes.id))
    .where(
      and(
        gte(clientes.createdAt, mesStart),
        lt(clientes.createdAt, mesEnd),
        isNull(clientes.deletedAt),
        isNull(pedidos.deletedAt),
        sql`date(${pedidos.fecha}) = date(${clientes.createdAt})`,
        territorioConditionClientes,
      ),
    )
    .groupBy(sql`extract(day from ${clientes.createdAt})`)

  const creadosMap = new Map(creadosPorDiaRows.map((r) => [r.day, r.total]))
  const conPedidoMap = new Map(conPedidoMismoDiaRows.map((r) => [r.day, r.conPedido]))
  const clientesCreadosPorDia = Array.from({ length: diasEnMes }, (_, i) => {
    const total = creadosMap.get(i + 1) ?? 0
    // conPedido can never exceed total (clamp defensively)
    const conPedido = Math.min(conPedidoMap.get(i + 1) ?? 0, total)
    return { day: i + 1, total, conPedido }
  })

  return {
    chartData,
    productosVendidos: productosRow?.total ?? 0,
    carteraActiva: Number(carteraRow?.total ?? 0),
    mesNombre: MESES_NOMBRES[mes - 1] ?? '',
    clientesCreadosPorDia,
  }
}
