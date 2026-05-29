'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import MetaCard from './MetaCard'
import ImpagoModal from './ImpagoModal'
import type { ProgresoVendedor } from '@/lib/metas/progreso-vendedor.service'

interface Props {
  userId: string
  monthLabel: string
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

// Skeleton for 3 cards
function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-xl border border-border bg-card p-4 h-[88px] sm:h-32 animate-pulse"
        />
      ))}
    </div>
  )
}

// "Sin meta" placeholder for a single card
function SinMetaCard({ title }: { title: string }) {
  return (
    <div className="rounded-xl border border-border border-l-4 border-l-gray-300 dark:border-l-gray-600 bg-card shadow-sm w-full p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <p className="text-sm text-muted-foreground mt-2">Sin meta para este mes</p>
    </div>
  )
}

export default function VendedorKpiCards({ userId, monthLabel }: Props) {
  const [impagoOpen, setImpagoOpen] = useState(false)
  const pctMesTranscurrido = getPctMesTranscurrido()

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const mesLabel = `${MONTH_NAMES[now.getMonth()]} ${currentYear}`

  const { data, isLoading, isError } = useQuery<ProgresoVendedor>({
    queryKey: ['vendedor-progreso', userId, currentYear, currentMonth],
    queryFn: async () => {
      const res = await fetch(`/api/metas/${userId}/progreso`)
      if (!res.ok) throw new Error('Error al cargar el progreso')
      const json = (await res.json()) as { data: ProgresoVendedor }
      return json.data
    },
    staleTime: 60_000,
  })

  if (isLoading) return <KpiSkeleton />

  if (isError) {
    return (
      <div className="rounded-xl border border-border bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
        No se pudieron cargar las métricas. Intentá refrescar la página.
      </div>
    )
  }

  const noMeta = !data?.meta

  // No meta state — show 3 "sin meta" cards
  if (noMeta) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SinMetaCard title="Clientes Nuevos" />
          <SinMetaCard title="Cobertura Cartera" />
          <SinMetaCard title="Cobranza" />
        </div>
        <ImpagoModal
          open={impagoOpen}
          onClose={() => setImpagoOpen(false)}
          mes={mesLabel}
          impagos={data?.pedidosImpagos ?? []}
        />
      </div>
    )
  }

  const { clientesNuevos, coberturaCartera, cobranza, pedidosImpagos } = data!

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Card 1: Clientes Nuevos con Primer Pedido */}
        {clientesNuevos ? (
          <MetaCard
            title="Clientes Nuevos"
            objetivo={clientesNuevos.objetivo}
            alcanzado={clientesNuevos.alcanzado}
            pct={clientesNuevos.pct}
            proyeccion={clientesNuevos.proyeccion}
            estado={clientesNuevos.estado}
            pctMesTranscurrido={pctMesTranscurrido}
            colorMode="semantic"
          />
        ) : (
          <SinMetaCard title="Clientes Nuevos" />
        )}

        {/* Card 2: % Cobertura de Cartera */}
        {coberturaCartera ? (
          <MetaCard
            title="Cobertura Cartera"
            objetivo={coberturaCartera.objetivo}
            alcanzado={coberturaCartera.alcanzado ?? 0}
            pct={coberturaCartera.pct ?? 0}
            proyeccion={coberturaCartera.proyeccion ?? 0}
            estado={coberturaCartera.estado}
            formatValue={fmtPct}
            naMessage="Sin cartera asignada"
            pctMesTranscurrido={pctMesTranscurrido}
            colorMode="semantic"
          />
        ) : (
          <SinMetaCard title="Cobertura Cartera" />
        )}

        {/* Card 3: % Cobranza — CLICKEABLE → impagos modal */}
        {cobranza ? (
          <MetaCard
            title="Cobranza"
            objetivo={cobranza.objetivo}
            alcanzado={cobranza.alcanzado}
            pct={cobranza.pct}
            proyeccion={cobranza.proyeccion}
            estado={cobranza.estado}
            formatValue={fmtARS}
            pctMesTranscurrido={pctMesTranscurrido}
            colorMode="semantic"
            onClick={() => setImpagoOpen(true)}
          />
        ) : (
          <div
            className="rounded-xl border border-border border-l-4 border-l-gray-300 dark:border-l-gray-600 bg-card shadow-sm w-full p-4 cursor-pointer hover:ring-2 hover:ring-primary/30 transition-shadow"
            onClick={() => setImpagoOpen(true)}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Cobranza
            </p>
            <p className="text-sm text-muted-foreground mt-2">Sin meta para este mes</p>
          </div>
        )}
      </div>

      <ImpagoModal
        open={impagoOpen}
        onClose={() => setImpagoOpen(false)}
        mes={mesLabel}
        impagos={pedidosImpagos}
      />
    </>
  )
}
