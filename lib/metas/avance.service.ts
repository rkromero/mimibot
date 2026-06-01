import { db } from '@/db'
import { clientes, pedidos, movimientosCC, leads, metas } from '@/db/schema'
import { eq, and, gte, lt, isNull, sum, count, inArray } from 'drizzle-orm'

// ─── Types ────────────────────────────────────────────────────────────────────

export type EstadoMeta = 'en_curso' | 'cumplida' | 'no_cumplida' | 'na'

type MetaRow = typeof metas.$inferSelect

export type MetaAvance = {
  meta: MetaRow
  clientesNuevos: { alcanzado: number; pct: number; proyeccion: number; estado: EstadoMeta }
  clientesPrimerPedido: { alcanzado: number; pct: number; proyeccion: number; estado: EstadoMeta }
  pedidos: { alcanzado: number; pct: number; proyeccion: number; estado: EstadoMeta }
  montoCobrado: { alcanzado: number; pct: number; proyeccion: number; estado: EstadoMeta }
  conversionLeads: { alcanzado: number; pct: number; proyeccion: number; estado: EstadoMeta }
  pctClientesConPedido: { alcanzado: number | null; pct: number | null; proyeccion: number | null; estado: EstadoMeta }
  pctPedidosPagados: { alcanzado: number | null; pct: number | null; proyeccion: number | null; estado: EstadoMeta }
  pctCobranza: { alcanzado: number | null; pct: number | null; proyeccion: number | null; estado: EstadoMeta }
}

// ─── Period Helpers ───────────────────────────────────────────────────────────

function periodoRange(anio: number, mes: number): { start: Date; end: Date } {
  const start = new Date(anio, mes - 1, 1)   // first day of month
  const end = new Date(anio, mes, 1)          // first day of NEXT month (exclusive)
  return { start, end }
}

function calcularEstadoMeta(
  alcanzado: number,
  objetivo: number,
  anio: number,
  mes: number,
): { pct: number; estado: EstadoMeta; proyeccion: number } {
  const pct = objetivo > 0 ? Math.round((alcanzado / objetivo) * 100) : 100
  const now = new Date()
  const isCurrentPeriod = now.getFullYear() === anio && now.getMonth() + 1 === mes
  const isPast =
    now.getFullYear() > anio ||
    (now.getFullYear() === anio && now.getMonth() + 1 > mes)

  let estado: EstadoMeta
  if (alcanzado >= objetivo) {
    estado = 'cumplida'
  } else if (isPast) {
    estado = 'no_cumplida'
  } else {
    estado = 'en_curso'
  }

  // Linear projection to end of month
  let proyeccion = alcanzado
  if (isCurrentPeriod) {
    const daysInMonth = new Date(anio, mes, 0).getDate()
    const dayOfMonth = now.getDate()
    if (dayOfMonth > 0) {
      proyeccion = Math.round((alcanzado / dayOfMonth) * daysInMonth)
    }
  }

  return { pct, estado, proyeccion }
}

// ─── Individual Metric Calculations ──────────────────────────────────────────

/**
 * Counts unique clients with >= CLIENTE_NUEVO_THRESHOLD paid orders in the period.
 * Exported as pure function for unit testing.
 */
export function countClientesNuevos(
  rows: { clienteId: string }[],
  threshold = 3,
): number {
  const cntMap = new Map<string, number>()
  for (const { clienteId } of rows) {
    cntMap.set(clienteId, (cntMap.get(clienteId) ?? 0) + 1)
  }
  return [...cntMap.values()].filter((n) => n >= threshold).length
}

async function clientesNuevosDelPeriodo(
  vendedorId: string,
  anio: number,
  mes: number,
): Promise<number> {
  const { start, end } = periodoRange(anio, mes)

  const rows = await db
    .select({ clienteId: pedidos.clienteId })
    .from(pedidos)
    .where(
      and(
        eq(pedidos.vendedorId, vendedorId),
        eq(pedidos.estadoPago, 'pagado'),
        gte(pedidos.fecha, start),
        lt(pedidos.fecha, end),
        isNull(pedidos.deletedAt),
      ),
    )

  return countClientesNuevos(rows, 3)
}

async function pedidosConfirmadosDelPeriodo(
  vendedorId: string,
  anio: number,
  mes: number,
): Promise<number> {
  const { start, end } = periodoRange(anio, mes)

  const result = await db
    .select({ total: count() })
    .from(pedidos)
    .where(
      and(
        eq(pedidos.vendedorId, vendedorId),
        eq(pedidos.estado, 'confirmado'),
        gte(pedidos.fecha, start),
        lt(pedidos.fecha, end),
        isNull(pedidos.deletedAt),
      ),
    )

  return result[0]?.total ?? 0
}

