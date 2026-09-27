/**
 * Tablero de comando: consultas a la base para un mes dado. Devuelve el
 * `TableroData` completo que consume la pantalla. Las reglas de negocio
 * (semáforo, punto de equilibrio, proyección, antigüedad) están en calculos.ts.
 *
 * Criterios:
 * - Venta devengada: el pedido cuenta cuando queda confirmado o más avanzado,
 *   por su fecha. Las muestras (tipo = 'muestra') no son venta.
 * - Cobros: créditos de cuenta corriente por fecha del movimiento.
 * - Gastos: por fecha del gasto; costo directo / gasto operativo según la
 *   categoría.
 */
import { and, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  clientes, gastoCategorias, gastos, leads, marcas, metas, movimientosCC,
  pedidoItems, pedidos, productos, propuestas, users,
} from '@/db/schema'
import { rangoMesAR, todayStrAR, parseFechaAR } from '@/lib/dates'
import { labelMotivoPerdida } from '@/lib/leads/motivos-perdida'
import {
  antiguedadDeuda, armarResultado, diasDeCobro, mesAnterior, proyeccionCierre, puntoEquilibrio, semaforo,
} from './calculos'
import type { ResultadoMes, TableroData } from './tipos'

export const ESTADOS_VENTA = ['confirmado', 'listo_para_repartir', 'en_reparto', 'entregado'] as const

type Rango = { desde: Date; hasta: Date }

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'))
  return Number.isFinite(n) ? n : 0
}

function condVenta(rango: Rango) {
  return and(
    isNull(pedidos.deletedAt),
    eq(pedidos.tipo, 'venta'),
    inArray(pedidos.estado, [...ESTADOS_VENTA]),
    gte(pedidos.fecha, rango.desde),
    lt(pedidos.fecha, rango.hasta),
  )
}

async function resultadoDelMes(rango: Rango): Promise<ResultadoMes> {
  const [v] = await db
    .select({ total: sql<string>`COALESCE(SUM(${pedidos.total}), 0)::text`, cantidad: sql<number>`count(*)::int` })
    .from(pedidos)
    .where(condVenta(rango))
  const g = await db
    .select({ tipo: gastoCategorias.tipo, total: sql<string>`COALESCE(SUM(${gastos.monto}), 0)::text` })
    .from(gastos)
    .innerJoin(gastoCategorias, eq(gastos.categoriaId, gastoCategorias.id))
    .where(and(isNull(gastos.deletedAt), gte(gastos.fecha, rango.desde), lt(gastos.fecha, rango.hasta)))
    .groupBy(gastoCategorias.tipo)
  return armarResultado({
    ventas: num(v?.total),
    cantidadPedidos: v?.cantidad ?? 0,
    costoDirecto: num(g.find((r) => r.tipo === 'costo_directo')?.total),
    gastoOperativo: num(g.find((r) => r.tipo === 'gasto_operativo')?.total),
  })
}

async function caja(rango: Rango, ventasMes: number) {
  const cobros = await db
    .select({ metodo: movimientosCC.metodoPago, total: sql<string>`COALESCE(SUM(${movimientosCC.monto}), 0)::text` })
    .from(movimientosCC)
    .where(and(
      isNull(movimientosCC.deletedAt),
      eq(movimientosCC.tipo, 'credito'),
      gte(movimientosCC.fecha, rango.desde),
      lt(movimientosCC.fecha, rango.hasta),
    ))
    .groupBy(movimientosCC.metodoPago)
  const pagos = await db
    .select({ metodo: gastos.metodoPago, total: sql<string>`COALESCE(SUM(${gastos.monto}), 0)::text` })
    .from(gastos)
    .where(and(isNull(gastos.deletedAt), gte(gastos.fecha, rango.desde), lt(gastos.fecha, rango.hasta)))
    .groupBy(gastos.metodoPago)

  const metodos = new Map<string, { cobrado: number; pagado: number }>()
  const nombre = (m: string | null) => m ?? 'sin especificar'
  for (const c of cobros) {
    const k = nombre(c.metodo)
    metodos.set(k, { cobrado: num(c.total), pagado: metodos.get(k)?.pagado ?? 0 })
  }
  for (const p of pagos) {
    const k = nombre(p.metodo)
    metodos.set(k, { cobrado: metodos.get(k)?.cobrado ?? 0, pagado: num(p.total) })
  }
  const porMetodo = [...metodos.entries()].map(([metodo, v]) => ({ metodo, ...v }))
  const cobrado = porMetodo.reduce((s, m) => s + m.cobrado, 0)
  const pagado = porMetodo.reduce((s, m) => s + m.pagado, 0)
  return { porMetodo, cobrado, pagado, cobranzaPct: ventasMes > 0 ? cobrado / ventasMes : null }
}

