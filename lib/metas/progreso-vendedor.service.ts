import { db } from '@/db'
import { clientes, pedidos, movimientosCC, metas } from '@/db/schema'
import { eq, and, gte, lt, isNull, sum, count, inArray, or } from 'drizzle-orm'
import { pctClientesConPedidoDelPeriodo, pctCobranzaDelPeriodo } from './avance.service'

// ─── Types ────────────────────────────────────────────────────────────────────

export type EstadoMetaV = 'en_curso' | 'cumplida' | 'no_cumplida' | 'na'

export type MetricaVendedor = {
  alcanzado: number
  objetivo: number
  pct: number
  proyeccion: number
  estado: EstadoMetaV
}

export type MetricaCartera = {
  alcanzado: number | null
  objetivo: number
  pct: number | null
  proyeccion: number | null
  estado: EstadoMetaV
}

export type PedidoImpagoCliente = {
  clienteId: string
  clienteNombre: string
  cantidadPedidos: number
  montoAdeudado: number
}

export type ProgresoVendedor = {
  meta: { id: string; periodoAnio: number; periodoMes: number } | null
  clientesNuevos: MetricaVendedor | null
  coberturaCartera: MetricaCartera | null
  cobranza: MetricaCartera | null
  pedidosImpagos: PedidoImpagoCliente[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function periodoRange(anio: number, mes: number): { start: Date; end: Date } {
  const start = new Date(anio, mes - 1, 1)
  const end = new Date(anio, mes, 1)
  return { start, end }
}

function calcularEstado(
  alcanzado: number,
  objetivo: number,
  anio: number,
  mes: number,
): { pct: number; estado: EstadoMetaV; proyeccion: number } {
  const pct = objetivo > 0 ? Math.round((alcanzado / objetivo) * 100) : 100
  const now = new Date()
  const isCurrentPeriod = now.getFullYear() === anio && now.getMonth() + 1 === mes
  const isPast =
    now.getFullYear() > anio ||
    (now.getFullYear() === anio && now.getMonth() + 1 > mes)

  let estado: EstadoMetaV
  if (alcanzado >= objetivo) {
    estado = 'cumplida'
  } else if (isPast) {
    estado = 'no_cumplida'
  } else {
    estado = 'en_curso'
  }

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

// ─── Individual metric queries ─────────────────────────────────────────────────

async function clientesNuevosConPrimerPedido(
  vendedorId: string,
  anio: number,
  mes: number,
): Promise<number> {
  const { start, end } = periodoRange(anio, mes)
  const result = await db
    .select({ total: count() })
    .from(clientes)
    .where(
      and(
        eq(clientes.vendedorConversionId, vendedorId),
        gte(clientes.fechaConversionANuevo, start),
        lt(clientes.fechaConversionANuevo, end),
        isNull(clientes.deletedAt),
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

async function pedidosImpagosDeMes(
  vendedorId: string,
  anio: number,
  mes: number,
): Promise<PedidoImpagoCliente[]> {
  const { start, end } = periodoRange(anio, mes)

  const clienteRows = await db
    .select({ id: clientes.id, nombre: clientes.nombre, apellido: clientes.apellido })
    .from(clientes)
    .where(
      and(
        eq(clientes.asignadoA, vendedorId),
        isNull(clientes.deletedAt),
      ),
    )
  if (clienteRows.length === 0) return []

  const clienteIds = clienteRows.map((c) => c.id)
  const clienteMap = new Map(
    clienteRows.map((c) => [c.id, `${c.nombre} ${c.apellido}`.trim()]),
  )

  const pedidosRows = await db
    .select({
      clienteId: pedidos.clienteId,
      saldoPendiente: pedidos.saldoPendiente,
    })
    .from(pedidos)
    .where(
      and(
        eq(pedidos.vendedorId, vendedorId),
        gte(pedidos.fecha, start),
        lt(pedidos.fecha, end),
        isNull(pedidos.deletedAt),
        or(
          eq(pedidos.estadoPago, 'impago'),
          eq(pedidos.estadoPago, 'parcial'),
        ),
        inArray(pedidos.clienteId, clienteIds),
      ),
    )

  const grouped = new Map<string, { cantidadPedidos: number; montoAdeudado: number }>()
  for (const row of pedidosRows) {
    const existing = grouped.get(row.clienteId) ?? { cantidadPedidos: 0, montoAdeudado: 0 }
    existing.cantidadPedidos += 1
    existing.montoAdeudado += parseFloat(row.saldoPendiente)
    grouped.set(row.clienteId, existing)
  }

  return Array.from(grouped.entries())
    .map(([clienteId, data]) => ({
      clienteId,
      clienteNombre: clienteMap.get(clienteId) ?? 'Cliente desconocido',
      cantidadPedidos: data.cantidadPedidos,
      montoAdeudado: data.montoAdeudado,
    }))
    .sort((a, b) => b.montoAdeudado - a.montoAdeudado)
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function calcularProgresoVendedor(
  vendedorId: string,
  anio: number,
  mes: number,
): Promise<ProgresoVendedor> {
  const meta = await db.query.metas.findFirst({
    where: and(
      eq(metas.vendedorId, vendedorId),
      eq(metas.periodoAnio, anio),
      eq(metas.periodoMes, mes),
    ),
  })

  // Always compute pedidosImpagos regardless of meta
  const [
    alcanzadoClientesNuevos,
    alcanzadoCoberturaRaw,
    alcanzadoPctCobranza,
    impagos,
  ] = await Promise.all([
    clientesNuevosConPrimerPedido(vendedorId, anio, mes),
    pctClientesConPedidoDelPeriodo(vendedorId, anio, mes),
    pctCobranzaDelPeriodo(vendedorId, anio, mes),
    pedidosImpagosDeMes(vendedorId, anio, mes),
  ])

  if (!meta) {
    return {
      meta: null,
      clientesNuevos: null,
      coberturaCartera: null,
      cobranza: null,
      pedidosImpagos: impagos,
    }
  }

  const objetivoClientesNuevos = meta.clientesNuevosObjetivo
  const objetivoCobertura = parseFloat(meta.pctClientesConPedidoObjetivo)
  const objetivoPctCobranza = parseFloat(meta.pctCobranzaObjetivo)

  const { pct: pctCN, estado: estadoCN, proyeccion: proyCN } = calcularEstado(
    alcanzadoClientesNuevos,
    objetivoClientesNuevos,
    anio,
    mes,
  )

  const coberturaCartera: MetricaCartera =
    alcanzadoCoberturaRaw === null
      ? { alcanzado: null, objetivo: objetivoCobertura, pct: null, proyeccion: null, estado: 'na' }
      : {
          alcanzado: alcanzadoCoberturaRaw,
          objetivo: objetivoCobertura,
          ...calcularEstado(alcanzadoCoberturaRaw, objetivoCobertura, anio, mes),
        }

  const cobranza: MetricaCartera =
    alcanzadoPctCobranza === null
      ? { alcanzado: null, objetivo: objetivoPctCobranza, pct: null, proyeccion: null, estado: 'na' }
      : {
          alcanzado: alcanzadoPctCobranza,
          objetivo: objetivoPctCobranza,
          ...calcularEstado(alcanzadoPctCobranza, objetivoPctCobranza, anio, mes),
        }

  return {
    meta: { id: meta.id, periodoAnio: meta.periodoAnio, periodoMes: meta.periodoMes },
    clientesNuevos: {
      alcanzado: alcanzadoClientesNuevos,
      objetivo: objetivoClientesNuevos,
      pct: pctCN,
      proyeccion: proyCN,
      estado: estadoCN,
    },
    coberturaCartera,
    cobranza,
    pedidosImpagos: impagos,
  }
}
