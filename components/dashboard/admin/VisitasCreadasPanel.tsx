'use client'

import { useEffect, useState } from 'react'
import type { Granularidad, VisitasStats } from '@/lib/admin/visitas-stats.service'

const RANGO_LABEL: Record<Granularidad, string> = {
  dia: 'últimos 30 días',
  semana: 'últimas 12 semanas',
  mes: 'últimos 12 meses',
}

const BAR_COLOR = '#6366f1'
const CHART_H = 200
const PADDING_LEFT = 28
const PADDING_BOTTOM = 22
const PADDING_TOP = 8
const PADDING_RIGHT = 8
const VIEWBOX_W = 700
const GAP = 2

interface Props {
  granularidad: Granularidad
}

interface TooltipState {
  x: number
  y: number
  label: string
  total: number
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-AR').format(value)
}

export default function VisitasCreadasPanel({ granularidad }: Props) {
  const [stats, setStats] = useState<VisitasStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/admin/visitas-stats?granularidad=${granularidad}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Error al cargar visitas')
        return (await r.json()) as { data: VisitasStats }
      })
      .then((json) => { if (!cancelled) setStats(json.data) })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Error al cargar visitas') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [granularidad])

  const data = stats?.data ?? []
  const n = data.length
  const maxVal = Math.max(1, ...data.map((d) => d.total))
  const chartW = VIEWBOX_W - PADDING_LEFT - PADDING_RIGHT
  const chartH = CHART_H - PADDING_BOTTOM - PADDING_TOP
  const slotW = n > 0 ? chartW / n : chartW
  const barW = Math.max(2, slotW - GAP * 2)
  const bottomY = PADDING_TOP + chartH

  const xPos = (i: number) => PADDING_LEFT + (i + 0.5) * slotW
  const yTicks = [0, Math.ceil(maxVal / 2), maxVal].filter((v, i, arr) => arr.indexOf(v) === i)

  const showLabel = (i: number) => (granularidad === 'dia' ? i % 5 === 0 || i === n - 1 : true)

  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-medium">Visitas creadas</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{RANGO_LABEL[granularidad]}</p>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : loading ? (
        <div className="h-[232px] rounded-lg border border-border bg-muted/30 animate-pulse" />
      ) : (
        <>
          <div className="mb-3">
            <p className="text-3xl font-bold tracking-tight leading-none">
              {formatNumber(stats?.total ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.total === 1 ? 'visita en el período' : 'visitas en el período'}
            </p>
          </div>

          <div className="relative select-none" onMouseLeave={() => setTooltip(null)}>
            <svg viewBox={`0 0 ${VIEWBOX_W} ${CHART_H}`} className="w-full" style={{ height: CHART_H }}>
              {yTicks.map((tick) => {
                const y = bottomY - (tick / maxVal) * chartH
                return (
                  <g key={tick}>
                    <line x1={PADDING_LEFT} y1={y} x2={VIEWBOX_W - PADDING_RIGHT} y2={y} stroke="#e5e7eb" strokeWidth="1" />
                    <text x={PADDING_LEFT - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#9ca3af">
                      {tick}
                    </text>
                  </g>
                )
              })}

              {data.map((d, i) => {
                const barH = (d.total / maxVal) * chartH
                const x = xPos(i) - barW / 2
                return (
                  <g key={d.key}>
                    {d.total > 0 && (
                      <rect x={x} y={bottomY - barH} width={barW} height={barH} fill={BAR_COLOR} rx="2" />
                    )}
                    <rect
                      x={xPos(i) - slotW / 2}
                      y={PADDING_TOP}
                      width={slotW}
                      height={chartH}
                      fill="transparent"
                      onMouseEnter={(e) => {
                        const svg = e.currentTarget.closest('svg')!
                        const rect = svg.getBoundingClientRect()
                        setTooltip({
                          x: (e.clientX - rect.left) * (VIEWBOX_W / rect.width),
                          y: (e.clientY - rect.top) * (CHART_H / rect.height),
                          label: d.label,
                          total: d.total,
                        })
                      }}
                      onMouseMove={(e) => {
                        const svg = e.currentTarget.closest('svg')!
                        const rect = svg.getBoundingClientRect()
                        setTooltip((prev) =>
                          prev
                            ? { ...prev, x: (e.clientX - rect.left) * (VIEWBOX_W / rect.width), y: (e.clientY - rect.top) * (CHART_H / rect.height) }
                            : null,
                        )
                      }}
                    />
                    {showLabel(i) && (
                      <text x={xPos(i)} y={bottomY + 14} textAnchor="middle" fontSize="9" fill="#9ca3af">
                        {d.label}
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>

            {tooltip && (
              <div
                className="pointer-events-none absolute z-10 rounded-lg border border-border bg-background shadow-lg px-3 py-2 text-sm whitespace-nowrap"
                style={{
                  left: `${(tooltip.x / VIEWBOX_W) * 100}%`,
                  top: `${(tooltip.y / CHART_H) * 100}%`,
                  transform: tooltip.x > VIEWBOX_W * 0.65 ? 'translate(-110%, -50%)' : 'translate(8px, -50%)',
                }}
              >
                <p className="font-medium mb-0.5">{tooltip.label}</p>
                <p style={{ color: BAR_COLOR }}>
                  Visitas: <span className="font-semibold">{tooltip.total}</span>
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
