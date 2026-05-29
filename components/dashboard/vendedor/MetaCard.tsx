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
  naMessage?: string
  /** When 'semantic': rojo <50, ámbar 50–99, verde ≥100. Default: time-based. */
  colorMode?: 'semantic' | 'time-based'
  /** Makes the card clickable (cursor pointer + hover ring). */
  onClick?: () => void
}

function getBarColor(
  pct: number,
  estado: EstadoMeta,
  pctMesTranscurrido: number,
  colorMode: 'semantic' | 'time-based',
): string {
  if (estado === 'na') return 'bg-muted'
  if (estado === 'cumplida') return 'bg-green-500'
  if (estado === 'no_cumplida') return 'bg-gray-400'
  if (colorMode === 'semantic') {
    if (pct >= 100) return 'bg-green-500'
    if (pct >= 50) return 'bg-amber-500'
    return 'bg-red-500'
  }
  // time-based (default)
  if (pct >= pctMesTranscurrido) return 'bg-green-500'
  if (pct >= pctMesTranscurrido - 20) return 'bg-amber-500'
  return 'bg-red-500'
}

function getBorderColor(
  pct: number,
  estado: EstadoMeta,
  pctMesTranscurrido: number,
  colorMode: 'semantic' | 'time-based',
): string {
  if (estado === 'na') return 'border-l-gray-300 dark:border-l-gray-600'
  if (estado === 'cumplida') return 'border-l-green-500'
  if (estado === 'no_cumplida') return 'border-l-gray-400'
  if (colorMode === 'semantic') {
    if (pct >= 100) return 'border-l-green-500'
    if (pct >= 50) return 'border-l-amber-500'
    return 'border-l-red-500'
  }
  // time-based (default)
  if (pct >= pctMesTranscurrido) return 'border-l-green-500'
  if (pct >= pctMesTranscurrido - 20) return 'border-l-amber-500'
  return 'border-l-red-500'
}

/** Badge — always one line, never wraps */
function EstadoBadge({ estado }: { estado: EstadoMeta }) {
  if (estado === 'na') return null
  if (estado === 'cumplida') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400 whitespace-nowrap shrink-0">
        Cumplida ✓
      </span>
    )
  }
  if (estado === 'no_cumplida') {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400 whitespace-nowrap shrink-0">
        No cumplida
      </span>
    )
  }
  // en_curso
  return (
    <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400 whitespace-nowrap shrink-0">
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
  naMessage,
  colorMode = 'time-based',
  onClick,
}: MetaCardProps) {
  const fmt = formatValue ?? ((v: number) => String(v))
  const borderColor = getBorderColor(pct, estado, pctMesTranscurrido, colorMode)
  const barWidth = Math.min(pct, 100)
  const barColor = getBarColor(pct, estado, pctMesTranscurrido, colorMode)
  const clickable = !!onClick
  const base = [
    'rounded-xl border border-border bg-card shadow-sm border-l-4',
    borderColor,
    'w-full p-4',
    clickable ? 'cursor-pointer hover:ring-2 hover:ring-primary/30 transition-shadow' : '',
  ].join(' ')

  /* ── N/A card ── */
  if (estado === 'na') {
    return (
      <div className={base}>
        {/* Mobile */}
        <div className="flex items-center gap-3 sm:hidden">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
              {title}
            </p>
            <p className="text-sm text-muted-foreground mt-1">{naMessage ?? 'Sin datos'}</p>
          </div>
        </div>
        {/* Tablet+ */}
        <div className="hidden sm:block space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">{naMessage ?? 'Sin datos'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={base} onClick={onClick} role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined} onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.() } : undefined}>
      {/* ── MOBILE (< sm): horizontal — label+value LEFT | chip+bar RIGHT ── */}
      <div className="flex items-center gap-4 sm:hidden">
        {/* Left: label + big number */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-tight truncate">
            {title}
          </p>
          <p className="text-3xl font-bold text-foreground tabular-nums leading-tight mt-1">
            {fmt(alcanzado)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">de {fmt(objetivo)}</p>
        </div>
        {/* Right: chip + progress bar */}
        <div className="shrink-0 flex flex-col items-end gap-2">
          <EstadoBadge estado={estado} />
          <div className="w-24">
            <div className="h-2 w-full rounded-full bg-muted">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${barColor}`}
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground text-right mt-0.5">{pct}%</p>
          </div>
        </div>
      </div>

      {/* ── TABLET / DESKTOP (≥ sm): vertical ── */}
      <div className="hidden sm:flex sm:flex-col sm:gap-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-tight">
            {title}
          </p>
          <EstadoBadge estado={estado} />
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-foreground tabular-nums">{fmt(alcanzado)}</span>
          <span className="text-sm text-muted-foreground">/ {fmt(objetivo)}</span>
        </div>
        <div className="space-y-1">
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{pct}% completado</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Proyección:{' '}
          <span className="font-medium text-foreground">{fmt(proyeccion)}</span>
        </p>
      </div>
    </div>
  )
}
