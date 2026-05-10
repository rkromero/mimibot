'use client'

import type { EstadoMeta } from '@/lib/metas/avance.service'

interface MetaCardProps {
  title: string
  objetivo: number
  alcanzado: number
  pct: number
  proyeccion: number
  estado: EstadoMeta
  formatValue?: (v: number) => string
  pctMesTranscurrido: number
}

function getBarColor(
  pct: number,
  estado: EstadoMeta,
  pctMesTranscurrido: number,
): string {
  if (estado === 'cumplida') return 'bg-green-500'
  if (estado === 'no_cumplida') return 'bg-gray-400'
  if (pct >= pctMesTranscurrido) return 'bg-green-500'
  if (pct >= pctMesTranscurrido - 20) return 'bg-amber-500'
  return 'bg-red-500'
}

function getBorderColor(
  pct: number,
  estado: EstadoMeta,
  pctMesTranscurrido: number,
): string {
  if (estado === 'cumplida') return 'border-l-green-500'
  if (estado === 'no_cumplida') return 'border-l-gray-400'
  if (pct >= pctMesTranscurrido) return 'border-l-green-500'
  if (pct >= pctMesTranscurrido - 20) return 'border-l-amber-500'
  return 'border-l-red-500'
}

function EstadoBadge({ estado }: { estado: EstadoMeta }) {
  if (estado === 'cumplida') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        Cumplida ✓
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

export default function MetaCard({
  title,
  objetivo,
  alcanzado,
  pct,
  proyeccion,
  estado,
  formatValue,
  pctMesTranscurrido,
}: MetaCardProps) {
  const fmt = formatValue ?? ((v: number) => String(v))
  const barWidth = Math.min(pct, 100)
  const barColor = getBarColor(pct, estado, pctMesTranscurrido)
  const borderColor = getBorderColor(pct, estado, pctMesTranscurrido)

  return (
    <div
      className={`rounded-xl border border-border bg-card shadow-sm p-4 space-y-2 border-l-4 ${borderColor} w-full`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        <EstadoBadge estado={estado} />
      </div>

      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold text-foreground tabular-nums">
          {fmt(alcanzado)}
        </span>
        <span className="text-sm text-muted-foreground">/ {fmt(objetivo)}</span>
      </div>

      <div className="space-y-1">
        <div className="h-2 w-full rounded-full bg-gray-100">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">{pct}% completado</p>
      </div>

      <p className="text-xs text-muted-foreground">
        Proyección fin de mes:{' '}
        <span className="font-medium text-foreground">{fmt(proyeccion)}</span>
      </p>
    </div>
  )
}
