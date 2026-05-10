import { db } from '@/db'
import { clientes, pedidos, movimientosCC, leads, metas } from '@/db/schema'
import { eq, and, gte, lt, isNull, sum, count, inArray } from 'drizzle-orm'

// ─── Types ────────────────────────────────────────────────────────────────────

export type EstadoMeta = 'en_curso' | 'cumplida' | 'no_cumplida'

type MetaRow = typeof metas.$inferSelect

export type MetaAvance = {
  meta: MetaRow
  clientesNuevos: { alcanzado: number; pct: number; proyeccion: number; estado: EstadoMeta }
  pedidos: { alcanzado: number; pct: number; proyeccion: number; estado: EstadoMeta }
  montoCobrado: { alcanzado: number; pct: number; proyeccion: number; estado: EstadoMeta }
  conversionLeads: { alcanzado: number; pct: number; proyeccion: number; estado: EstadoMeta }
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

async function clientesNuevosDelPeriodo(
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

// ─── Public API ───────────────────────────────────────────────────────────────

export async function calcularAvanceMeta(metaId: string): Promise<MetaAvance> {
  const meta = await db.query.metas.findFirst({
    where: eq(metas.id, metaId),
  })

  if (!meta) {
    throw new Error(`Meta no encontrada: ${metaId}`)
  }

  const { vendedorId, periodoAnio, periodoMes } = meta

  const [alcanzadoClientesNuevos, alcanzadoPedidos, alcanzadoMonto, alcanzadoConversion] =
    await Promise.all([
      clientesNuevosDelPeriodo(vendedorId, periodoAnio, periodoMes),
      pedidosConfirmadosDelPeriodo(vendedorId, periodoAnio, periodoMes),
      montoCobradoDelPeriodo(vendedorId, periodoAnio, periodoMes),
      conversionLeadsDelPeriodo(vendedorId, periodoAnio, periodoMes),
    ])

  const objetivoClientesNuevos = meta.clientesNuevosObjetivo
  const objetivoPedidos = meta.pedidosObjetivo
  const objetivoMonto = parseFloat(meta.montoCobradoObjetivo)
  const objetivoConversion = parseFloat(meta.conversionLeadsObjetivo)

  const estadoClientesNuevos = calcularEstadoMeta(
    alcanzadoClientesNuevos,
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

  return {
    meta,
    clientesNuevos: {
      alcanzado: alcanzadoClientesNuevos,
      pct: estadoClientesNuevos.pct,
      proyeccion: estadoClientesNuevos.proyeccion,
      estado: estadoClientesNuevos.estado,
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