async function deuda(hoy: Date) {
  const rows = await db
    .select({
      clienteId: pedidos.clienteId,
      fecha: pedidos.fecha,
      saldo: pedidos.saldoPendiente,
      nombre: sql<string>`COALESCE(NULLIF(${clientes.empresa}, ''), TRIM(${clientes.nombre} || ' ' || ${clientes.apellido}))`,
    })
    .from(pedidos)
    .innerJoin(clientes, eq(clientes.id, pedidos.clienteId))
    .where(and(
      isNull(pedidos.deletedAt),
      eq(pedidos.tipo, 'venta'),
      inArray(pedidos.estado, [...ESTADOS_VENTA]),
      sql`${pedidos.saldoPendiente} > 0`,
    ))
  const conSaldo = rows.map((r) => ({ fecha: r.fecha, saldo: num(r.saldo) }))
  const antiguedad = antiguedadDeuda(conSaldo, hoy)

  const porCliente = new Map<string, { nombre: string; saldo: number; pedidos: number; diasMax: number }>()
  for (const r of rows) {
    const saldo = num(r.saldo)
    if (saldo <= 0) continue
    const dias = Math.max(0, Math.floor((hoy.getTime() - r.fecha.getTime()) / 86_400_000))
    const actual = porCliente.get(r.clienteId) ?? { nombre: r.nombre, saldo: 0, pedidos: 0, diasMax: 0 }
    actual.saldo += saldo
    actual.pedidos++
    actual.diasMax = Math.max(actual.diasMax, dias)
    porCliente.set(r.clienteId, actual)
  }
  const top = [...porCliente.entries()]
    .map(([clienteId, v]) => ({ clienteId, ...v }))
    .sort((a, b) => b.saldo - a.saldo)
    .slice(0, 10)
  return { antiguedad, top }
}

async function ventasPorMarca(rango: Rango, rangoAnterior: Rango) {
  const consulta = (r: Rango) => db
    .select({
      marcaId: marcas.id,
      marca: marcas.nombre,
      facturado: sql<string>`COALESCE(SUM(${pedidoItems.subtotal}), 0)::text`,
      pedidos: sql<number>`count(distinct ${pedidos.id})::int`,
    })
    .from(pedidoItems)
    .innerJoin(pedidos, eq(pedidos.id, pedidoItems.pedidoId))
    .innerJoin(productos, eq(productos.id, pedidoItems.productoId))
    .innerJoin(marcas, eq(marcas.id, productos.marcaId))
    .where(condVenta(r))
    .groupBy(marcas.id, marcas.nombre)
  const [actual, anterior] = await Promise.all([consulta(rango), consulta(rangoAnterior)])
  const prev = new Map(anterior.map((a) => [a.marcaId, num(a.facturado)]))
  return actual
    .map((a) => ({ marcaId: a.marcaId, marca: a.marca, facturado: num(a.facturado), pedidos: a.pedidos, anterior: prev.get(a.marcaId) ?? 0 }))
    .sort((a, b) => b.facturado - a.facturado)
}

async function clientesDelMes(rango: Rango) {
  const [compraron] = await db
    .select({ n: sql<number>`count(distinct ${pedidos.clienteId})::int` })
    .from(pedidos)
    .where(condVenta(rango))
  // Clientes nuevos: su primer pedido de venta cae en el mes
  const primeros = await db
    .select({ clienteId: pedidos.clienteId, primera: sql<Date>`min(${pedidos.fecha})` })
    .from(pedidos)
    .where(and(isNull(pedidos.deletedAt), eq(pedidos.tipo, 'venta'), inArray(pedidos.estado, [...ESTADOS_VENTA])))
    .groupBy(pedidos.clienteId)
  const nuevos = primeros.filter((p) => {
    const f = p.primera instanceof Date ? p.primera : new Date(p.primera)
    return f >= rango.desde && f < rango.hasta
  }).length
  return { clientesQueCompraron: compraron?.n ?? 0, clientesNuevos: nuevos }
}

