'use client'

import { useEffect, useState } from 'react'
import { History, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MetaAvance, EstadoMeta } from '@/lib/metas/avance.service'

interface Props {
  role?: string
}

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
  if (estado === 'cumplida') return 'text-green-700 dark:text-green-400'
  if (estado === 'no_cumplida') return 'text-red-600 dark:text-red-400'
  return 'text-amber-600 dark:text-amber-400'
}

function resultBadgeClass(cumplidas: number, total: number): string {
  if (cumplidas === total) return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
  if (cumplidas >= Math.ceil(total / 2)) return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
  return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
}

function countCumplidas(avance: MetaAvance, role?: string): { cumplidas: number; total: number } {
  if (role === 'agent') {
    const kpis = [avance.clientesNuevos.estado, avance.conversionLeads.estado]
    let cumplidas = kpis.filter((e) => e === 'cumplida').length
    let total = 2
    if (avance.pctClientesConPedido.estado !== 'na') {
      total++
      if (avance.pctClientesConPedido.estado === 'cumplida') cumplidas++
    }
    if (avance.pctPedidosPagados.estado !== 'na') {
      total++
      if (avance.pctPedidosPagados.estado === 'cumplida') cumplidas++
    }
    return { cumplidas, total }
  }
  const kpis = [
    avance.clientesNuevos.estado,
    avance.pedidos.estado,
    avance.montoCobrado.estado,
    avance.conversionLeads.estado,
  ]
  let cumplidas = kpis.filter((e) => e === 'cumplida').length
  let total = 4
  if (avance.pctClientesConPedido.estado !== 'na') {
    total = 5
    if (avance.pctClientesConPedido.estado === 'cumplida') cumplidas++
  }
  return { cumplidas, total }
}

