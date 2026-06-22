// Estadística de "visitas creadas" para el dashboard: cuenta las actividades
// tipo='visita' en estado 'completada' (las visitas efectivamente registradas)
// agrupadas por día, semana o mes sobre una ventana móvil (en hora AR), con
// desglose por resultado de la visita (Compró / No compró / No estaba / Reprogramar).

import { db } from '@/db'
import { actividadesCliente } from '@/db/schema'
import { and, eq, gte, count, sql } from 'drizzle-orm'
import {
  buildBuckets,
  windowStartMs,
  sqlTruncUnit,
  sqlKeyFormat,
  RANGO_LABEL,
  type Granularidad,
} from './date-buckets'
import { RESULTADOS, OTRO } from './visitas-resultados'

export type { Granularidad }
export { RANGO_LABEL }

const RESULTADO_VALUES = new Set<string>(RESULTADOS.map((r) => r.value))

export interface VisitasBucket {
  key: string
  label: string
  total: number
  /** Conteo por resultado (claves: compro/no_compro/no_estaba/reprogramar/otro). */
  porResultado: Record<string, number>
}

export interface VisitasStats {
  granularidad: Granularidad
  total: number
  data: VisitasBucket[]
  /** Total por resultado en toda la ventana. */
  totalPorResultado: Record<string, number>
}

function emptyResultados(): Record<string, number> {
  const r: Record<string, number> = {}
  for (const s of RESULTADOS) r[s.value] = 0
  r[OTRO.value] = 0
  return r
}

export async function getVisitasStats(granularidad: Granularidad): Promise<VisitasStats> {
  const buckets = buildBuckets(granularidad, Date.now())
  const startMs = windowStartMs(granularidad, Date.now())

  // Literales (sql.raw), no parámetros: la expresión debe ser idéntica en
  // SELECT y GROUP BY (ver fix en dashboard.service).
  const truncExpr = sql<string>`to_char(date_trunc(${sql.raw(`'${sqlTruncUnit(granularidad)}'`)}, ${actividadesCliente.createdAt} - interval '3 hours'), ${sql.raw(`'${sqlKeyFormat(granularidad)}'`)})`

  const rows = await db
    .select({
      key: truncExpr,
      resultado: actividadesCliente.resultado,
      total: count(),
    })
    .from(actividadesCliente)
    .where(
      and(
        eq(actividadesCliente.tipo, 'visita'),
        eq(actividadesCliente.estado, 'completada'),
        gte(actividadesCliente.createdAt, new Date(startMs)),
      ),
    )
    .groupBy(truncExpr, actividadesCliente.resultado)

  // bucketKey → { resultado → count }
  const porBucket = new Map<string, Record<string, number>>()
  const totalPorResultado = emptyResultados()

  for (const r of rows) {
    const seg = r.resultado && RESULTADO_VALUES.has(r.resultado) ? r.resultado : OTRO.value
    const n = Number(r.total)
    if (!porBucket.has(r.key)) porBucket.set(r.key, emptyResultados())
    porBucket.get(r.key)![seg] = (porBucket.get(r.key)![seg] ?? 0) + n
    totalPorResultado[seg] = (totalPorResultado[seg] ?? 0) + n
  }

  const data: VisitasBucket[] = buckets.map((b) => {
    const porResultado = porBucket.get(b.key) ?? emptyResultados()
    const total = Object.values(porResultado).reduce((s, v) => s + v, 0)
    return { key: b.key, label: b.label, total, porResultado }
  })

  const total = data.reduce((sum, b) => sum + b.total, 0)

  return { granularidad, total, data, totalPorResultado }
}
