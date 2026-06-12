import { startOfDay, startOfWeek, startOfMonth, addDays, addMonths } from 'date-fns'

export type Granularidad = 'dia' | 'semana' | 'mes'

export interface Rango {
  /** Inicio inclusivo (medianoche local). */
  desde: Date
  /** Fin exclusivo (medianoche local). */
  hasta: Date
}

const DOW_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const MES_LARGO = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/**
 * Devuelve el rango [desde, hasta) del período (día/semana/mes) que contiene a
 * `ancla`. La semana arranca el lunes.
 *  - día:    [d, d+1)
 *  - semana: [lunes, lunes+7)
 *  - mes:    [1° del mes, 1° del siguiente)
 */
export function getRango(granularidad: Granularidad, ancla: Date): Rango {
  switch (granularidad) {
    case 'dia': {
      const desde = startOfDay(ancla)
      return { desde, hasta: addDays(desde, 1) }
    }
    case 'semana': {
      const desde = startOfWeek(ancla, { weekStartsOn: 1 }) // lunes
      return { desde, hasta: addDays(desde, 7) }
    }
    case 'mes': {
      const desde = startOfMonth(ancla)
      return { desde, hasta: startOfMonth(addMonths(desde, 1)) }
    }
  }
}

/**
 * Período inmediatamente anterior, del mismo largo (día anterior, semana
 * anterior, mes calendario anterior). Su `hasta` coincide con el `desde` del
 * rango original.
 */
export function getRangoAnterior(granularidad: Granularidad, rango: Rango): Rango {
  switch (granularidad) {
    case 'dia':
      return { desde: addDays(rango.desde, -1), hasta: rango.desde }
    case 'semana':
      return { desde: addDays(rango.desde, -7), hasta: rango.desde }
    case 'mes':
      return { desde: startOfMonth(addMonths(rango.desde, -1)), hasta: rango.desde }
  }
}

/**
 * Nueva ancla al navegar un período hacia atrás (dir = -1) o adelante (dir = 1).
 * Conserva la granularidad: ±1 día, ±7 días o ±1 mes.
 */
export function navegar(granularidad: Granularidad, ancla: Date, dir: -1 | 1): Date {
  const base = getRango(granularidad, ancla).desde
  switch (granularidad) {
    case 'dia':
      return addDays(base, dir)
    case 'semana':
      return addDays(base, dir * 7)
    case 'mes':
      return addMonths(base, dir)
  }
}

/** Etiqueta legible del período actual. */
export function formatPeriodoLabel(granularidad: Granularidad, rango: Rango): string {
  if (granularidad === 'mes') {
    const d = rango.desde
    return `${MES_LARGO[d.getMonth()]} ${d.getFullYear()}`
  }
  if (granularidad === 'dia') {
    const d = rango.desde
    return `${d.getDate()} ${MES_CORTO[d.getMonth()]} ${d.getFullYear()}`
  }
  // semana: lunes (desde) → domingo (hasta - 1 día)
  const lunes = rango.desde
  const domingo = addDays(rango.hasta, -1)
  const dowL = DOW_CORTO[lunes.getDay()]
  const dowD = DOW_CORTO[domingo.getDay()]
  const sameYear = lunes.getFullYear() === domingo.getFullYear()
  const sameMonth = sameYear && lunes.getMonth() === domingo.getMonth()
  if (sameMonth) {
    return `${dowL} ${lunes.getDate()} – ${dowD} ${domingo.getDate()} ${MES_CORTO[domingo.getMonth()]} ${domingo.getFullYear()}`
  }
  if (sameYear) {
    return `${dowL} ${lunes.getDate()} ${MES_CORTO[lunes.getMonth()]} – ${dowD} ${domingo.getDate()} ${MES_CORTO[domingo.getMonth()]} ${domingo.getFullYear()}`
  }
  return `${dowL} ${lunes.getDate()} ${MES_CORTO[lunes.getMonth()]} ${lunes.getFullYear()} – ${dowD} ${domingo.getDate()} ${MES_CORTO[domingo.getMonth()]} ${domingo.getFullYear()}`
}

/** Formatea una fecha como YYYY-MM-DD usando sus componentes locales. */
export function toYmd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Etiqueta corta de una cohorte semanal a partir del lunes (YYYY-MM-DD):
 *  - mismo mes:  "8–14 Jun"
 *  - cruza mes:  "29 Jun–5 Jul"
 */
export function formatCohorteLabel(semanaInicioYmd: string): string {
  const [y, m, d] = semanaInicioYmd.split('-').map(Number) as [number, number, number]
  const lunes = new Date(y, m - 1, d)
  const domingo = addDays(lunes, 6)
  if (lunes.getMonth() === domingo.getMonth()) {
    return `${lunes.getDate()}–${domingo.getDate()} ${MES_CORTO[domingo.getMonth()]}`
  }
  return `${lunes.getDate()} ${MES_CORTO[lunes.getMonth()]}–${domingo.getDate()} ${MES_CORTO[domingo.getMonth()]}`
}
