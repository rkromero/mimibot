/**
 * Tablero de comando: reglas puras (sin base de datos), testeables.
 * Semáforo, punto de equilibrio, proyección de cierre, antigüedad de deuda.
 */
import type { AntiguedadDeuda, Proyeccion, PuntoEquilibrio, ResultadoMes, Semaforo } from './tipos'

/** Umbral de "equilibrio": resultado neto dentro del ±5 % de las ventas. */
export const UMBRAL_EQUILIBRIO_PCT = 0.05

/** Variación porcentual contra el mes anterior (null sin base de comparación). */
export function variacionPct(actual: number, anterior: number): number | null {
  if (!Number.isFinite(anterior) || anterior === 0) return null
  return (actual - anterior) / Math.abs(anterior)
}

export function armarResultado(p: {
  ventas: number
  cantidadPedidos: number
  costoDirecto: number
  gastoOperativo: number
}): ResultadoMes {
  const margenBruto = p.ventas - p.costoDirecto
  return {
    ventas: p.ventas,
    cantidadPedidos: p.cantidadPedidos,
    costoDirecto: p.costoDirecto,
    gastoOperativo: p.gastoOperativo,
    margenBruto,
    resultadoNeto: margenBruto - p.gastoOperativo,
  }
}

/** Ganando / equilibrio / perdiendo según el resultado neto sobre las ventas. */
export function semaforo(r: Pick<ResultadoMes, 'ventas' | 'resultadoNeto'>): Semaforo {
  if (r.ventas <= 0 && r.resultadoNeto === 0) return 'sin-datos'
  if (r.ventas <= 0) return r.resultadoNeto < 0 ? 'perdiendo' : 'ganando'
  const ratio = r.resultadoNeto / r.ventas
  if (Math.abs(ratio) < UMBRAL_EQUILIBRIO_PCT) return 'equilibrio'
  return ratio > 0 ? 'ganando' : 'perdiendo'
}

/**
 * Punto de equilibrio del mes: con el margen bruto que dejan las ventas,
 * cuánto hay que vender para cubrir los gastos operativos.
 * Sin ventas o sin margen positivo no se puede calcular.
 */
export function puntoEquilibrio(r: Pick<ResultadoMes, 'ventas' | 'costoDirecto' | 'gastoOperativo'>): PuntoEquilibrio {
  if (r.ventas <= 0) return null
  const margenBrutoPct = (r.ventas - r.costoDirecto) / r.ventas
  if (margenBrutoPct <= 0) return null
  const ventasNecesarias = r.gastoOperativo / margenBrutoPct
  const avance = ventasNecesarias > 0 ? r.ventas / ventasNecesarias : 1
  return {
    margenBrutoPct,
    ventasNecesarias,
    avance,
    faltante: Math.max(0, ventasNecesarias - r.ventas),
  }
}

/** Cantidad de días del mes "YYYY-MM". */
export function diasEnMes(mes: string): number {
  const [y, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate()
}

/**
 * Proyección lineal de cierre para el mes en curso: lo que va del mes,
 * extrapolado a los días totales. Para meses cerrados devuelve null.
 * `hoy` es "YYYY-MM-DD" en hora Argentina.
 */
export function proyeccionCierre(mes: string, hoy: string, r: ResultadoMes): Proyeccion {
  if (!hoy.startsWith(`${mes}-`)) return null
  const diaActual = Number(hoy.slice(8, 10))
  const diasDelMes = diasEnMes(mes)
  if (diaActual <= 0) return null
  const factor = diasDelMes / diaActual
  const ventas = r.ventas * factor
  const costoDirecto = r.costoDirecto * factor
  const gastoOperativo = r.gastoOperativo * factor
  return { diaActual, diasDelMes, ventas, resultadoNeto: ventas - costoDirecto - gastoOperativo }
}

export type PedidoConSaldo = { fecha: Date; saldo: number }

/** Días entre dos fechas (redondeado hacia abajo, nunca negativo). */
export function diasEntre(desde: Date, hasta: Date): number {
  return Math.max(0, Math.floor((hasta.getTime() - desde.getTime()) / 86_400_000))
}

/** Reparte la deuda por antigüedad del pedido: al día (<30), 30-59, 60-89, 90 o más... agrupado en 4 tramos. */
export function antiguedadDeuda(pedidos: PedidoConSaldo[], hoy: Date): AntiguedadDeuda {
  const acc: AntiguedadDeuda = { alDia: 0, d30: 0, d60: 0, mas60: 0, total: 0, pedidos: 0 }
  for (const p of pedidos) {
    if (p.saldo <= 0) continue
    const dias = diasEntre(p.fecha, hoy)
    if (dias < 30) acc.alDia += p.saldo
    else if (dias < 60) acc.d30 += p.saldo
    else if (dias < 90) acc.d60 += p.saldo
    else acc.mas60 += p.saldo
    acc.total += p.saldo
    acc.pedidos++
  }
  return acc
}

/**
 * Días de cobro (DSO simplificado): deuda total / venta diaria promedio del
 * período de referencia. null sin ventas.
 */
export function diasDeCobro(deudaTotal: number, ventasPeriodo: number, diasPeriodo: number): number | null {
  if (ventasPeriodo <= 0 || diasPeriodo <= 0) return null
  return deudaTotal / (ventasPeriodo / diasPeriodo)
}

/** Mes anterior de "YYYY-MM". */
export function mesAnterior(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  const prevY = m === 1 ? y! - 1 : y!
  const prevM = m === 1 ? 12 : m! - 1
  return `${prevY}-${String(prevM).padStart(2, '0')}`
}
