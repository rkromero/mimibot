'use client'

import { useState } from 'react'
import type { DayDataPoint } from '@/lib/admin/dashboard.service'

interface Props {
  data: DayDataPoint[]
  mes: string
}

interface TooltipState {
  x: number
  y: number
  day: number
  primer: number
  nuevo: number
}

const BLUE = '#3b82f6'
const GREEN = '#10b981'
const CHART_H = 200
const PADDING_LEFT = 28
const PADDING_BOTTOM = 20
const PADDING_TOP = 8
const PADDING_RIGHT = 8
const VIEWBOX_W = 700

export default function ClientesBarChart({ data, mes }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const maxVal = Math.max(1, ...data.map((d) => Math.max(d.primerPedido, d.clienteNuevo)))
  const n = data.length
  const chartW = VIEWBOX_W - PADDING_LEFT - PADDING_RIGHT
  const chartH = CHART_H - PADDING_BOTTOM - PADDING_TOP
  const groupW = chartW / n
  const GAP = 1
  const barW = Math.max(2, (groupW - GAP * 3) / 2)

  const toBarH = (val: number) => (val / maxVal) * chartH
  const yTicks = [0, Math.ceil(maxVal / 2), maxVal].filter(
    (v, i, arr) => arr.indexOf(v) === i,
  )

  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-medium">Clientes por día — {mes}</h3>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: BLUE }} />
            Primer pedido
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: GREEN }} />
            Cliente nuevo
          </span>
        </div>
      </div>

      <div
        className="relative select-none"
        onMouseLeave={() => setTooltip(null)}
      >
        <svg
          viewBox={`0 0 ${VIEWBOX_W} ${CHART_H}`}
          className="w-full"
          style={{ height: CHART_H }}
        >
          {/* Grid lines + Y labels */}
          {yTicks.map((tick) => {
            const y = PADDING_TOP + chartH - toBarH(tick)
            return (
              <g key={tick}>
                <line
                  x1={PADDING_LEFT}
                  y1={y}
                  x2={VIEWBOX_W - PADDING_RIGHT}
                  y2={y}
                  stroke="#e5e7eb"
                  strokeWidth="1"
                />
                <text
                  x={PADDING_LEFT - 4}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="9"
                  fill="#9ca3af"
                >
                  {tick}
                </text>
              </g>
            )
          })}

          {/* Bars */}
          {data.map((d, i) => {
            const groupX = PADDING_LEFT + i * groupW
            const blueX = groupX + GAP
            const greenX = blueX + barW + GAP
            const blueH = toBarH(d.primerPedido)
            const greenH = toBarH(d.clienteNuevo)
            const bottomY = PADDING_TOP + chartH

            return (
              <g
                key={d.day}
                onMouseEnter={(e) => {
                  const svg = e.currentTarget.closest('svg')!
                  const rect = svg.getBoundingClientRect()
                  const scaleX = VIEWBOX_W / rect.width
                  const scaleY = CHART_H / rect.height
                  setTooltip({
                    x: (e.clientX - rect.left) * scaleX,
                    y: (e.clientY - rect.top) * scaleY,
                    day: d.day,
                    primer: d.primerPedido,
                    nuevo: d.clienteNuevo,
                  })
                }}
                onMouseMove={(e) => {
                  const svg = e.currentTarget.closest('svg')!
                  const rect = svg.getBoundingClientRect()
                  const scaleX = VIEWBOX_W / rect.width
                  const scaleY = CHART_H / rect.height
                  setTooltip((prev) =>
                    prev
                      ? {
                          ...prev,
                          x: (e.clientX - rect.left) * scaleX,
                          y: (e.clientY - rect.top) * scaleY,
                        }
                      : null,
                  )
                }}
              >
                {/* hover target */}
                <rect
                  x={groupX}
                  y={PADDING_TOP}
                  width={groupW}
                  height={chartH}
                  fill="transparent"
                />
                {/* blue bar */}
                {blueH > 0 && (
                  <rect
                    x={blueX}
                    y={bottomY - blueH}
                    width={barW}
                    height={blueH}
                    fill={BLUE}
                    rx="2"
                  />
                )}
                {/* green bar */}
                {greenH > 0 && (
                  <rect
                    x={greenX}
                    y={bottomY - greenH}
                    width={barW}
                    height={greenH}
                    fill={GREEN}
                    rx="2"
                  />
                )}
                {/* X label every 5 days */}
                {(d.day === 1 || d.day % 5 === 0) && (
                  <text
                    x={groupX + groupW / 2}
                    y={bottomY + 14}
                    textAnchor="middle"
                    fontSize="9"
                    fill="#9ca3af"
                  >
                    {d.day}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {/* Tooltip (absolute, positioned in SVG coordinate space via foreignObject-free approach) */}
        {tooltip && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-border bg-background shadow-lg px-3 py-2 text-sm whitespace-nowrap"
            style={{
              left: `${(tooltip.x / VIEWBOX_W) * 100}%`,
              top: `${(tooltip.y / CHART_H) * 100}%`,
              transform:
                tooltip.x > VIEWBOX_W * 0.65
                  ? 'translate(-110%, -50%)'
                  : 'translate(8px, -50%)',
            }}
          >
            <p className="font-medium mb-1">Día {tooltip.day}</p>
            <p style={{ color: BLUE }}>
              Primer pedido:{' '}
              <span className="font-semibold">{tooltip.primer}</span>
            </p>
            <p style={{ color: GREEN }}>
              Cliente nuevo:{' '}
              <span className="font-semibold">{tooltip.nuevo}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