async function ventasPorVendedor(rango: Rango, mes: string) {
  const [anio, mesNum] = mes.split('-').map(Number)
  const rows = await db
    .select({
      vendedorId: pedidos.vendedorId,
      nombre: users.name,
      ventas: sql<string>`COALESCE(SUM(${pedidos.total}), 0)::text`,
      pedidos: sql<number>`count(*)::int`,
    })
    .from(pedidos)
    .innerJoin(users, eq(users.id, pedidos.vendedorId))
    .where(condVenta(rango))
    .groupBy(pedidos.vendedorId, users.name)
  const metasMes = await db
    .select({ vendedorId: metas.vendedorId, pedidosObjetivo: metas.pedidosObjetivo, montoCobradoObjetivo: metas.montoCobradoObjetivo })
    .from(metas)
    .where(and(eq(metas.periodoAnio, anio!), eq(metas.periodoMes, mesNum!)))
  const metaPor = new Map(metasMes.map((m) => [m.vendedorId, m]))
  return rows
    .map((r) => {
      const m = metaPor.get(r.vendedorId)
      return {
        vendedorId: r.vendedorId,
        nombre: r.nombre ?? 'Sin nombre',
        ventas: num(r.ventas),
        pedidos: r.pedidos,
        metaPedidos: m?.pedidosObjetivo ?? null,
        metaCobrado: m ? num(m.montoCobradoObjetivo) : null,
      }
    })
    .sort((a, b) => b.ventas - a.ventas)
}

