import { db } from '@/db'
import { pedidos, pedidoItems, territorioGerente, clientes } from '@/db/schema'
import { and, gte, isNull, sql, eq, inArray, count } from 'drizzle-orm'
import {
  buildBuckets,
  windowStartMs,
  bucketKeyFromBusinessDate,
  sqlTruncUnit,
  sqlKeyFormat,
  RANGO_LABEL,
  type Granularidad,
  type BucketDef,
} from './date-buckets'

export type { Granularidad }

export interface ChartPoint {
  key: string
  label: string
  primerPedido: number
  clienteNuevo: number
}

export interface CreadosPoint {
  key: string
  label: string
  total: number
  conPedido: number
}

export interface AdminDashboardStats {
  granularidad: Granularidad
  rangoLabel: string
  chartData: ChartPoint[]
  clientesCreados: CreadosPoint[]
  productosVendidos: number
  carteraActiva: number
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
 * Distribuye los pedidos pagados en los buckets de tiempo, contando primer
 * pedido (rank 1) y cliente consolidado (rank 3) por cubeta. Pura y testeable.
 */
export function aggregateBuckets(
  buckets: BucketDef[],
  pedidosWindow: Array<{ id: string; fecha: Date | null }>,
  rankMap: Map<string, number>,
  granularidad: Granularidad,
): ChartPoint[] {
  const idx = new Map(buckets.map((b, i) => [b.key, i]))
  const points: ChartPoint[] = buckets.map((b) => ({
    key: b.key,
    label: b.label,
    primerPedido: 0,
    clienteNuevo: 0,
  }))

  for (const p of pedidosWindow) {
    if (!p.fecha) continue
    const i = idx.get(bucketKeyFromBusinessDate(granularidad, p.fecha))
    if (i === undefined) continue
    const rank = rankMap.get(p.id)
    if (rank === 1) points[i]!.primerPedido++
    else if (rank === 3) points[i]!.clienteNuevo++
  }

  return points
}

function emptyStats(granularidad: Granularidad, buckets: BucketDef[]): AdminDashboardStats {
  return {
    granularidad,
    rangoLabel: RANGO_LABEL[granularidad],
    chartData: buckets.map((b) => ({ key: b.key, label: b.label, primerPedido: 0, clienteNuevo: 0 })),
    clientesCreados: buckets.map((b) => ({ key: b.key, label: b.label, total: 0, conPedido: 0 })),
    productosVendidos: 0,
    carteraActiva: 0,
  }
}

export async function getAdminDashboardStats(
  granularidad: Granularidad,
  filtros?: { territorioId?: string; gerenteId?: string },
): Promise<AdminDashboardStats> {
  const now = Date.now()
  const buckets = buildBuckets(granularidad, now)
  const desde = new Date(windowStartMs(granularidad, now))

  // ── Resolver el filtro de territorio ──────────────────────────────────────
  let territorioIds: string[] | null = null
  if (filtros?.territorioId) {
    territorioIds = [filtros.territorioId]
  } else if (filtros?.gerenteId) {
    const rows = await db
      .select({ territorioId: territorioGerente.territorioId })
      .from(territorioGerente)
      .where(eq(territorioGerente.gerenteId, filtros.gerenteId))
    if (rows.length === 0) return emptyStats(granularidad, buckets)
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

  // ── Pedidos pagados en la ventana (para primer pedido / cliente nuevo) ─────
  const pedidosWindow = await db
    .select({ id: pedidos.id, clienteId: pedidos.clienteId, fecha: pedidos.fecha })
    .from(pedidos)
    .where(
      and(
        isNull(pedidos.deletedAt),
        eq(pedidos.estadoPago, 'pagado'),
        gte(pedidos.fecha, desde),
        territorioCondition,
      ),
    )

  let chartData: ChartPoint[] = buckets.map((b) => ({
    key: b.key,
    label: b.label,
    primerPedido: 0,
    clienteNuevo: 0,
  }))

  if (pedidosWindow.length > 0) {
    const clienteIds = [...new Set(pedidosWindow.map((p) => p.clienteId))]
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
    chartData = aggregateBuckets(buckets, pedidosWindow, rankMap, granularidad)
  }

  // ── Productos vendidos (unidades) en la ventana ────────────────────────────
  const [productosRow] = await db
    .select({ total: sql<number>`coalesce(sum(${pedidoItems.cantidad}), 0)::int` })
    .from(pedidoItems)
    .innerJoin(pedidos, eq(pedidoItems.pedidoId, pedidos.id))
    .where(
      and(
        isNull(pedidos.deletedAt),
        eq(pedidos.estadoPago, 'pagado'),
        gte(pedidos.fecha, desde),
        territorioCondition,
      ),
    )

  // ── Cartera pendiente (impago + parcial) en la ventana ─────────────────────
  const [carteraRow] = await db
    .select({ total: sql<string>`coalesce(sum(${pedidos.saldoPendiente}::numeric), 0)` })
    .from(pedidos)
    .where(
      and(
        isNull(pedidos.deletedAt),
        sql`${pedidos.estadoPago} IN ('impago', 'parcial')`,
        gte(pedidos.fecha, desde),
        territorioCondition,
      ),
    )

  // ── Clientes creados por bucket (en hora AR) ───────────────────────────────
  const creadoKey = sql<string>`to_char(date_trunc(${sqlTruncUnit(granularidad)}, ${clientes.createdAt} - interval '3 hours'), ${sqlKeyFormat(granularidad)})`
  const creadosRows = await db
    .select({ key: creadoKey, total: count() })
    .from(clientes)
    .where(
      and(
        gte(clientes.createdAt, desde),
        isNull(clientes.deletedAt),
        territorioConditionClientes,
      ),
    )
    .groupBy(creadoKey)

  // Clientes creados con al menos un pedido el mismo día calendario.
  const conPedidoKey = sql<string>`to_char(date_trunc(${sqlTruncUnit(granularidad)}, ${clientes.createdAt} - interval '3 hours'), ${sqlKeyFormat(granularidad)})`
  const conPedidoRows = await db
    .select({ key: conPedidoKey, conPedido: sql<number>`count(distinct ${clientes.id})::int` })
    .from(clientes)
    .innerJoin(pedidos, eq(pedidos.clienteId, clientes.id))
    .where(
      and(
        gte(clientes.createdAt, desde),
        isNull(clientes.deletedAt),
        isNull(pedidos.deletedAt),
        sql`date(${pedidos.fecha}) = date(${clientes.createdAt})`,
        territorioConditionClientes,
      ),
    )
    .groupBy(conPedidoKey)

  const creadosMap = new Map(creadosRows.map((r) => [r.key, Number(r.total)]))
  const conPedidoMap = new Map(conPedidoRows.map((r) => [r.key, Number(r.conPedido)]))
  const clientesCreados: CreadosPoint[] = buckets.map((b) => {
    const total = creadosMap.get(b.key) ?? 0
    const conPedido = Math.min(conPedidoMap.get(b.key) ?? 0, total)
    return { key: b.key, label: b.label, total, conPedido }
  })

  return {
    granularidad,
    rangoLabel: RANGO_LABEL[granularidad],
    chartData,
    clientesCreados,
    productosVendidos: productosRow?.total ?? 0,
    carteraActiva: Number(carteraRow?.total ?? 0),
  }
}
