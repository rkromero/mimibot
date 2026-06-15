'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { EmbudoStats, CohorteSemanal, ClienteEnRiesgo } from '@/lib/admin/embudo.service'
import {
  type Granularidad,
  type Rango,
  getRango,
  getRangoAnterior,
  navegar,
  formatPeriodoLabel,
  formatCohorteLabel,
  toYmd,
} from './embudoRango'

interface Props {
  territorioId?: string
  gerenteId?: string
}

interface VendedorOption {
  id: string
  name: string | null
  email: string
  role: string
}

const GRANULARIDADES: { value: Granularidad; label: string }[] = [
  { value: 'dia', label: 'Día' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
]

// ─── Subcomponentes ─────────────────────────────────────────────────────────

function Delta({ actual, anterior }: { actual: number; anterior: number }) {
  const diff = actual - anterior
  const cls = diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-muted-foreground'
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '='
  const signed = diff > 0 ? `+${diff}` : String(diff)
  return (
    <span className={`text-xs font-medium ${cls}`}>
      {arrow} {signed} <span className="text-muted-foreground">({anterior})</span>
    </span>
  )
}

function EmbudoCard({
  label,
  value,
  actual,
  anterior,
  subtitle,
}: {
  label: string
  value: number
  actual: number
  anterior: number
  subtitle?: string
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-1">
      <span className="text-2xl font-bold text-foreground tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
      <Delta actual={actual} anterior={anterior} />
      {subtitle !== undefined && (
        <span className="text-xs text-muted-foreground mt-0.5">{subtitle}</span>
      )}
    </div>
  )
}

function CardsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-28 rounded-lg border border-border bg-muted/30 animate-pulse" />
      ))}
    </div>
  )
}

const UMBRALES_RIESGO = [7, 14, 21, 30]

function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-8 rounded border border-border bg-muted/30 animate-pulse" />
      ))}
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {message}
    </div>
  )
}

// ─── Bloque: conversión por cohorte ──────────────────────────────────────────

