'use client'

import { useQuery } from '@tanstack/react-query'
import MetaCard from './MetaCard'
import CarteraSection from './CarteraSection'
import HistoricoTable from './HistoricoTable'
import type { MetaAvance } from '@/lib/metas/avance.service'

interface Props {
  user: {
    id: string
    name: string | null
    role: string
  }
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const fmtARS = (v: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(v)

const fmtPct = (v: number) => `${v}%`

function getPctMesTranscurrido(): number {
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return Math.round((now.getDate() / daysInMonth) * 100)
}

export default function VendedorDashboard({ user }: Props) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const pctMesTranscurrido = getPctMesTranscurrido()

  const monthLabel = `${MONTH_NAMES[now.getMonth()]} ${currentYear}`
  const firstName = user.name?.split(' ')[0] ?? 'agente'

  const isAgent = user.role === 'agent'

  const { data: avance, isLoading, isError } = useQuery<MetaAvance | null>({
    queryKey: ['meta-avance', currentYear, currentMonth],
    queryFn: async () => {
      const res = await fetch(`/api/metas/avance?anio=${currentYear}&mes=${currentMonth}`)
      if (!res.ok) return null
      const json = (await res.json()) as { data: MetaAvance | null }
      return json.data ?? null
    },
    staleTime: 60_000,
    enabled: isAgent || user.role === 'vendedor',
  })

  const noMeta = !isLoading && (isError || avance === null)

  // ── Vendedor role: 4 meta cards ─────────────────────────────────────────────
  if (user.role === 'vendedor') {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">
              Hola, {firstName}!
            </h1>
            <p className="text-sm text-muted-foreground">{monthLabel}</p>
          </div>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 h-[88px] sm:h-32 animate-pulse" />
            ))}
          </div>
        )}

        {noMeta && (
          <div className="rounded-xl border border-border bg-blue-50 p-4 text-sm text-blue-800">
            No hay meta cargada para este mes. Consulta con tu administrador.
          </div>
        )}

        {!isLoading && avance && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <MetaCard
              title="Clientes Nuevos"
              objetivo={avance.meta.clientesNuevosObjetivo}
              alcanzado={avance.clientesNuevos.alcanzado}
              pct={avance.clientesNuevos.pct}
              proyeccion={avance.clientesNuevos.proyeccion}
              estado={avance.clientesNuevos.estado}
              pctMesTranscurrido={pctMesTranscurrido}
            />
            <MetaCard
              title="Clientes con Primer Pedido"
              objetivo={avance.meta.clientesNuevosObjetivo}
              alcanzado={avance.clientesPrimerPedido.alcanzado}
              pct={avance.clientesPrimerPedido.pct}
              proyeccion={avance.clientesPrimerPedido.proyeccion}
              estado={avance.clientesPrimerPedido.estado}
              pctMesTranscurrido={pctMesTranscurrido}
            />
            <MetaCard
              title="Cobertura de Cartera"
              objetivo={Number(avance.meta.pctClientesConPedidoObjetivo)}
              alcanzado={avance.pctClientesConPedido.alcanzado ?? 0}
              pct={avance.pctClientesConPedido.pct ?? 0}
              proyeccion={avance.pctClientesConPedido.proyeccion ?? 0}
              estado={avance.pctClientesConPedido.estado}
              formatValue={fmtPct}
              naMessage="Sin cartera asignada"
              pctMesTranscurrido={pctMesTranscurrido}
            />
            <MetaCard
              title="% Cobranza"
              objetivo={Number(avance.meta.pctCobranzaObjetivo)}
              alcanzado={avance.pctCobranza.alcanzado ?? 0}
              pct={avance.pctCobranza.pct ?? 0}
              proyeccion={avance.pctCobranza.proyeccion ?? 0}
              estado={avance.pctCobranza.estado}
              formatValue={fmtPct}
              naMessage="Sin pedidos confirmados"
              pctMesTranscurrido={pctMesTranscurrido}
            />
          </div>
        )}

        {/* Cartera */}
        <CarteraSection vendedorId={user.id} />

        {/* Historico */}
        <HistoricoTable role={user.role} />
      </div>
    )
  }

  // ── Agent role: 4 KPI cards ──────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Hola, {firstName}!
          </h1>
          <p className="text-sm text-muted-foreground">{monthLabel}</p>
        </div>
      </div>

      {/* Loading skeleton — matches mobile horizontal card height */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-card p-4 h-[88px] sm:h-32 animate-pulse"
            />
          ))}
        </div>
      )}

      {/* No meta state */}
      {noMeta && (
        <div className="rounded-xl border border-border bg-blue-50 p-4 text-sm text-blue-800">
          No hay meta cargada para este mes. Consulta con tu administrador.
        </div>
      )}

      {/* 5 agent meta cards */}
      {!isLoading && avance && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          <MetaCard
            title="Clientes Nuevos"
            objetivo={avance.meta.clientesNuevosObjetivo}
            alcanzado={avance.clientesNuevos.alcanzado}
            pct={avance.clientesNuevos.pct}
            proyeccion={avance.clientesNuevos.proyeccion}
            estado={avance.clientesNuevos.estado}
            pctMesTranscurrido={pctMesTranscurrido}
          />
          <MetaCard
            title="Conversión Leads"
            objetivo={Number(avance.meta.conversionLeadsObjetivo)}
            alcanzado={avance.conversionLeads.alcanzado}
            pct={avance.conversionLeads.pct}
            proyeccion={avance.conversionLeads.proyeccion}
            estado={avance.conversionLeads.estado}
            formatValue={fmtPct}
            pctMesTranscurrido={pctMesTranscurrido}
          />
          <MetaCard
            title="Cobertura de Cartera"
            objetivo={Number(avance.meta.pctClientesConPedidoObjetivo)}
            alcanzado={avance.pctClientesConPedido.alcanzado ?? 0}
            pct={avance.pctClientesConPedido.pct ?? 0}
            proyeccion={avance.pctClientesConPedido.proyeccion ?? 0}
            estado={avance.pctClientesConPedido.estado}
            formatValue={fmtPct}
            naMessage="Sin cartera asignada"
            pctMesTranscurrido={pctMesTranscurrido}
          />
          <MetaCard
            title="% Pedidos Pagados"
            objetivo={Number(avance.meta.pctPedidosPagadosObjetivo)}
            alcanzado={avance.pctPedidosPagados.alcanzado ?? 0}
            pct={avance.pctPedidosPagados.pct ?? 0}
            proyeccion={avance.pctPedidosPagados.proyeccion ?? 0}
            estado={avance.pctPedidosPagados.estado}
            formatValue={fmtPct}
            naMessage="Sin pedidos confirmados"
            pctMesTranscurrido={pctMesTranscurrido}
          />
          <MetaCard
            title="% Cobranza"
            objetivo={Number(avance.meta.pctCobranzaObjetivo)}
            alcanzado={avance.pctCobranza.alcanzado ?? 0}
            pct={avance.pctCobranza.pct ?? 0}
            proyeccion={avance.pctCobranza.proyeccion ?? 0}
            estado={avance.pctCobranza.estado}
            formatValue={fmtPct}
            naMessage="Sin pedidos confirmados"
            pctMesTranscurrido={pctMesTranscurrido}
          />
        </div>
      )}

      {/* Cartera */}
      <CarteraSection vendedorId={user.id} />

      {/* Historico */}
      <HistoricoTable role={user.role} />
    </div>
  )
}
