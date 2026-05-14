'use client'

type EstadoMeta = 'en_curso' | 'cumplida' | 'no_cumplida'

interface MetricaAvance {
  alcanzado: number
  pct: number
  proyeccion: number
  estado: EstadoMeta
}

interface MetaAvance {
  meta: {
    id: string
    vendedorId: string
    periodoAnio: number
    periodoMes: number
    clientesNuevosObjetivo: number
    pedidosObjetivo: number
    montoCobradoObjetivo: string
    conversionLeadsObjetivo: string
  }
  clientesNuevos: MetricaAvance
  pedidos: MetricaAvance
  montoCobrado: MetricaAvance
  conversionLeads: MetricaAvance
}

interface User {
  id: string
  name: string | null
  email: string
  role: 'admin' | 'gerente' | 'agent'
  avatarColor: string
  isActive: boolean
}

export interface GerenteEquipo {
  gerenteId: string
  gerenteName: string | null
  gerenteEmail: string
  agenteIds: string[]
}

type Modo = 'vendedor' | 'gerente'

interface RankingSectionProps {
  avances: MetaAvance[]
  users: User[]
  equipos?: GerenteEquipo[]
  modo?: Modo
  onModoChange?: (modo: Modo) => void
}

const BADGE_STYLES = [
  { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '1°' },
  { bg: 'bg-gray-100', text: 'text-gray-600', label: '2°' },
  { bg: 'bg-orange-100', text: 'text-orange-700', label: '3°' },
]

const formatARS = (v: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(v)

interface RankingEntry {
  /** ID del sujeto (vendedorId si modo=vendedor, gerenteId si modo=gerente) */
  id: string
  /** Nombre a mostrar — ya resuelto por el padre así el RankingCard no toca users */
  displayName: string
  value: number
  displayValue: string
}

interface RankingCardProps {
  title: string
  entries: RankingEntry[]
}

function RankingCard({ title, entries }: RankingCardProps) {
  const top3 = entries.slice(0, 3)

  return (
    <div className="bg-card border border-border rounded-lg p-4 flex-1 min-w-[200px]">
      <p className="text-sm font-semibold text-foreground mb-3">{title}</p>
      {top3.length === 0 && (
        <p className="text-xs text-muted-foreground">Sin datos</p>
      )}
      <ol className="space-y-2">
        {top3.map((entry, index) => {
          const badge = BADGE_STYLES[index] ?? BADGE_STYLES[0]!
          return (
            <li key={entry.id} className="flex items-center gap-2">
              <span
                className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 ${badge.bg} ${badge.text}`}
              >
                {badge.label}
              </span>
              <span className="text-sm text-foreground truncate flex-1">
                {entry.displayName}
              </span>
              <span className="text-sm font-medium text-muted-foreground tabular-nums whitespace-nowrap">
                {entry.displayValue}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ─── Cálculo de rankings ──────────────────────────────────────────────────────

type MetricaKey = 'clientesNuevos' | 'pedidos' | 'montoCobrado' | 'conversionLeads'

function rankingPorVendedor(
  avances: MetaAvance[],
  users: User[],
  key: MetricaKey,
  fmt: (v: number) => string,
): RankingEntry[] {
  return [...avances]
    .sort((a, b) => b[key].alcanzado - a[key].alcanzado)
    .map((a) => {
      const user = users.find((u) => u.id === a.meta.vendedorId)
      const displayName = user?.name ?? user?.email ?? a.meta.vendedorId
      return {
        id: a.meta.vendedorId,
        displayName,
        value: a[key].alcanzado,
        displayValue: fmt(a[key].alcanzado),
      }
    })
}

function rankingPorGerente(
  avances: MetaAvance[],
  equipos: GerenteEquipo[],
  key: MetricaKey,
  fmt: (v: number) => string,
): RankingEntry[] {
  // Mapa rápido vendedorId → avance para sumar
  const avanceByVendedor = new Map(avances.map((a) => [a.meta.vendedorId, a]))

  // Por cada gerente, agregamos lo de sus agentes.
  // - clientesNuevos / pedidos / montoCobrado: suma simple
  // - conversionLeads: promedio simple del % de los agentes que tienen meta
  //   (no podemos hacer ponderado sin saber el #leads, eso requiere otro endpoint)
  const entries = equipos.map((eq) => {
    const conAvance = eq.agenteIds
      .map((id) => avanceByVendedor.get(id))
      .filter((a): a is MetaAvance => a != null)

    let value = 0
    if (conAvance.length > 0) {
      if (key === 'conversionLeads') {
        value =
          conAvance.reduce((sum, a) => sum + a.conversionLeads.alcanzado, 0) /
          conAvance.length
      } else {
        value = conAvance.reduce((sum, a) => sum + a[key].alcanzado, 0)
      }
    }

    return {
      id: eq.gerenteId,
      displayName: eq.gerenteName ?? eq.gerenteEmail,
      value,
      displayValue: fmt(value),
    }
  })

  return entries.sort((a, b) => b.value - a.value)
}

export default function RankingSection({
  avances,
  users,
  equipos = [],
  modo = 'vendedor',
  onModoChange,
}: RankingSectionProps) {
  const fmtInt = (v: number) => String(Math.round(v))
  const fmtPct = (v: number) => `${Math.round(v * 100) / 100}%`

  const ranks = modo === 'gerente'
    ? {
      clientesNuevos: rankingPorGerente(avances, equipos, 'clientesNuevos', fmtInt),
      pedidos: rankingPorGerente(avances, equipos, 'pedidos', fmtInt),
      montoCobrado: rankingPorGerente(avances, equipos, 'montoCobrado', formatARS),
      conversionLeads: rankingPorGerente(avances, equipos, 'conversionLeads', fmtPct),
    }
    : {
      clientesNuevos: rankingPorVendedor(avances, users, 'clientesNuevos', fmtInt),
      pedidos: rankingPorVendedor(avances, users, 'pedidos', fmtInt),
      montoCobrado: rankingPorVendedor(avances, users, 'montoCobrado', formatARS),
      conversionLeads: rankingPorVendedor(avances, users, 'conversionLeads', fmtPct),
    }

  return (
    <div className="space-y-3">
      {/* Toggle Por vendedor / Por gerente */}
      {onModoChange && equipos.length > 0 && (
        <div className="inline-flex rounded-md border border-border p-0.5 bg-card">
          <button
            type="button"
            onClick={() => onModoChange('vendedor')}
            className={
              modo === 'vendedor'
                ? 'px-3 py-1 text-xs font-medium rounded bg-primary text-primary-foreground'
                : 'px-3 py-1 text-xs font-medium rounded text-muted-foreground hover:text-foreground transition-colors'
            }
          >
            Por vendedor
          </button>
          <button
            type="button"
            onClick={() => onModoChange('gerente')}
            className={
              modo === 'gerente'
                ? 'px-3 py-1 text-xs font-medium rounded bg-primary text-primary-foreground'
                : 'px-3 py-1 text-xs font-medium rounded text-muted-foreground hover:text-foreground transition-colors'
            }
          >
            Por gerente
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4">
        <RankingCard title="Clientes Nuevos" entries={ranks.clientesNuevos} />
        <RankingCard title="Pedidos" entries={ranks.pedidos} />
        <RankingCard title="Monto Cobrado" entries={ranks.montoCobrado} />
        <RankingCard title="Conversión" entries={ranks.conversionLeads} />
      </div>
    </div>
  )
}
