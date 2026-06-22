// Utilidades compartidas para los gráficos del dashboard: construcción de
// "buckets" (cubetas) de tiempo por día / semana / mes sobre una ventana móvil,
// y mapeo de una fecha a su bucket. Todo en hora de Argentina (UTC-3, sin DST).
//
// - Día:    últimos 30 días (una cubeta por día).
// - Semana: últimas 12 semanas (cubeta por semana, arranca lunes).
// - Mes:    últimos 12 meses (cubeta por mes).

export type Granularidad = 'dia' | 'semana' | 'mes'

export interface BucketDef {
  /** Clave estable que coincide con la agrupación SQL (to_char) y el mapeo JS. */
  key: string
  /** Etiqueta legible para el eje X. */
  label: string
}

const AR_OFFSET_MS = 3 * 60 * 60 * 1000

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export const CANTIDAD: Record<Granularidad, number> = { dia: 30, semana: 12, mes: 12 }

export const RANGO_LABEL: Record<Granularidad, string> = {
  dia: 'últimos 30 días',
  semana: 'últimas 12 semanas',
  mes: 'últimos 12 meses',
}

interface Cal {
  y: number
  mo: number // 0-11
  d: number
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// Fecha de calendario AR a partir de un instante (ms UTC).
function arCalFromInstant(ms: number): Cal {
  const s = new Date(ms - AR_OFFSET_MS)
  return { y: s.getUTCFullYear(), mo: s.getUTCMonth(), d: s.getUTCDate() }
}

// Date a mediodía UTC para hacer aritmética de calendario sin saltos de día.
function calNoon(c: Cal): Date {
  return new Date(Date.UTC(c.y, c.mo, c.d, 12))
}

function fromNoon(dt: Date): Cal {
  return { y: dt.getUTCFullYear(), mo: dt.getUTCMonth(), d: dt.getUTCDate() }
}

function dayKey(c: Cal): string {
  return `${c.y}-${pad2(c.mo + 1)}-${pad2(c.d)}`
}

function dayLabel(c: Cal): string {
  return `${pad2(c.d)}/${pad2(c.mo + 1)}`
}

// Lunes (ISO) de la semana que contiene a c.
function mondayOf(c: Cal): Cal {
  const dt = calNoon(c)
  const isoDow = (dt.getUTCDay() + 6) % 7 // 0 = lunes
  dt.setUTCDate(dt.getUTCDate() - isoDow)
  return fromNoon(dt)
}

/**
 * Construye la lista de buckets de la ventana móvil para la granularidad dada,
 * anclada en "hoy" (hora AR). Pura y determinista.
 */
export function buildBuckets(granularidad: Granularidad, nowMs: number): BucketDef[] {
  const today = arCalFromInstant(nowMs)
  const buckets: BucketDef[] = []

  if (granularidad === 'dia') {
    const base = calNoon(today)
    for (let i = CANTIDAD.dia - 1; i >= 0; i--) {
      const dt = new Date(base)
      dt.setUTCDate(dt.getUTCDate() - i)
      const c = fromNoon(dt)
      buckets.push({ key: dayKey(c), label: dayLabel(c) })
    }
  } else if (granularidad === 'semana') {
    const mon = calNoon(mondayOf(today))
    for (let i = CANTIDAD.semana - 1; i >= 0; i--) {
      const dt = new Date(mon)
      dt.setUTCDate(dt.getUTCDate() - i * 7)
      const c = fromNoon(dt)
      buckets.push({ key: dayKey(c), label: dayLabel(c) })
    }
  } else {
    for (let i = CANTIDAD.mes - 1; i >= 0; i--) {
      let yy = today.y
      let mm = today.mo - i
      while (mm < 0) {
        mm += 12
        yy -= 1
      }
      buckets.push({ key: `${yy}-${pad2(mm + 1)}`, label: `${MESES_CORTOS[mm]} ${String(yy).slice(2)}` })
    }
  }

  return buckets
}

/**
 * Instante (ms UTC) usado como cota inferior para filtrar en SQL. Es la fecha del
 * primer bucket menos un día (a medianoche UTC) — generoso a propósito: se
 * sobre-trae un poco y el bucketing en JS descarta lo que no cae en una cubeta.
 */
export function windowStartMs(granularidad: Granularidad, nowMs: number): number {
  const buckets = buildBuckets(granularidad, nowMs)
  const firstKey = buckets[0]?.key ?? ''
  const parts = firstKey.split('-').map(Number)
  const y = parts[0] ?? 2000
  const mo = (parts[1] ?? 1) - 1
  const d = granularidad === 'mes' ? 1 : (parts[2] ?? 1)
  return Date.UTC(y, mo, d) - 24 * 60 * 60 * 1000
}

function keyForCal(granularidad: Granularidad, c: Cal): string {
  if (granularidad === 'dia') return dayKey(c)
  if (granularidad === 'semana') return dayKey(mondayOf(c))
  return `${c.y}-${pad2(c.mo + 1)}`
}

/** Bucket de un timestamp real (createdAt, etc.), interpretado en hora AR. */
export function bucketKeyFromInstant(granularidad: Granularidad, ms: number): string {
  return keyForCal(granularidad, arCalFromInstant(ms))
}

/**
 * Bucket de una "fecha de negocio" (p. ej. pedidos.fecha, guardada a medianoche
 * UTC): se usa la porción de fecha UTC directamente, sin corrimiento horario.
 */
export function bucketKeyFromBusinessDate(granularidad: Granularidad, dt: Date): string {
  return keyForCal(granularidad, { y: dt.getUTCFullYear(), mo: dt.getUTCMonth(), d: dt.getUTCDate() })
}

/** Expresión SQL para agrupar un timestamp (en hora AR) según la granularidad. */
export function sqlTruncUnit(granularidad: Granularidad): 'day' | 'week' | 'month' {
  return granularidad === 'mes' ? 'month' : granularidad === 'semana' ? 'week' : 'day'
}

/** Formato de to_char que coincide con las claves de buildBuckets. */
export function sqlKeyFormat(granularidad: Granularidad): string {
  return granularidad === 'mes' ? 'YYYY-MM' : 'YYYY-MM-DD'
}
