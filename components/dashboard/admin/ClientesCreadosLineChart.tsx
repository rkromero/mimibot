'use client'

import { useState } from 'react'
import type { CreadosPoint, Granularidad } from '@/lib/admin/dashboard.service'

interface Props {
  data: CreadosPoint[]
  granularidad: Granularidad
  rangoLabel: string
}

interface TooltipState {
  x: number
  y: number
  label: string
  total: number
  conPedido: number
}

const LINE_COLOR = '#3b82f6'
const BAR_COLOR = '#10b981'
const CHART_H = 200
const PADDING_LEFT = 28
const PADDING_BOTTOM = 22
const PADDING_TOP = 8
const PADDING_RIGHT = 8
const VIEWBOX_W = 700
const GAP = 1

export default function ClientesCreadosLineChart({ data, granularidad, rangoLabel }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const maxVal = Math.max(1, ...data.map((d) => d.total))
  const n = data.length
  const chartW = VIEWBOX_W - PADDING_LEFT - PADDING_RIGHT
  const chartH = CHART_H - PADDING_BOTTOM - PADDING_TOP
  const groupW = n > 0 ? chartW / n : chartW
  const barW = Math.max(2, (groupW - GAP * 3) / 2)
  const bottomY = PADDING_TOP + chartH

  const xPos = (i: number) => PADDING_LEFT + (i + 0.5) * (chartW / Math.max(1, n))
  const yPos = (val: number) => PADDING_TOP + chartH - (val / maxVal) * chartH

  const yTicks = [0, Math.ceil(maxVal / 2), maxVal].filter((v, i, arr) => arr.indexOf(v) === i)
  const polylinePoints = data.map((d, i) => `${xPos(i)},${yPos(d.total)}`).join(' ')

  const showLabel = (i: number) => (granularidad === 'dia' ? i % 5 === 0 || i === n - 1 : true)

  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-medium">Clientes creados — {rangoLabel}</h3>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-3 h-0.5 rounded-full" style={{ background: LINE_COLOR }} />
            Clientes creados
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: BAR_COLOR }} />
            Con pedido el mismo día
          </span>
        </div>
      </div>

      <div className="relative select-none" onMouseLeave={() => setTooltip(null)}>
        <svg viewBox={`0 0 ${VIEWBOX_W} ${CHART_H}`} className="w-full" style={{ height: CHART_H }}>
          {yTicks.map((tick) => {
            const y = yPos(tick)
            return (
              <g key={tick}>
                <line x1={PADDING_LEFT} y1={y} x2={VIEWBOX_W - PADDING_RIGHT} y2={y} stroke="#e5e7eb" strokeWidth="1" />
                <text x={PADDING_LEFT - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#9ca3af">
                  {tick}
                </text>
              </g>
            )
          })}

          {/* Bars (con pedido el mismo día) */}
          {data.map((d, i) => {
            if (d.conPedido <= 0) return null
            const barH = (d.conPedido / maxVal) * chartH
            return (
              <rect key={`bar-${d.key}`} x={xPos(i) - barW / 2} y={bottomY - barH} width={barW} height={barH} fill={BAR_COLOR} rx="2" />
            )
          })}

          {/* Línea (clientes creados) */}
          <polyline points={polylinePoints} fill="none" stroke={LINE_COLOR} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

          {/* Puntos + targets de hover */}
          {data.map((d, i) => {
            const cx = xPos(i)
            const cy = yPos(d.total)
            return (
              <g key={d.key}>
                <circle cx={cx} cy={cy} r={3} fill={LINE_COLOR} />
                <rect
                  x={cx - groupW / 2}
                  y={PADDING_TOP}
                  width={groupW}
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
                      conPedido: d.conPedido,
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
                  <text x={cx} y={bottomY + 14} textAnchor="middle" fontSize="9" fill="#9ca3af">
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
            <p className="font-medium mb-1">{tooltip.label}</p>
            <p style={{ color: LINE_COLOR }}>
              Creados: <span className="font-semibold">{tooltip.total}</span>
            </p>
            <p style={{ color: BAR_COLOR }}>
              Con pedido ese día: <span className="font-semibold">{tooltip.conPedido}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
