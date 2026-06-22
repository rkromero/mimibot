// Estadística de "visitas creadas" para el dashboard: cuenta las actividades
// tipo='visita' en estado 'completada' (las visitas efectivamente registradas)
// agrupadas por día, semana o mes sobre una ventana móvil (en hora AR).

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

export type { Granularidad }
export { RANGO_LABEL }

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

export async function getVisitasStats(granularidad: Granularidad): Promise<VisitasStats> {
  const buckets = buildBuckets(granularidad, Date.now())
  const startMs = windowStartMs(granularidad, Date.now())

  const truncExpr = sql<string>`to_char(date_trunc(${sqlTruncUnit(granularidad)}, ${actividadesCliente.createdAt} - interval '3 hours'), ${sqlKeyFormat(granularidad)})`

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
