'use client'

import { useEffect, useState } from 'react'
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

interface VendedorModalProps {
  vendedorId: string
  anio: number
  mes: number
  onClose: () => void
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const formatARS = (v: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(v)

function estadoBadge(estado: EstadoMeta) {
  if (estado === 'cumplida') {
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        Cumplida
      </span>
    )
  }
  if (estado === 'no_cumplida') {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        No cumplida
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
      En curso
    </span>
  )
}

function barColor(pct: number, estado: EstadoMeta): string {
  if (estado === 'cumplida') return 'bg-green-500'
  if (estado === 'no_cumplida') return 'bg-red-400'
  if (pct >= 50) return 'bg-amber-500'
  return 'bg-red-500'
}

interface MetricRowProps {
  label: string
  alcanzado: string
  objetivo: string
  pct: number
  proyeccion: string
  estado: EstadoMeta
}

function MetricRow({
  label,
  alcanzado,
  objetivo,
  pct,
  proyeccion,
  estado,
}: MetricRowProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
        {estadoBadge(estado)}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-bold text-foreground tabular-nums">
          {alcanzado}
        </span>
        <span className="text-sm text-muted-foreground">/ {objetivo}</span>
        <span className="text-sm text-muted-foreground ml-1">({pct}%)</span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-100">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${barColor(pct, estado)}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Proyección fin de mes:{' '}
        <span className="font-medium text-foreground">{proyeccion}</span>
      </p>
    </div>
  )
}

export default function VendedorModal({
  vendedorId,
  anio,
  mes,
  onClose,
}: VendedorModalProps) {
  const [avance, setAvance] = useState<MetaAvance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(
      `/api/metas/avance?anio=${anio}&mes=${mes}&vendedorId=${vendedorId}`,
    )
      .then((r) => {
        if (!r.ok) throw new Error('Error al cargar datos del vendedor')
        return r.json() as Promise<{ data: MetaAvance[] }>
      })
      .then((json) => {
        if (!cancelled) {
          const entry = json.data?.[0] ?? null
          setAvance(entry)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error desconocido')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [vendedorId, anio, mes])

  // Close on backdrop click
  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={handleBackdrop}
    >
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Detalle de Metas
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {MESES[mes - 1]} {anio}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-100"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {loading && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Cargando...
            </p>
          )}

          {!loading && error && (
            <p className="text-sm text-red-600 text-center py-8">{error}</p>
          )}

          {!loading && !error && !avance && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Este vendedor no tiene meta para el período seleccionado.
            </p>
          )}

          {!loading && !error && avance && (
            <div className="space-y-5">
              <MetricRow
                label="Clientes Nuevos"
                alcanzado={String(avance.clientesNuevos.alcanzado)}
                objetivo={String(avance.meta.clientesNuevosObjetivo)}
                pct={avance.clientesNuevos.pct}
                proyeccion={String(avance.clientesNuevos.proyeccion)}
                estado={avance.clientesNuevos.estado}
              />
              <div className="border-t border-border" />
              <MetricRow
                label="Pedidos"
                alcanzado={String(avance.pedidos.alcanzado)}
                objetivo={String(avance.meta.pedidosObjetivo)}
                pct={avance.pedidos.pct}
                proyeccion={String(avance.pedidos.proyeccion)}
                estado={avance.pedidos.estado}
              />
              <div className="border-t border-border" />
              <MetricRow
                label="Monto Cobrado"
                alcanzado={formatARS(avance.montoCobrado.alcanzado)}
                objetivo={formatARS(parseFloat(avance.meta.montoCobradoObjetivo))}
                pct={avance.montoCobrado.pct}
                proyeccion={formatARS(avance.montoCobrado.proyeccion)}
                estado={avance.montoCobrado.estado}
              />
              <div className="border-t border-border" />
              <MetricRow
                label="Conversión de Leads"
                alcanzado={`${avance.conversionLeads.alcanzado}%`}
                objetivo={`${avance.meta.conversionLeadsObjetivo}%`}
                pct={avance.conversionLeads.pct}
                proyeccion={`${avance.conversionLeads.proyeccion}%`}
                estado={avance.conversionLeads.estado}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
