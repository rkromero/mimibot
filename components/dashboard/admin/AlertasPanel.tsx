'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

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
  const agents = users.filter((u) => u.role === 'agent' && u.isActive)
  const avanceMap = new Map(avances.map((a) => [a.meta.vendedorId, a]))

  // Vendors without a meta
  const sinMeta = agents.filter((u) => !avanceMap.has(u.id))
  for (const user of sinMeta) {
    alertas.push({
      id: `sin-meta-${user.id}`,
      tipo: 'warning',
      mensaje: `${user.name ?? user.email} no tiene meta cargada para este período.`,
    })
  }

  // Vendors past day 15 with < 50% progress in any metric
  const now = new Date()
  const isCurrentPeriod =
    now.getFullYear() === anio && now.getMonth() + 1 === mes
  const dayOfMonth = now.getDate()

  if (isCurrentPeriod && dayOfMonth > 15) {
    for (const avance of avances) {
      const metrics = [
        { key: 'clientesNuevos', label: 'Clientes Nuevos', data: avance.clientesNuevos },
        { key: 'pedidos', label: 'Pedidos', data: avance.pedidos },
        { key: 'montoCobrado', label: 'Monto Cobrado', data: avance.montoCobrado },
        { key: 'conversionLeads', label: 'Conversión', data: avance.conversionLeads },
      ] as const

      const bajos = metrics.filter(
        (m) => m.data.pct < 50 && m.data.estado === 'en_curso',
      )

      if (bajos.length > 0) {
        const user = users.find((u) => u.id === avance.meta.vendedorId)
        const nombre = user?.name ?? user?.email ?? avance.meta.vendedorId
        const metricasStr = bajos.map((m) => `${m.label} (${m.data.pct}%)`).join(', ')

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
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
            alerta.tipo === 'danger'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          <span className="mt-0.5 shrink-0">
            {alerta.tipo === 'danger' ? '!' : '⚠'}
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