async function montoCobradoDelPeriodo(
  vendedorId: string,
  anio: number,
  mes: number,
): Promise<number> {
  const { start, end } = periodoRange(anio, mes)

  // Get clienteIds assigned to this vendor
  const clienteRows = await db
    .select({ id: clientes.id })
    .from(clientes)
    .where(
      and(
        eq(clientes.asignadoA, vendedorId),
        isNull(clientes.deletedAt),
      ),
    )

  if (clienteRows.length === 0) return 0

  const clienteIds = clienteRows.map((c) => c.id)

  const result = await db
    .select({ total: sum(movimientosCC.monto) })
    .from(movimientosCC)
    .where(
      and(
        eq(movimientosCC.tipo, 'credito'),
        gte(movimientosCC.fecha, start),
        lt(movimientosCC.fecha, end),
        isNull(movimientosCC.deletedAt),
        inArray(movimientosCC.clienteId, clienteIds),
      ),
    )

  const raw = result[0]?.total
  return raw != null ? parseFloat(raw) : 0
}

async function conversionLeadsDelPeriodo(
  vendedorId: string,
  anio: number,
  mes: number,
): Promise<number> {
  const { start, end } = periodoRange(anio, mes)

  const [ganadosResult, gestionadosResult] = await Promise.all([
    db
      .select({ total: count() })
      .from(leads)
      .where(
        and(
          eq(leads.assignedTo, vendedorId),
          gte(leads.wonAt, start),
          lt(leads.wonAt, end),
          isNull(leads.deletedAt),
        ),
      ),
    db
      .select({ total: count() })
      .from(leads)
      .where(
        and(
          eq(leads.assignedTo, vendedorId),
          isNull(leads.deletedAt),
        ),
      ),
  ])

  const ganados = ganadosResult[0]?.total ?? 0
  const gestionados = gestionadosResult[0]?.total ?? 0

  if (gestionados === 0) return 0

  return Math.round(((ganados / gestionados) * 100) * 100) / 100
}

/**
 * Returns count of unique clients with their FIRST EVER paid order in the period,
 * attributed to this vendedor. Pure — exported for unit testing.
 */
export function countPrimerPedidoClientes(
  clientesEnPeriodo: string[],
  clientesConHistorial: Set<string>,
): number {
  return clientesEnPeriodo.filter((id) => !clientesConHistorial.has(id)).length
}

async function clientesPrimerPedidoDelPeriodo(
  vendedorId: string,
  anio: number,
  mes: number,
): Promise<number> {
  const { start, end } = periodoRange(anio, mes)

  const enPeriodo = await db
    .select({ clienteId: pedidos.clienteId })
    .from(pedidos)
    .where(
      and(
        eq(pedidos.vendedorId, vendedorId),
        eq(pedidos.estadoPago, 'pagado'),
        gte(pedidos.fecha, start),
        lt(pedidos.fecha, end),
        isNull(pedidos.deletedAt),
      ),
    )

  if (enPeriodo.length === 0) return 0

  const clientesEnPeriodo = [...new Set(enPeriodo.map((p) => p.clienteId))]

  const anteriores = await db
    .select({ clienteId: pedidos.clienteId })
    .from(pedidos)
    .where(
      and(
        inArray(pedidos.clienteId, clientesEnPeriodo),
        eq(pedidos.estadoPago, 'pagado'),
        lt(pedidos.fecha, start),
        isNull(pedidos.deletedAt),
      ),
    )

  const conHistorial = new Set(anteriores.map((p) => p.clienteId))
  return countPrimerPedidoClientes(clientesEnPeriodo, conHistorial)
}

export async function pctClientesConPedidoDelPeriodo(
  vendedorId: string,
  anio: number,
  mes: number,
): Promise<number | null> {
  const { start, end } = periodoRange(anio, mes)

  // Denominador: clientes asignados al vendedor sin borrar (snapshot hoy)
  const clienteRows = await db
    .select({ id: clientes.id })
    .from(clientes)
    .where(
      and(
        eq(clientes.asignadoA, vendedorId),
        isNull(clientes.deletedAt),
      ),
    )

  const denominador = clienteRows.length
  if (denominador === 0) return null

  const clienteIds = clienteRows.map((c) => c.id)

  // Numerador: distinct clientes con al menos 1 pedido PAGADO en el período
  const pedidoRows = await db
    .select({ clienteId: pedidos.clienteId })
    .from(pedidos)
    .where(
      and(
        eq(pedidos.vendedorId, vendedorId),
        eq(pedidos.estadoPago, 'pagado'),
        isNull(pedidos.deletedAt),
        gte(pedidos.fecha, start),
        lt(pedidos.fecha, end),
        inArray(pedidos.clienteId, clienteIds),
      ),
    )

  const clientesConPedido = new Set(pedidoRows.map((p) => p.clienteId)).size

  return Math.round((clientesConPedido / denominador) * 100 * 100) / 100
}

