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
  clientesCreados: number
  clientesCreadosConPedido: number
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

interface EquipoResumenProps {
  avances: MetaAvance[]
  users: User[]
}

interface KpiCardProps {
  label: string
  value: string
}

function KpiCard({ label, value }: KpiCardProps) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-1">
      <span className="text-2xl font-bold text-foreground tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

export default function EquipoResumen({ avances, users }: EquipoResumenProps) {
  const getRole = (vendedorId: string) =>
    users.find((u) => u.id === vendedorId)?.role

  const agentAvances = avances.filter((a) => getRole(a.meta.vendedorId) === 'agent')
  const vendedorAvances = avances.filter((a) => getRole(a.meta.vendedorId) === 'vendedor')
  const hasAgents = agentAvances.length > 0
  const hasVendedores = vendedorAvances.length > 0

  const totalClientesNuevos = avances.reduce((acc, a) => acc + a.clientesNuevos.alcanzado, 0)

  const totalClientesCreados = avances.reduce((acc, a) => acc + a.clientesCreados, 0)
  const totalCreadosConPedido = avances.reduce((acc, a) => acc + a.clientesCreadosConPedido, 0)
  const pctCreadosConPedido = totalClientesCreados > 0
    ? (totalCreadosConPedido / totalClientesCreados) * 100
    : null

  const avgConversion =
    avances.length > 0
      ? avances.reduce((acc, a) => acc + a.conversionLeads.alcanzado, 0) / avances.length
      : 0

  const coberturaConDatos = avances.filter((a) => a.pctClientesConPedido.estado !== 'na')
  const avgCobertura =
    coberturaConDatos.length > 0
      ? coberturaConDatos.reduce((acc, a) => acc + (a.pctClientesConPedido.alcanzado ?? 0), 0) /
        coberturaConDatos.length
      : null

  const totalPedidos = hasVendedores
    ? vendedorAvances.reduce((acc, a) => acc + a.pedidos.alcanzado, 0)
    : 0

  const cobranzaConDatos = avances.filter((a) => a.pctCobranza.estado !== 'na')
  const avgPctCobranza =
    cobranzaConDatos.length > 0
      ? cobranzaConDatos.reduce((acc, a) => acc + (a.pctCobranza.alcanzado ?? 0), 0) /
        cobranzaConDatos.length
      : null

  const agentesConPct = agentAvances.filter((a) => a.pctPedidosPagados.estado !== 'na')
  const avgPctPedidosPagados =
    agentesConPct.length > 0
      ? agentesConPct.reduce((acc, a) => acc + (a.pctPedidosPagados.alcanzado ?? 0), 0) /
        agentesConPct.length
      : null

  return (
    <div className="flex flex-wrap gap-4">
      <div className="flex-1 min-w-[140px]">
        <KpiCard label="Total Clientes Nuevos" value={String(totalClientesNuevos)} />
      </div>
      <div className="flex-1 min-w-[140px]">
        <KpiCard label="Clientes Creados" value={String(totalClientesCreados)} />
      </div>
      <div className="flex-1 min-w-[140px]">
        <KpiCard
          label="% Creados con Pedido"
          value={pctCreadosConPedido !== null ? `${Number(pctCreadosConPedido.toFixed(1))}%` : '—'}
        />
      </div>
      {hasVendedores && (
        <div className="flex-1 min-w-[140px]">
          <KpiCard label="Total Pedidos" value={String(totalPedidos)} />
        </div>
      )}
      <div className="flex-1 min-w-[140px]">
        <KpiCard
          label="% Cobranza promedio"
          value={avgPctCobranza !== null ? `${Number(avgPctCobranza.toFixed(1))}%` : '—'}
        />
      </div>
      <div className="flex-1 min-w-[140px]">
        <KpiCard label="Conversión Promedio" value={`${Number(avgConversion.toFixed(1))}%`} />
      </div>
      <div className="flex-1 min-w-[140px]">
        <KpiCard
          label="Cobertura promedio"
          value={avgCobertura !== null ? `${Number(avgCobertura.toFixed(1))}%` : '—'}
        />
      </div>
      {hasAgents && (
        <div className="flex-1 min-w-[140px]">
          <KpiCard
            label="% Pedidos Pagados"
            value={avgPctPedidosPagados !== null ? `${Number(avgPctPedidosPagados.toFixed(1))}%` : '—'}
          />
        </div>
      )}
    </div>
  )
}