function CohortesBlock({
  cohortes,
  loading,
  error,
}: {
  cohortes: CohorteSemanal[] | null
  loading: boolean
  error: string | null
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">
        Conversión por cohorte (últimas 4 semanas)
      </h3>
      {error ? (
        <ErrorBanner message={error} />
      ) : loading || !cohortes ? (
        <TableSkeleton rows={4} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <th className="text-left font-medium px-3 py-2">Semana</th>
                <th className="text-right font-medium px-3 py-2">Creados</th>
                <th className="text-right font-medium px-3 py-2">Con pedido</th>
                <th className="text-right font-medium px-3 py-2">% conversión</th>
              </tr>
            </thead>
            <tbody>
              {cohortes.map((c) => {
                const pct = c.creados > 0 ? (c.conPedido / c.creados) * 100 : null
                const alerta = c.creados > 0 && pct !== null && pct < 50
                return (
                  <tr
                    key={c.semanaInicio}
                    className={`border-b border-border last:border-0 ${alerta ? 'bg-amber-50' : ''}`}
                  >
                    <td className="px-3 py-2 text-foreground">{formatCohorteLabel(c.semanaInicio)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">{c.creados}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">{c.conPedido}</td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-medium ${alerta ? 'text-amber-700' : 'text-foreground'}`}
                    >
                      {pct !== null ? `${Number(pct.toFixed(1))}%` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Bloque: clientes en riesgo ──────────────────────────────────────────────

function RiesgoBlock({
  clientes,
  loading,
  error,
  umbral,
  onUmbralChange,
}: {
  clientes: ClienteEnRiesgo[] | null
  loading: boolean
  error: string | null
  umbral: number
  onUmbralChange: (dias: number) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          Clientes en riesgo (1-2 pedidos, sin pedido hace {umbral}+ días)
        </h3>
        <select
          value={umbral}
          onChange={(e) => onUmbralChange(Number(e.target.value))}
          aria-label="Umbral de días sin pedido"
          className="text-sm border border-border rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {UMBRALES_RIESGO.map((d) => (
            <option key={d} value={d}>
              {d} días
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <ErrorBanner message={error} />
      ) : loading || !clientes ? (
        <TableSkeleton rows={5} />
      ) : clientes.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          Sin clientes en riesgo 🎉
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <th className="text-left font-medium px-3 py-2">Cliente</th>
                <th className="text-right font-medium px-3 py-2">Pedidos</th>
                <th className="text-left font-medium px-3 py-2">Último pedido</th>
                <th className="text-right font-medium px-3 py-2">Días sin pedido</th>
                <th className="text-left font-medium px-3 py-2">Vendedor</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <Link
                      href={`/crm/clientes/${c.id}`}
                      className="text-primary hover:underline"
                    >
                      {`${c.nombre} ${c.apellido}`.trim()}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">
                    {c.cantidadPedidos}
                  </td>
                  <td className="px-3 py-2 text-foreground tabular-nums">{c.fechaUltimoPedido}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">
                    {c.diasSinPedido}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{c.vendedorNombre ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ───────────────────────────────────────────────────

export default function EmbudoSection({ territorioId, gerenteId }: Props) {
  const [granularidad, setGranularidad] = useState<Granularidad>('semana')
  // Se inicializa en el mount para evitar mismatch de hidratación SSR/CSR.
  const [ancla, setAncla] = useState<Date | null>(null)
  const [vendedorId, setVendedorId] = useState('')
  const [vendedores, setVendedores] = useState<VendedorOption[]>([])

  const [stats, setStats] = useState<EmbudoStats | null>(null)
  const [statsPrev, setStatsPrev] = useState<EmbudoStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Cohortes (no dependen del selector de período: siempre últimas 4 semanas).
  const [cohortes, setCohortes] = useState<CohorteSemanal[] | null>(null)
  const [cohortesLoading, setCohortesLoading] = useState(true)
  const [cohortesError, setCohortesError] = useState<string | null>(null)

  // Clientes en riesgo (umbral configurable, independiente del período).
  const [umbralRiesgo, setUmbralRiesgo] = useState(14)
  const [riesgo, setRiesgo] = useState<ClienteEnRiesgo[] | null>(null)
  const [riesgoLoading, setRiesgoLoading] = useState(true)
  const [riesgoError, setRiesgoError] = useState<string | null>(null)

  // Ancla inicial: semana en curso (lunes).
  useEffect(() => {
    setAncla(getRango('semana', new Date()).desde)
  }, [])

  // Lista de vendedores/agentes (una sola vez).
  useEffect(() => {
    void fetch('/api/users?role=vendedor,agent,rtv')
      .then(async (r) => (r.ok ? ((await r.json()) as { data: VendedorOption[] }).data : []))
      .then((data) => setVendedores(data))
      .catch(() => setVendedores([]))
  }, [])

  // Carga de datos: período actual + anterior en paralelo.
  useEffect(() => {
    if (!ancla) return
    let cancelled = false
    setLoading(true)
    setError(null)

    const rango = getRango(granularidad, ancla)
    const prev = getRangoAnterior(granularidad, rango)

    const buildUrl = (r: Rango) => {
      const qs = new URLSearchParams({ desde: toYmd(r.desde), hasta: toYmd(r.hasta) })
      if (territorioId) qs.set('territorioId', territorioId)
      else if (gerenteId) qs.set('gerenteId', gerenteId)
      if (vendedorId) qs.set('vendedorId', vendedorId)
      return `/api/admin/embudo?${qs.toString()}`
    }

    const fetchEmbudo = async (r: Rango): Promise<EmbudoStats> => {
      const res = await fetch(buildUrl(r))
      if (!res.ok) throw new Error('Error al cargar el embudo')
      return ((await res.json()) as { data: EmbudoStats }).data
    }

    Promise.all([fetchEmbudo(rango), fetchEmbudo(prev)])
      .then(([cur, prv]) => {
        if (cancelled) return
        setStats(cur)
        setStatsPrev(prv)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Error al cargar el embudo')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [territorioId, gerenteId, granularidad, ancla, vendedorId])

  // Cohortes: últimas 4 semanas. Sólo depende de los filtros (no del período).
  useEffect(() => {
    let cancelled = false
    setCohortesLoading(true)
    setCohortesError(null)

    const qs = new URLSearchParams({ semanas: '4' })
    if (territorioId) qs.set('territorioId', territorioId)
    else if (gerenteId) qs.set('gerenteId', gerenteId)
    if (vendedorId) qs.set('vendedorId', vendedorId)

    fetch(`/api/admin/embudo/cohortes?${qs.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Error al cargar las cohortes')
        return ((await r.json()) as { data: CohorteSemanal[] }).data
      })
      .then((data) => {
        if (!cancelled) setCohortes(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) setCohortesError(err instanceof Error ? err.message : 'Error al cargar las cohortes')
      })
      .finally(() => {
        if (!cancelled) setCohortesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [territorioId, gerenteId, vendedorId])

  // Clientes en riesgo: depende de los filtros y del umbral (no del período).
  useEffect(() => {
    let cancelled = false
    setRiesgoLoading(true)
    setRiesgoError(null)

    const qs = new URLSearchParams({ diasSinPedido: String(umbralRiesgo) })
    if (territorioId) qs.set('territorioId', territorioId)
    else if (gerenteId) qs.set('gerenteId', gerenteId)
    if (vendedorId) qs.set('vendedorId', vendedorId)

    fetch(`/api/admin/embudo/riesgo?${qs.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Error al cargar los clientes en riesgo')
        return ((await r.json()) as { data: ClienteEnRiesgo[] }).data
      })
      .then((data) => {
        if (!cancelled) setRiesgo(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) setRiesgoError(err instanceof Error ? err.message : 'Error al cargar los clientes en riesgo')
      })
      .finally(() => {
        if (!cancelled) setRiesgoLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [territorioId, gerenteId, vendedorId, umbralRiesgo])

  const rango = ancla ? getRango(granularidad, ancla) : null
  const periodoLabel = rango ? formatPeriodoLabel(granularidad, rango) : '—'

  const irAnterior = () => setAncla((a) => (a ? navegar(granularidad, a, -1) : a))
  const irSiguiente = () => setAncla((a) => (a ? navegar(granularidad, a, 1) : a))

  const pctConversion =
    stats && stats.aperturas > 0 ? (stats.aperturasConPedido / stats.aperturas) * 100 : null

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Embudo de Apertura</h2>

      {/* Controles: granularidad + navegación + período + vendedor */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Toggle Día / Semana / Mes */}
        <div className="inline-flex rounded-md border border-border p-0.5 bg-card">
          {GRANULARIDADES.map((g) => (
            <button
              key={g.value}
              type="button"
              onClick={() => setGranularidad(g.value)}
              className={
                granularidad === g.value
                  ? 'px-3 py-1 text-xs font-medium rounded bg-primary text-primary-foreground'
                  : 'px-3 py-1 text-xs font-medium rounded text-muted-foreground hover:text-foreground transition-colors'
              }
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* Navegación de período */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={irAnterior}
            disabled={!ancla}
            aria-label="Período anterior"
            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border bg-card text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-foreground min-w-[180px] text-center tabular-nums">
            {periodoLabel}
          </span>
          <button
            type="button"
            onClick={irSiguiente}
            disabled={!ancla}
            aria-label="Período siguiente"
            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border bg-card text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Selector de vendedor */}
        <select
          value={vendedorId}
          onChange={(e) => setVendedorId(e.target.value)}
          className="text-sm border border-border rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Todos los vendedores</option>
          {vendedores.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name ?? v.email}
            </option>
          ))}
        </select>
      </div>

      {/* Estados */}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : loading || !stats || !statsPrev ? (
        <CardsSkeleton />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <EmbudoCard
            label="Aperturas"
            value={stats.aperturas}
            actual={stats.aperturas}
            anterior={statsPrev.aperturas}
          />
          <EmbudoCard
            label="Convirtieron"
            value={stats.aperturasConPedido}
            actual={stats.aperturasConPedido}
            anterior={statsPrev.aperturasConPedido}
            subtitle={
              pctConversion !== null
                ? `${Number(pctConversion.toFixed(1))}% de aperturas`
                : '— de aperturas'
            }
          />
          <EmbudoCard
            label="Recompras"
            value={stats.recompras}
            actual={stats.recompras}
            anterior={statsPrev.recompras}
            subtitle={`1ros pedidos: ${stats.primerosPedidos}`}
          />
          <EmbudoCard
            label="Consolidados (3er pedido pago)"
            value={stats.consolidados}
            actual={stats.consolidados}
            anterior={statsPrev.consolidados}
          />
        </div>
      )}

      {/* Bloque: conversión por cohorte (últimas 4 semanas) */}
      <CohortesBlock cohortes={cohortes} loading={cohortesLoading} error={cohortesError} />

      {/* Bloque: clientes en riesgo */}
      <RiesgoBlock
        clientes={riesgo}
        loading={riesgoLoading}
        error={riesgoError}
        umbral={umbralRiesgo}
        onUmbralChange={setUmbralRiesgo}
      />
    </div>
  )
}
