// Estadística de "visitas creadas" para el dashboard: cuenta las actividades
// tipo='visita' en estado 'completada' (las visitas efectivamente registradas)
// agrupadas por día, semana o mes sobre una ventana móvil.
//
// Toda la agrupación se hace en hora de Argentina (UTC-3, sin horario de verano)
// para que los cortes de día/semana/mes coincidan con el calendario local.

import { db } from '@/db'
import { actividadesCliente } from '@/db/schema'
import { and, eq, gte, count, sql } from 'drizzle-orm'

export type Granularidad = 'dia' | 'semana' | 'mes'

export interface VisitasBucket {
  key: string
  label: string
  total: number
}

export interface VisitasStats {
  granularidad: Granularidad
  total: number
  data: VisitasBucket[]
}

// Argentina = UTC-3 fijo (sin DST).
const AR_OFFSET_MS = 3 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const CANTIDAD: Record<Granularidad, number> = { dia: 30, semana: 12, mes: 12 }

export const RANGO_LABEL: Record<Granularidad, string> = {
  dia: 'últimos 30 días',
  semana: 'últimas 12 semanas',
  mes: 'últimos 12 meses',
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// Componentes del "reloj de pared" AR a partir de un instante (ms UTC).
function arWall(ms: number): { y: number; mo: number; d: number; wd: number } {
  const shifted = new Date(ms - AR_OFFSET_MS)
  return {
    y: shifted.getUTCFullYear(),
    mo: shifted.getUTCMonth(),
    d: shifted.getUTCDate(),
    wd: shifted.getUTCDay(), // 0 = domingo
  }
}

// Instante UTC (ms) de la medianoche AR del día (y, mo, d).
function arMidnightMs(y: number, mo: number, d: number): number {
  return Date.UTC(y, mo, d) + AR_OFFSET_MS
}

export interface BucketDef {
  key: string
  label: string
  startMs: number
}

/**
 * Construye los buckets de una ventana móvil para la granularidad dada, en hora
 * AR. Pura y determinista — se exporta para testear sin tocar la base.
 */
export function buildVisitasBuckets(granularidad: Granularidad, nowMs: number): BucketDef[] {
  const now = arWall(nowMs)
  const buckets: BucketDef[] = []

  if (granularidad === 'dia') {
    const todayMid = arMidnightMs(now.y, now.mo, now.d)
    for (let i = CANTIDAD.dia - 1; i >= 0; i--) {
      const startMs = todayMid - i * DAY_MS
      const w = arWall(startMs)
      buckets.push({
        key: `${w.y}-${pad2(w.mo + 1)}-${pad2(w.d)}`,
        label: `${pad2(w.d)}/${pad2(w.mo + 1)}`,
        startMs,
      })
    }
  } else if (granularidad === 'semana') {
    const todayMid = arMidnightMs(now.y, now.mo, now.d)
    const isoDow = (now.wd + 6) % 7 // 0 = lunes
    const mondayMid = todayMid - isoDow * DAY_MS
    for (let i = CANTIDAD.semana - 1; i >= 0; i--) {
      const startMs = mondayMid - i * 7 * DAY_MS
      const w = arWall(startMs)
      buckets.push({
        key: `${w.y}-${pad2(w.mo + 1)}-${pad2(w.d)}`,
        label: `${pad2(w.d)}/${pad2(w.mo + 1)}`,
        startMs,
      })
    }
  } else {
    for (let i = CANTIDAD.mes - 1; i >= 0; i--) {
      let yy = now.y
      let mm = now.mo - i
      while (mm < 0) {
        mm += 12
        yy -= 1
      }
      buckets.push({
        key: `${yy}-${pad2(mm + 1)}`,
        label: `${MESES_CORTOS[mm]} ${String(yy).slice(2)}`,
        startMs: arMidnightMs(yy, mm, 1),
      })
    }
  }

  return buckets
}

export async function getVisitasStats(granularidad: Granularidad): Promise<VisitasStats> {
  const buckets = buildVisitasBuckets(granularidad, Date.now())
  const startMs = buckets[0]?.startMs ?? Date.now()

  // Clave de agrupación equivalente a la de buildVisitasBuckets, calculada en
  // hora AR (created_at se almacena en UTC → restamos 3 horas).
  const truncExpr =
    granularidad === 'mes'
      ? sql<string>`to_char(date_trunc('month', ${actividadesCliente.createdAt} - interval '3 hours'), 'YYYY-MM')`
      : granularidad === 'semana'
        ? sql<string>`to_char(date_trunc('week', ${actividadesCliente.createdAt} - interval '3 hours'), 'YYYY-MM-DD')`
        : sql<string>`to_char(date_trunc('day', ${actividadesCliente.createdAt} - interval '3 hours'), 'YYYY-MM-DD')`

  const rows = await db
    .select({ key: truncExpr, total: count() })
    .from(actividadesCliente)
    .where(
      and(
        eq(actividadesCliente.tipo, 'visita'),
        eq(actividadesCliente.estado, 'completada'),
        gte(actividadesCliente.createdAt, new Date(startMs)),
      ),
    )
    .groupBy(truncExpr)

  const totals = new Map(rows.map((r) => [r.key, Number(r.total)]))
  const data: VisitasBucket[] = buckets.map((b) => ({
    key: b.key,
    label: b.label,
    total: totals.get(b.key) ?? 0,
  }))
  const total = data.reduce((sum, b) => sum + b.total, 0)

  return { granularidad, total, data }
}