async function embudo(rango: Rango) {
  const [nuevos] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(isNull(leads.deletedAt), gte(leads.createdAt, rango.desde), lt(leads.createdAt, rango.hasta)))
  const [ganados] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(isNull(leads.deletedAt), gte(leads.wonAt, rango.desde), lt(leads.wonAt, rango.hasta)))
  const perdidosRows = await db
    .select({ motivo: leads.motivoPerdida, n: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(isNull(leads.deletedAt), gte(leads.perdidoAt, rango.desde), lt(leads.perdidoAt, rango.hasta)))
    .groupBy(leads.motivoPerdida)
  const [props] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(propuestas)
    .where(and(
      isNull(propuestas.deletedAt),
      eq(propuestas.estado, 'enviada'),
      gte(propuestas.createdAt, rango.desde),
      lt(propuestas.createdAt, rango.hasta),
    ))
  const muestras = await db
    .select({ leadId: pedidos.leadId })
    .from(pedidos)
    .where(and(
      isNull(pedidos.deletedAt),
      eq(pedidos.tipo, 'muestra'),
      eq(pedidos.estado, 'entregado'),
      gte(pedidos.entregadoAt, rango.desde),
      lt(pedidos.entregadoAt, rango.hasta),
    ))
  const leadIds = [...new Set(muestras.map((m) => m.leadId).filter((x): x is string => !!x))]
  // De esos leads, cuántos ya tienen un pedido de venta. Un pedido de venta
  // cargado desde el CRM no lleva leadId: se llega por el cliente (clientes.leadId).
  let muestrasConPedido = 0
  if (leadIds.length > 0) {
    const leadDelPedido = sql`COALESCE(${pedidos.leadId}, ${clientes.leadId})`
    const [r] = await db
      .select({ n: sql<number>`count(distinct ${leadDelPedido})::int` })
      .from(pedidos)
      .innerJoin(clientes, eq(clientes.id, pedidos.clienteId))
      .where(and(
        isNull(pedidos.deletedAt),
        eq(pedidos.tipo, 'venta'),
        inArray(pedidos.estado, [...ESTADOS_VENTA]),
        inArray(leadDelPedido, leadIds),
      ))
    muestrasConPedido = r?.n ?? 0
  }
  const perdidos = perdidosRows.reduce((s, r) => s + r.n, 0)
  const motivosPerdida = perdidosRows
    .map((r) => ({ motivo: labelMotivoPerdida(r.motivo), cantidad: r.n }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 5)
  return {
    leadsNuevos: nuevos?.n ?? 0,
    propuestasEnviadas: props?.n ?? 0,
    ganados: ganados?.n ?? 0,
    perdidos,
    muestrasEntregadas: muestras.length,
    muestrasConPedido,
    motivosPerdida,
  }
}

async function gastosPorCategoria(rango: Rango, rangoAnterior: Rango) {
  const consulta = (r: Rango) => db
    .select({
      categoria: gastoCategorias.nombre,
      tipo: gastoCategorias.tipo,
      total: sql<string>`COALESCE(SUM(${gastos.monto}), 0)::text`,
    })
    .from(gastos)
    .innerJoin(gastoCategorias, eq(gastos.categoriaId, gastoCategorias.id))
    .where(and(isNull(gastos.deletedAt), gte(gastos.fecha, r.desde), lt(gastos.fecha, r.hasta)))
    .groupBy(gastoCategorias.nombre, gastoCategorias.tipo)
  const [actual, anterior] = await Promise.all([consulta(rango), consulta(rangoAnterior)])
  const prev = new Map(anterior.map((a) => [a.categoria, num(a.total)]))
  const vistos = new Set<string>()
  const lista = actual.map((a) => {
    vistos.add(a.categoria)
    return { categoria: a.categoria, tipo: a.tipo, total: num(a.total), anterior: prev.get(a.categoria) ?? 0 }
  })
  // Categorías con gasto el mes pasado y nada este mes: también se muestran (bajaron a 0)
  for (const a of anterior) {
    if (!vistos.has(a.categoria)) lista.push({ categoria: a.categoria, tipo: a.tipo, total: 0, anterior: num(a.total) })
  }
  return lista.sort((a, b) => b.total - a.total)
}

/** Ventas de los últimos `dias` días hasta `hasta` (para los días de cobro). */
async function ventasUltimosDias(hasta: Date, dias: number): Promise<number> {
  const desde = new Date(hasta.getTime() - dias * 86_400_000)
  const [r] = await db
    .select({ total: sql<string>`COALESCE(SUM(${pedidos.total}), 0)::text` })
    .from(pedidos)
    .where(condVenta({ desde, hasta }))
  return num(r?.total)
}

export async function armarTablero(mes: string): Promise<TableroData | null> {
  const rango = rangoMesAR(mes)
  const rangoAnt = rangoMesAR(mesAnterior(mes))
  if (!rango || !rangoAnt) return null

  const hoyStr = todayStrAR()
  const hoy = parseFechaAR(hoyStr)
  const esMesActual = hoyStr.startsWith(`${mes}-`)

  const [actual, anterior] = await Promise.all([resultadoDelMes(rango), resultadoDelMes(rangoAnt)])
  const [cajaMes, deudaHoy, porMarca, clientesMes, porVendedor, embudoMes, gastosMes, ventas90] = await Promise.all([
    caja(rango, actual.ventas),
    deuda(hoy),
    ventasPorMarca(rango, rangoAnt),
    clientesDelMes(rango),
    ventasPorVendedor(rango, mes),
    embudo(rango),
    gastosPorCategoria(rango, rangoAnt),
    ventasUltimosDias(hoy, 90),
  ])

  return {
    mes,
    esMesActual,
    resultado: { actual, anterior },
    semaforo: semaforo(actual),
    puntoEquilibrio: puntoEquilibrio(actual),
    proyeccion: proyeccionCierre(mes, hoyStr, actual),
    caja: { ...cajaMes, diasDeCobro: diasDeCobro(deudaHoy.antiguedad.total, ventas90, 90) },
    deuda: deudaHoy,
    ventas: {
      porMarca,
      ticketPromedio: actual.cantidadPedidos > 0 ? actual.ventas / actual.cantidadPedidos : 0,
      ...clientesMes,
      porVendedor,
    },
    embudo: embudoMes,
    gastos: gastosMes,
  }
}
