'use client'

type EstadoMeta = 'en_curso' | 'cumplida' | 'no_cumplida'
type EstadoCobertura = EstadoMeta | 'na'

interface MetricaAvance {
  alcanzado: number
  pct: number
  proyeccion: number
  estado: EstadoMeta
}

interface MetricaCobertura {
  alcanzado: number | null
  pct: number | null
  proyeccion: number | null
  estado: EstadoCobertura
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
    pctClientesConPedidoObjetivo: string
    pctPedidosPagadosObjetivo: string
    pctCobranzaObjetivo: string
  }
  clientesNuevos: MetricaAvance
  clientesPrimerPedido: MetricaAvance
  pedidos: MetricaAvance
  montoCobrado: MetricaAvance
  conversionLeads: MetricaAvance
  pctClientesConPedido: MetricaCobertura
  pctPedidosPagados: MetricaCobertura
  pctCobranza: MetricaCobertura
}

interface User {
  id: string
  name: string | null
  email: string
  role: 'admin' | 'gerente' | 'agent' | 'vendedor'
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

type MetricaKey = 'clientesNuevos' | 'pedidos' | 'conversionLeads'

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

function rankingPctPedidosPagadosPorVendedor(
  avances: MetaAvance[],
  users: User[],
): RankingEntry[] {
  return [...avances]
    .filter((a) => {
      const user = users.find((u) => u.id === a.meta.vendedorId)
      return user?.role === 'agent' && a.pctPedidosPagados.estado !== 'na'
    })
    .sort((a, b) => (b.pctPedidosPagados.alcanzado ?? 0) - (a.pctPedidosPagados.alcanzado ?? 0))
    .map((a) => {
      const user = users.find((u) => u.id === a.meta.vendedorId)
      const displayName = user?.name ?? user?.email ?? a.meta.vendedorId
      const val = a.pctPedidosPagados.alcanzado ?? 0
      return {
        id: a.meta.vendedorId,
        displayName,
        value: val,
        displayValue: `${val}%`,
      }
    })
}

function rankingPctCobranzaPorVendedor(
  avances: MetaAvance[],
  users: User[],
): RankingEntry[] {
  return [...avances]
    .filter((a) => a.pctCobranza.estado !== 'na')
    .sort((a, b) => (b.pctCobranza.alcanzado ?? 0) - (a.pctCobranza.alcanzado ?? 0))
    .map((a) => {
      const user = users.find((u) => u.id === a.meta.vendedorId)
      const displayName = user?.name ?? user?.email ?? a.meta.vendedorId
      const val = a.pctCobranza.alcanzado ?? 0
      return {
        id: a.meta.vendedorId,
        displayName,
        value: val,
        displayValue: `${val}%`,
      }
    })
}

function rankingCoberturaPorVendedor(
  avances: MetaAvance[],
  users: User[],
): RankingEntry[] {
  return [...avances]
    .filter((a) => a.pctClientesConPedido.estado !== 'na')
    .sort((a, b) => (b.pctClientesConPedido.alcanzado ?? 0) - (a.pctClientesConPedido.alcanzado ?? 0))
    .map((a) => {
      const user = users.find((u) => u.id === a.meta.vendedorId)
      const displayName = user?.name ?? user?.email ?? a.meta.vendedorId
      const val = a.pctClientesConPedido.alcanzado ?? 0
      return {
        id: a.meta.vendedorId,
        displayName,
        value: val,
        displayValue: `${val}%`,
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
  // - clientesNuevos / pedidos: suma simple
  // - conversionLeads: promedio simple del % de los agentes que tienen meta
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

function rankingPctPedidosPagadosPorGerente(
  avances: MetaAvance[],
  equipos: GerenteEquipo[],
  users: User[],
): RankingEntry[] {
  const avanceByVendedor = new Map(avances.map((a) => [a.meta.vendedorId, a]))

  const entries = equipos.map((eq) => {
    const agentAvances = eq.agenteIds
      .map((id) => avanceByVendedor.get(id))
      .filter((a): a is MetaAvance => {
        if (!a) return false
        const user = users.find((u) => u.id === a.meta.vendedorId)
        return user?.role === 'agent' && a.pctPedidosPagados.estado !== 'na'
      })

    const value =
      agentAvances.length > 0
        ? agentAvances.reduce((sum, a) => sum + (a.pctPedidosPagados.alcanzado ?? 0), 0) /
          agentAvances.length
        : 0

    return {
      id: eq.gerenteId,
      displayName: eq.gerenteName ?? eq.gerenteEmail,
      value,
      displayValue: `${Math.round(value * 100) / 100}%`,
    }
  })

  return entries.sort((a, b) => b.value - a.value)
}

function rankingPctCobranzaPorGerente(
  avances: MetaAvance[],
  equipos: GerenteEquipo[],
): RankingEntry[] {
  const avanceByVendedor = new Map(avances.map((a) => [a.meta.vendedorId, a]))

  const entries = equipos.map((eq) => {
    const conCobranza = eq.agenteIds
      .map((id) => avanceByVendedor.get(id))
      .filter((a): a is MetaAvance => a != null && a.pctCobranza.estado !== 'na')

    const value =
      conCobranza.length > 0
        ? conCobranza.reduce((sum, a) => sum + (a.pctCobranza.alcanzado ?? 0), 0) /
          conCobranza.length
        : 0

    return {
      id: eq.gerenteId,
      displayName: eq.gerenteName ?? eq.gerenteEmail,
      value,
      displayValue: `${Math.round(value * 100) / 100}%`,
    }
  })

  return entries.sort((a, b) => b.value - a.value)
}

function rankingCoberturaPorGerente(
  avances: MetaAvance[],
  equipos: GerenteEquipo[],
): RankingEntry[] {
  const avanceByVendedor = new Map(avances.map((a) => [a.meta.vendedorId, a]))

  const entries = equipos.map((eq) => {
    const conCobertura = eq.agenteIds
      .map((id) => avanceByVendedor.get(id))
      .filter((a): a is MetaAvance => a != null && a.pctClientesConPedido.estado !== 'na')

    const value =
      conCobertura.length > 0
        ? conCobertura.reduce((sum, a) => sum + (a.pctClientesConPedido.alcanzado ?? 0), 0) /
          conCobertura.length
        : 0

    return {
      id: eq.gerenteId,
      displayName: eq.gerenteName ?? eq.gerenteEmail,
      value,
      displayValue: `${Math.round(value * 100) / 100}%`,
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

  const hasAgents = avances.some((a) => users.find((u) => u.id === a.meta.vendedorId)?.role === 'agent')
  const hasVendedores = avances.some((a) => users.find((u) => u.id === a.meta.vendedorId)?.role === 'vendedor')

  const vendedorAvances = avances.filter(
    (a) => users.find((u) => u.id === a.meta.vendedorId)?.role === 'vendedor',
  )

  const ranks = modo === 'gerente'
    ? {
      clientesNuevos: rankingPorGerente(avances, equipos, 'clientesNuevos', fmtInt),
      pedidos: hasVendedores ? rankingPorGerente(vendedorAvances, equipos, 'pedidos', fmtInt) : [],
      pctCobranza: rankingPctCobranzaPorGerente(avances, equipos),
      conversionLeads: rankingPorGerente(avances, equipos, 'conversionLeads', fmtPct),
      cobertura: rankingCoberturaPorGerente(avances, equipos),
      pctPedidosPagados: hasAgents ? rankingPctPedidosPagadosPorGerente(avances, equipos, users) : [],
    }
    : {
      clientesNuevos: rankingPorVendedor(avances, users, 'clientesNuevos', fmtInt),
      pedidos: hasVendedores ? rankingPorVendedor(vendedorAvances, users, 'pedidos', fmtInt) : [],
      pctCobranza: rankingPctCobranzaPorVendedor(avances, users),
      conversionLeads: rankingPorVendedor(avances, users, 'conversionLeads', fmtPct),
      cobertura: rankingCoberturaPorVendedor(avances, users),
      pctPedidosPagados: hasAgents ? rankingPctPedidosPagadosPorVendedor(avances, users) : [],
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

      <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
        <RankingCard title="Clientes Nuevos" entries={ranks.clientesNuevos} />
        {hasVendedores && <RankingCard title="Pedidos" entries={ranks.pedidos} />}
        <RankingCard title="% Cobranza" entries={ranks.pctCobranza} />
        <RankingCard title="Conversión" entries={ranks.conversionLeads} />
        <RankingCard title="Cobertura" entries={ranks.cobertura} />
        {hasAgents && <RankingCard title="% Pedidos Pagados" entries={ranks.pctPedidosPagados} />}
      </div>
    </div>
  )
}
