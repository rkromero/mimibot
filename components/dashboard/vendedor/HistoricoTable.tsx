'use client'

import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MetaAvance, EstadoMeta } from '@/lib/metas/avance.service'

interface MonthEntry {
  label: string
  anio: number
  mes: number
  avance: MetaAvance | null
  error: boolean
}

const MONTH_NAMES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
]

function buildLast6Months(): Array<{ anio: number; mes: number; label: string }> {
  const result: Array<{ anio: number; mes: number; label: string }> = []
  const now = new Date()
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    result.push({
      anio: d.getFullYear(),
      mes: d.getMonth() + 1,
      label: `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
    })
  }
  return result
}

function cellClass(estado: EstadoMeta | undefined): string {
  if (!estado) return 'text-muted-foreground'
  if (estado === 'cumplida') return 'text-green-700'
  if (estado === 'no_cumplida') return 'text-red-600'
  return 'text-amber-600'
}

function countCumplidas(avance: MetaAvance): number {
  const kpis = [
    avance.clientesNuevos.estado,
    avance.pedidos.estado,
    avance.montoCobrado.estado,
    avance.conversionLeads.estado,
  ]
  return kpis.filter((e) => e === 'cumplida').length
}

const fmtARS = (v: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(v)

export default function HistoricoTable() {
  const [entries, setEntries] = useState<MonthEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const months = buildLast6Months()

    async function fetchAll() {
      const results = await Promise.all(
        months.map(async ({ anio, mes, label }) => {
          try {
            const res = await fetch(`/api/metas/avance?anio=${anio}&mes=${mes}`)
            if (!res.ok) {
              return { label, anio, mes, avance: null, error: true }
            }
            const json = (await res.json()) as { data: MetaAvance | null }
            return { label, anio, mes, avance: json.data ?? null, error: false }
          } catch {
            return { label, anio, mes, avance: null, error: true }
          }
        }),
      )
      setEntries(results)
      setLoading(false)
    }

    void fetchAll()
  }, [])

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <History size={16} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Historial (6 meses)</h2>
      </div>

      {loading && (
        <div className="rounded-xl border border-border bg-card p-4 animate-pulse h-40" />
      )}

      {!loading && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Mes</th>
                  <th className="px-2 py-2 text-center font-semibold text-muted-foreground">C.Nuevos</th>
                  <th className="px-2 py-2 text-center font-semibold text-muted-foreground">Pedidos</th>
                  <th className="px-2 py-2 text-center font-semibold text-muted-foreground">Monto</th>
                  <th className="px-2 py-2 text-center font-semibold text-muted-foreground">Conversión</th>
                  <th className="px-2 py-2 text-center font-semibold text-muted-foreground">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(({ label, avance, error, anio, mes }) => {
                  if (error) {
                    return (
                      <tr key={`${anio}-${mes}`} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 font-medium text-foreground">{label}</td>
                        <td colSpan={5} className="px-2 py-2 text-center text-muted-foreground italic">
                          Error al cargar
                        </td>
                      </tr>
                    )
                  }
                  if (!avance) {
                    return (
                      <tr key={`${anio}-${mes}`} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 font-medium text-foreground">{label}</td>
                        <td colSpan={5} className="px-2 py-2 text-center text-muted-foreground italic">
                          Sin meta
                        </td>
                      </tr>
                    )
                  }
                  const cumplidas = countCumplidas(avance)
                  const { meta } = avance
                  return (
                    <tr key={`${anio}-${mes}`} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">{label}</td>
                      <td className={cn('px-2 py-2 text-center tabular-nums', cellClass(avance.clientesNuevos.estado))}>
                        {avance.clientesNuevos.alcanzado}/{meta.clientesNuevosObjetivo}
                        <span className="ml-1 text-[10px] opacity-70">({avance.clientesNuevos.pct}%)</span>
                      </td>
                      <td className={cn('px-2 py-2 text-center tabular-nums', cellClass(avance.pedidos.estado))}>
                        {avance.pedidos.alcanzado}/{meta.pedidosObjetivo}
                        <span className="ml-1 text-[10px] opacity-70">({avance.pedidos.pct}%)</span>
                      </td>
                      <td className={cn('px-2 py-2 text-center tabular-nums whitespace-nowrap', cellClass(avance.montoCobrado.estado))}>
                        {fmtARS(avance.montoCobrado.alcanzado)}
                      </td>
                      <td className={cn('px-2 py-2 text-center tabular-nums', cellClass(avance.conversionLeads.estado))}>
                        {avance.conversionLeads.alcanzado}%/{meta.conversionLeadsObjetivo}%
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span
                          className={cn(
                            'inline-block rounded-full px-1.5 py-0.5 font-semibold tabular-nums',
                            cumplidas === 4 ? 'bg-green-100 text-green-700' :
                            cumplidas >= 2 ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-700',
                          )}
                        >
                          {cumplidas}/4
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