const fmtARS = (v: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(v)

export default function HistoricoTable({ role }: Props) {
  const [entries, setEntries] = useState<MonthEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showSinMeta, setShowSinMeta] = useState(false)

  const isAgent = role === 'agent'

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  useEffect(() => {
    const months = buildLast6Months()

    async function fetchAll() {
      const results = await Promise.all(
        months.map(async ({ anio, mes, label }) => {
          try {
            const res = await fetch(`/api/metas/avance?anio=${anio}&mes=${mes}`)
            if (!res.ok) return { label, anio, mes, avance: null, error: true }
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

  const sinMetaCount = entries.filter((e) => !e.error && e.avance === null).length
  const visibleEntries = showSinMeta
    ? entries
    : entries.filter((e) => e.error || e.avance !== null)

  return (
    <section className="space-y-3">
      {/* Section header + toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Historial (6 meses)</h2>
        </div>
        {sinMetaCount > 0 && !loading && (
          <button
            onClick={() => setShowSinMeta((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-2 px-3 rounded-lg min-h-[44px] -mr-3"
            aria-label={showSinMeta ? 'Ocultar meses sin meta' : `Mostrar ${sinMetaCount} meses sin meta`}
          >
            {showSinMeta ? 'Ocultar sin meta' : `Ver ${sinMetaCount} sin meta`}
            <ChevronDown
              className={cn('w-3.5 h-3.5 transition-transform duration-200', showSinMeta && 'rotate-180')}
            />
          </button>
        )}
      </div>

      {loading && (
        <div className="rounded-xl border border-border bg-card p-4 animate-pulse h-40" />
      )}

      {!loading && (
        <>
          {/* ── MOBILE (< sm): stacked cards, one per month ── */}
          <div className="sm:hidden space-y-2">
            {visibleEntries.map(({ label, avance, error, anio, mes }) => {
              const isCurrent = anio === currentYear && mes === currentMonth

              if (error) {
                return (
                  <div
                    key={`${anio}-${mes}`}
                    className={cn(
                      'rounded-xl border border-border bg-card p-4',
                      isCurrent && 'bg-primary/5 border-primary/20',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">{label}</p>
                      {isCurrent && (
                        <span className="text-[10px] uppercase tracking-wider text-primary font-semibold">
                          Mes actual
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground italic mt-1">Error al cargar</p>
                  </div>
                )
              }

              if (!avance) {
                return (
                  <div
                    key={`${anio}-${mes}`}
                    className={cn(
                      'rounded-xl border border-border bg-card p-4',
                      isCurrent && 'bg-primary/5 border-primary/20',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">{label}</p>
                      <span className="text-xs text-muted-foreground italic">Sin meta</span>
                    </div>
                  </div>
                )
              }

              const { cumplidas, total } = countCumplidas(avance, role)
              const { meta } = avance

              return (
                <div
                  key={`${anio}-${mes}`}
                  className={cn(
                    'rounded-xl border border-border bg-card p-4 space-y-3',
                    isCurrent && 'bg-primary/5 border-primary/20',
                  )}
                >
                  {/* Card header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{label}</p>
                      {isCurrent && (
                        <span className="text-[10px] uppercase tracking-wider text-primary font-semibold">
                          Actual
                        </span>
                      )}
                    </div>
                    <span
                      className={cn(
                        'inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums whitespace-nowrap',
                        resultBadgeClass(cumplidas, total),
                      )}
                    >
                      {cumplidas}/{total} metas
                    </span>
                  </div>

                  {isAgent ? (
                    /* Agent KPIs: C.Nuevos, Conversión, Cobertura, % Ped.Pagados */
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                      <div className="flex justify-between gap-1">
                        <span className="text-muted-foreground shrink-0">C.Nuevos</span>
                        <span className={cn('tabular-nums font-medium', cellClass(avance.clientesNuevos.estado))}>
                          {avance.clientesNuevos.alcanzado}/{meta.clientesNuevosObjetivo}
                        </span>
                      </div>
                      <div className="flex justify-between gap-1">
                        <span className="text-muted-foreground shrink-0">Conversión</span>
                        <span className={cn('tabular-nums font-medium', cellClass(avance.conversionLeads.estado))}>
                          {avance.conversionLeads.alcanzado}%/{meta.conversionLeadsObjetivo}%
                        </span>
                      </div>
                      <div className="flex justify-between gap-1">
                        <span className="text-muted-foreground shrink-0">Cobertura</span>
                        <span
                          className={cn(
                            'tabular-nums font-medium',
                            avance.pctClientesConPedido.estado === 'na'
                              ? 'text-muted-foreground'
                              : cellClass(avance.pctClientesConPedido.estado),
                          )}
                        >
                          {avance.pctClientesConPedido.estado === 'na'
                            ? '—'
                            : `${avance.pctClientesConPedido.alcanzado}%/${meta.pctClientesConPedidoObjetivo}%`}
                        </span>
                      </div>
                      <div className="flex justify-between gap-1">
                        <span className="text-muted-foreground shrink-0">Ped.Pagados</span>
                        <span
                          className={cn(
                            'tabular-nums font-medium',
                            avance.pctPedidosPagados.estado === 'na'
                              ? 'text-muted-foreground'
                              : cellClass(avance.pctPedidosPagados.estado),
                          )}
                        >
                          {avance.pctPedidosPagados.estado === 'na'
                            ? '—'
                            : `${avance.pctPedidosPagados.alcanzado}%/${meta.pctPedidosPagadosObjetivo}%`}
                        </span>
                      </div>
                    </div>
                  ) : (
                    /* Vendedor KPIs: C.Nuevos, Pedidos, Conversión, Cobertura + Monto cobrado */
                    <>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                        <div className="flex justify-between gap-1">
                          <span className="text-muted-foreground shrink-0">C.Nuevos</span>
                          <span className={cn('tabular-nums font-medium', cellClass(avance.clientesNuevos.estado))}>
                            {avance.clientesNuevos.alcanzado}/{meta.clientesNuevosObjetivo}
                          </span>
                        </div>
                        <div className="flex justify-between gap-1">
                          <span className="text-muted-foreground shrink-0">Pedidos</span>
                          <span className={cn('tabular-nums font-medium', cellClass(avance.pedidos.estado))}>
                            {avance.pedidos.alcanzado}/{meta.pedidosObjetivo}
                          </span>
                        </div>
                        <div className="flex justify-between gap-1">
                          <span className="text-muted-foreground shrink-0">Conversión</span>
                          <span className={cn('tabular-nums font-medium', cellClass(avance.conversionLeads.estado))}>
                            {avance.conversionLeads.alcanzado}%/{meta.conversionLeadsObjetivo}%
                          </span>
                        </div>
                        <div className="flex justify-between gap-1">
                          <span className="text-muted-foreground shrink-0">Cobertura</span>
                          <span
                            className={cn(
                              'tabular-nums font-medium',
                              avance.pctClientesConPedido.estado === 'na'
                                ? 'text-muted-foreground'
                                : cellClass(avance.pctClientesConPedido.estado),
                            )}
                          >
                            {avance.pctClientesConPedido.estado === 'na'
                              ? '—'
                              : `${avance.pctClientesConPedido.alcanzado}%/${meta.pctClientesConPedidoObjetivo}%`}
                          </span>
                        </div>
                      </div>

                      {/* Monto cobrado — full width row */}
                      <div className="flex justify-between text-xs border-t border-border pt-2">
                        <span className="text-muted-foreground">Monto cobrado</span>
                        <span className={cn('tabular-nums font-medium', cellClass(avance.montoCobrado.estado))}>
                          {fmtARS(avance.montoCobrado.alcanzado)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )
            })}

            {visibleEntries.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Sin datos de historial
              </p>
            )}
          </div>

          {/* ── TABLET / DESKTOP (≥ sm): table view ── */}
          <div className="hidden sm:block rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Mes</th>
                    <th className="px-2 py-2 text-center font-semibold text-muted-foreground">C.Nuevos</th>
                    {!isAgent && (
                      <>
                        <th className="px-2 py-2 text-center font-semibold text-muted-foreground">Pedidos</th>
                        <th className="px-2 py-2 text-center font-semibold text-muted-foreground">Monto</th>
                      </>
                    )}
                    <th className="px-2 py-2 text-center font-semibold text-muted-foreground">Conversión</th>
                    <th className="px-2 py-2 text-center font-semibold text-muted-foreground">Cobertura</th>
                    {isAgent && (
                      <th className="px-2 py-2 text-center font-semibold text-muted-foreground">% Ped.Pagados</th>
                    )}
                    <th className="px-2 py-2 text-center font-semibold text-muted-foreground">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEntries.map(({ label, avance, error, anio, mes }) => {
                    const isCurrent = anio === currentYear && mes === currentMonth
                    const rowBase = cn(
                      'border-b border-border last:border-0',
                      isCurrent ? 'bg-primary/5' : 'hover:bg-muted/20 transition-colors',
                    )
                    // Mes col + data cols + Resultado col
                    const dataColSpan = isAgent ? 5 : 6

                    if (error) {
                      return (
                        <tr key={`${anio}-${mes}`} className={rowBase}>
                          <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">{label}</td>
                          <td colSpan={dataColSpan} className="px-2 py-2 text-center text-muted-foreground italic">
                            Error al cargar
                          </td>
                        </tr>
                      )
                    }

                    if (!avance) {
                      return (
                        <tr key={`${anio}-${mes}`} className={rowBase}>
                          <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">{label}</td>
                          <td colSpan={dataColSpan} className="px-2 py-2 text-center text-muted-foreground italic">
                            Sin meta
                          </td>
                        </tr>
                      )
                    }

                    const { cumplidas, total } = countCumplidas(avance, role)
                    const { meta } = avance

                    return (
                      <tr key={`${anio}-${mes}`} className={rowBase}>
                        <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                          {label}
                          {isCurrent && (
                            <span className="ml-1.5 text-[10px] uppercase tracking-wider text-primary font-semibold">
                              ●
                            </span>
                          )}
                        </td>
                        <td className={cn('px-2 py-2 text-center tabular-nums', cellClass(avance.clientesNuevos.estado))}>
                          {avance.clientesNuevos.alcanzado}/{meta.clientesNuevosObjetivo}
                          <span className="ml-1 text-[10px] opacity-70">({avance.clientesNuevos.pct}%)</span>
                        </td>
                        {!isAgent && (
                          <>
                            <td className={cn('px-2 py-2 text-center tabular-nums', cellClass(avance.pedidos.estado))}>
                              {avance.pedidos.alcanzado}/{meta.pedidosObjetivo}
                              <span className="ml-1 text-[10px] opacity-70">({avance.pedidos.pct}%)</span>
                            </td>
                            <td className={cn('px-2 py-2 text-center tabular-nums whitespace-nowrap', cellClass(avance.montoCobrado.estado))}>
                              {fmtARS(avance.montoCobrado.alcanzado)}
                            </td>
                          </>
                        )}
                        <td className={cn('px-2 py-2 text-center tabular-nums', cellClass(avance.conversionLeads.estado))}>
                          {avance.conversionLeads.alcanzado}%/{meta.conversionLeadsObjetivo}%
                        </td>
                        <td
                          className={cn(
                            'px-2 py-2 text-center tabular-nums',
                            avance.pctClientesConPedido.estado === 'na'
                              ? 'text-muted-foreground'
                              : cellClass(avance.pctClientesConPedido.estado),
                          )}
                        >
                          {avance.pctClientesConPedido.estado === 'na'
                            ? '—'
                            : `${avance.pctClientesConPedido.alcanzado}%/${meta.pctClientesConPedidoObjetivo}%`}
                        </td>
                        {isAgent && (
                          <td
                            className={cn(
                              'px-2 py-2 text-center tabular-nums',
                              avance.pctPedidosPagados.estado === 'na'
                                ? 'text-muted-foreground'
                                : cellClass(avance.pctPedidosPagados.estado),
                            )}
                          >
                            {avance.pctPedidosPagados.estado === 'na'
                              ? '—'
                              : `${avance.pctPedidosPagados.alcanzado}%/${meta.pctPedidosPagadosObjetivo}%`}
                          </td>
                        )}
                        <td className="px-2 py-2 text-center">
                          <span
                            className={cn(
                              'inline-block rounded-full px-1.5 py-0.5 font-semibold tabular-nums whitespace-nowrap',
                              resultBadgeClass(cumplidas, total),
                            )}
                          >
                            {cumplidas}/{total}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
