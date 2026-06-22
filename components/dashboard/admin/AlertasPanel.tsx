'use client'

import { useState } from 'react'
import { X, AlertTriangle, AlertCircle } from 'lucide-react'

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
    conversionLeadsObjetivo: string
    pctClientesConPedidoObjetivo: string
    pctPedidosPagadosObjetivo: string
    pctCobranzaObjetivo: string
  }
  clientesNuevos: MetricaAvance
  clientesPrimerPedido: MetricaAvance
  conversionLeads: MetricaAvance
  pctClientesConPedido: MetricaCobertura
  pctPedidosPagados: MetricaCobertura
  pctCobranza: MetricaCobertura
}

interface User {
  id: string
  name: string | null
  email: string
  role: 'admin' | 'gerente' | 'agent' | 'vendedor' | 'rtv'
  avatarColor: string
  isActive: boolean
}

interface AlertasPanelProps {
  avances: MetaAvance[]
  users: User[]
  anio: number
  mes: number
}

interface Alerta {
  id: string
  tipo: 'warning' | 'danger'
  mensaje: string
}

function buildAlertas(
  avances: MetaAvance[],
  users: User[],
  anio: number,
  mes: number,
): Alerta[] {
  const alertas: Alerta[] = []

  // Vendors past day 15 with < 50% progress in any metric
  const now = new Date()
  const isCurrentPeriod =
    now.getFullYear() === anio && now.getMonth() + 1 === mes
  const dayOfMonth = now.getDate()

  if (isCurrentPeriod && dayOfMonth > 15) {
    for (const avance of avances) {
      const metrics: Array<{ label: string; pct: number | null; estado: string }> = [
        { label: 'Clientes Nuevos', pct: avance.clientesNuevos.pct, estado: avance.clientesNuevos.estado },
        { label: 'Conversión', pct: avance.conversionLeads.pct, estado: avance.conversionLeads.estado },
        { label: '% Pedidos Pagados', pct: avance.pctPedidosPagados.pct, estado: avance.pctPedidosPagados.estado },
        { label: '% Cobranza', pct: avance.pctCobranza.pct, estado: avance.pctCobranza.estado },
        { label: '% Cobertura', pct: avance.pctClientesConPedido.pct, estado: avance.pctClientesConPedido.estado },
      ]

      const bajos = metrics.filter(
        (m) => m.pct != null && m.pct < 50 && m.estado === 'en_curso',
      )

      if (bajos.length > 0) {
        const user = users.find((u) => u.id === avance.meta.vendedorId)
        const nombre = user?.name ?? user?.email ?? avance.meta.vendedorId
        const metricasStr = bajos.map((m) => `${m.label} (${m.pct}%)`).join(', ')

        alertas.push({
          id: `bajo-progreso-${avance.meta.vendedorId}`,
          tipo: 'danger',
          mensaje: `${nombre} tiene progreso por debajo del 50% en: ${metricasStr}.`,
        })
      }
    }
  }

  return alertas
}

export default function AlertasPanel({
  avances,
  users,
  anio,
  mes,
}: AlertasPanelProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const alertas = buildAlertas(avances, users, anio, mes).filter(
    (a) => !dismissed.has(a.id),
  )

  if (alertas.length === 0) return null

  function dismiss(id: string) {
    setDismissed((prev) => new Set([...prev, id]))
  }

  return (
    <div className="space-y-2">
      {alertas.map((alerta) => (
        <div
          key={alerta.id}
          className={`flex items-start gap-3 rounded-lg border-y border-r border-l-4 px-4 py-3 text-sm ${
            alerta.tipo === 'danger'
              ? 'bg-red-50 border-red-200 border-l-red-500 text-red-800 dark:bg-red-950/30 dark:border-red-900 dark:border-l-red-500 dark:text-red-300'
              : 'bg-amber-50 border-amber-200 border-l-amber-500 text-amber-800 dark:bg-amber-950/30 dark:border-amber-900 dark:border-l-amber-500 dark:text-amber-300'
          }`}
        >
          <span className="mt-0.5 shrink-0">
            {alerta.tipo === 'danger'
              ? <AlertCircle size={15} />
              : <AlertTriangle size={15} />}
          </span>
          <span className="flex-1">{alerta.mensaje}</span>
          <button
            onClick={() => dismiss(alerta.id)}
            className={`shrink-0 p-0.5 rounded transition-colors duration-100 ${
              alerta.tipo === 'danger'
                ? 'hover:bg-red-100 text-red-600'
                : 'hover:bg-amber-100 text-amber-600'
            }`}
            aria-label="Descartar alerta"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
