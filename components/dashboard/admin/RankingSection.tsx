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
  role: 'admin' | 'agent'
  avatarColor: string
  isActive: boolean
}

interface RankingSectionProps {
  avances: MetaAvance[]
  users: User[]
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
  vendedorId: string
  value: number
  displayValue: string
}

interface RankingCardProps {
  title: string
  entries: RankingEntry[]
  users: User[]
}

function RankingCard({ title, entries, users }: RankingCardProps) {
  const top3 = entries.slice(0, 3)

  return (
    <div className="bg-card border border-border rounded-lg p-4 flex-1 min-w-[200px]">
      <p className="text-sm font-semibold text-foreground mb-3">{title}</p>
      {top3.length === 0 && (
        <p className="text-xs text-muted-foreground">Sin datos</p>
      )}
      <ol className="space-y-2">
        {top3.map((entry, index) => {
          const user = users.find((u) => u.id === entry.vendedorId)
          const nombre = user?.name ?? user?.email ?? entry.vendedorId
          const badge = BADGE_STYLES[index] ?? BADGE_STYLES[0]!

          return (
            <li key={entry.vendedorId} className="flex items-center gap-2">
              <span
                className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 ${badge.bg} ${badge.text}`}
              >
                {badge.label}
              </span>
              <span className="text-sm text-foreground truncate flex-1">
                {nombre}
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

export default function RankingSection({ avances, users }: RankingSectionProps) {
  const sortDesc = (
    key: keyof Pick<
      MetaAvance,
      'clientesNuevos' | 'pedidos' | 'montoCobrado' | 'conversionLeads'
    >,
    fmt: (v: number) => string,
  ): RankingEntry[] =>
    [...avances]
      .sort((a, b) => b[key].alcanzado - a[key].alcanzado)
      .map((a) => ({
        vendedorId: a.meta.vendedorId,
        value: a[key].alcanzado,
        displayValue: fmt(a[key].alcanzado),
      }))

  const rankingClientesNuevos = sortDesc(
    'clientesNuevos',
    (v) => String(v),
  )
  const rankingPedidos = sortDesc('pedidos', (v) => String(v))
  const rankingMonto = sortDesc('montoCobrado', formatARS)
  const rankingConversion = sortDesc(
    'conversionLeads',
    (v) => `${Math.round(v * 100) / 100}%`,
  )

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <RankingCard
        title="Clientes Nuevos"
        entries={rankingClientesNuevos}
        users={users}
      />
      <RankingCard
        title="Pedidos"
        entries={rankingPedidos}
        users={users}
      />
      <RankingCard
        title="Monto Cobrado"
        entries={rankingMonto}
        users={users}
      />
      <RankingCard
        title="Conversión"
        entries={rankingConversion}
        users={users}
      />
    </div>
  )
}