export async function pctCobranzaDelPeriodo(
  vendedorId: string,
  anio: number,
  mes: number,
): Promise<number | null> {
  const { start, end } = periodoRange(anio, mes)

  const [denominadorResult, numeradorResult] = await Promise.all([
    db
      .select({ total: sum(pedidos.total) })
      .from(pedidos)
      .where(
        and(
          eq(pedidos.vendedorId, vendedorId),
          eq(pedidos.estado, 'confirmado'),
          gte(pedidos.fecha, start),
          lt(pedidos.fecha, end),
          isNull(pedidos.deletedAt),
        ),
      ),
    db
      .select({ total: sum(pedidos.montoPagado) })
      .from(pedidos)
      .where(
        and(
          eq(pedidos.vendedorId, vendedorId),
          eq(pedidos.estado, 'confirmado'),
          gte(pedidos.fecha, start),
          lt(pedidos.fecha, end),
          isNull(pedidos.deletedAt),
        ),
      ),
  ])

  const den = denominadorResult[0]?.total != null ? parseFloat(denominadorResult[0].total) : 0
  if (den === 0) return null

  const num = numeradorResult[0]?.total != null ? parseFloat(numeradorResult[0].total) : 0
  return Math.round((num / den) * 100 * 100) / 100
}

export async function pctPedidosPagadosDelPeriodo(
  vendedorId: string,
  anio: number,
  mes: number,
): Promise<number | null> {
  const { start, end } = periodoRange(anio, mes)

  const [denominadorResult, numeradorResult] = await Promise.all([
    db
      .select({ total: count() })
      .from(pedidos)
      .where(
        and(
          eq(pedidos.vendedorId, vendedorId),
          eq(pedidos.estado, 'confirmado'),
          gte(pedidos.fecha, start),
          lt(pedidos.fecha, end),
          isNull(pedidos.deletedAt),
        ),
      ),
    db
      .select({ total: count() })
      .from(pedidos)
      .where(
        and(
          eq(pedidos.vendedorId, vendedorId),
          eq(pedidos.estado, 'confirmado'),
          eq(pedidos.estadoPago, 'pagado'),
          gte(pedidos.fecha, start),
          lt(pedidos.fecha, end),
          isNull(pedidos.deletedAt),
        ),
      ),
  ])

  const denominador = denominadorResult[0]?.total ?? 0
  if (denominador === 0) return null

  const numerador = numeradorResult[0]?.total ?? 0
  return Math.round((numerador / denominador) * 100 * 100) / 100
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function calcularAvanceMeta(metaId: string): Promise<MetaAvance> {
  const meta = await db.query.metas.findFirst({
    where: eq(metas.id, metaId),
  })

  if (!meta) {
    throw new Error(`Meta no encontrada: ${metaId}`)
  }

  const { vendedorId, periodoAnio, periodoMes } = meta

  const [alcanzadoClientesNuevos, alcanzadoPedidos, alcanzadoMonto, alcanzadoConversion, alcanzadoPctClientes, alcanzadoPctPedidosPagados, alcanzadoPctCobranza] =
    await Promise.all([
      clientesNuevosDelPeriodo(vendedorId, periodoAnio, periodoMes),
      pedidosConfirmadosDelPeriodo(vendedorId, periodoAnio, periodoMes),
      montoCobradoDelPeriodo(vendedorId, periodoAnio, periodoMes),
      conversionLeadsDelPeriodo(vendedorId, periodoAnio, periodoMes),
      pctClientesConPedidoDelPeriodo(vendedorId, periodoAnio, periodoMes),
      pctPedidosPagadosDelPeriodo(vendedorId, periodoAnio, periodoMes),
      pctCobranzaDelPeriodo(vendedorId, periodoAnio, periodoMes),
    ])

  // Sequential: keeps existing Promise.all call ordering intact for test stability
  const alcanzadoPrimerPedido = await clientesPrimerPedidoDelPeriodo(vendedorId, periodoAnio, periodoMes)

  const objetivoClientesNuevos = meta.clientesNuevosObjetivo
  const objetivoPedidos = meta.pedidosObjetivo
  const objetivoMonto = parseFloat(meta.montoCobradoObjetivo)
  const objetivoConversion = parseFloat(meta.conversionLeadsObjetivo)
  const objetivoPctClientes = parseFloat(meta.pctClientesConPedidoObjetivo)
  const objetivoPctPedidosPagados = parseFloat(meta.pctPedidosPagadosObjetivo)
  const objetivoPctCobranza = parseFloat(meta.pctCobranzaObjetivo)

  const estadoClientesNuevos = calcularEstadoMeta(
    alcanzadoClientesNuevos,
    objetivoClientesNuevos,
    periodoAnio,
    periodoMes,
  )

  const estadoPrimerPedido = calcularEstadoMeta(
    alcanzadoPrimerPedido,
    objetivoClientesNuevos,
    periodoAnio,
    periodoMes,
  )
  const estadoPedidos = calcularEstadoMeta(
    alcanzadoPedidos,
    objetivoPedidos,
    periodoAnio,
    periodoMes,
  )
  const estadoMonto = calcularEstadoMeta(
    alcanzadoMonto,
    objetivoMonto,
    periodoAnio,
    periodoMes,
  )
  const estadoConversion = calcularEstadoMeta(
    alcanzadoConversion,
    objetivoConversion,
    periodoAnio,
    periodoMes,
  )

  const pctClientesConPedido = alcanzadoPctClientes === null
    ? { alcanzado: null, pct: null, proyeccion: null, estado: 'na' as EstadoMeta }
    : {
        alcanzado: alcanzadoPctClientes,
        ...calcularEstadoMeta(alcanzadoPctClientes, objetivoPctClientes, periodoAnio, periodoMes),
      }

  const pctPedidosPagados = alcanzadoPctPedidosPagados === null
    ? { alcanzado: null, pct: null, proyeccion: null, estado: 'na' as EstadoMeta }
    : {
        alcanzado: alcanzadoPctPedidosPagados,
        ...calcularEstadoMeta(alcanzadoPctPedidosPagados, objetivoPctPedidosPagados, periodoAnio, periodoMes),
      }

  const pctCobranza = alcanzadoPctCobranza === null
    ? { alcanzado: null, pct: null, proyeccion: null, estado: 'na' as EstadoMeta }
    : {
        alcanzado: alcanzadoPctCobranza,
        ...calcularEstadoMeta(alcanzadoPctCobranza, objetivoPctCobranza, periodoAnio, periodoMes),
      }

  return {
    meta,
    clientesNuevos: {
      alcanzado: alcanzadoClientesNuevos,
      pct: estadoClientesNuevos.pct,
      proyeccion: estadoClientesNuevos.proyeccion,
      estado: estadoClientesNuevos.estado,
    },
    clientesPrimerPedido: {
      alcanzado: alcanzadoPrimerPedido,
      pct: estadoPrimerPedido.pct,
      proyeccion: estadoPrimerPedido.proyeccion,
      estado: estadoPrimerPedido.estado,
    },
    pedidos: {
      alcanzado: alcanzadoPedidos,
      pct: estadoPedidos.pct,
      proyeccion: estadoPedidos.proyeccion,
      estado: estadoPedidos.estado,
    },
    montoCobrado: {
      alcanzado: alcanzadoMonto,
      pct: estadoMonto.pct,
      proyeccion: estadoMonto.proyeccion,
      estado: estadoMonto.estado,
    },
    conversionLeads: {
      alcanzado: alcanzadoConversion,
      pct: estadoConversion.pct,
      proyeccion: estadoConversion.proyeccion,
      estado: estadoConversion.estado,
    },
    pctClientesConPedido,
    pctPedidosPagados,
    pctCobranza,
  }
}

export async function calcularAvanceVendedor(
  vendedorId: string,
  anio: number,
  mes: number,
): Promise<MetaAvance | null> {
  const meta = await db.query.metas.findFirst({
    where: and(
      eq(metas.vendedorId, vendedorId),
      eq(metas.periodoAnio, anio),
      eq(metas.periodoMes, mes),
    ),
  })

  if (!meta) return null

  return calcularAvanceMeta(meta.id)
}

export async function calcularAvanceTodos(
  anio: number,
  mes: number,
): Promise<MetaAvance[]> {
  const allMetas = await db.query.metas.findMany({
    where: and(
      eq(metas.periodoAnio, anio),
      eq(metas.periodoMes, mes),
    ),
  })

  if (allMetas.length === 0) return []

  return Promise.all(allMetas.map((m) => calcularAvanceMeta(m.id)))
}
