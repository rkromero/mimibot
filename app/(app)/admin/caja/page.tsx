'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { todayStrAR, formatFechaAR } from '@/lib/dates'

type CajaData = {
  mes: string
  ingresos: { total: string; porMetodo: Record<string, string> }
  egresos: { total: string; porMetodo: Record<string, string> }
  neto: string
  porSemana: Array<{ semana: string; ingresos: string; egresos: string; neto: string }>
  anterior: { ingresos: string; egresos: string; neto: string | null } | null
}

const METODO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  mercadopago: 'MercadoPago',
  sin_especificar: 'Sin especificar',
}

function formatMoney(value: string | number) {
  return `$${parseFloat(String(value)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

function MetodoBreakdown({ porMetodo }: { porMetodo: Record<string, string> }) {
  const entries = Object.entries(porMetodo).sort(([, a], [, b]) => parseFloat(b) - parseFloat(a))
  if (entries.length === 0) return <p className="text-xs text-muted-foreground mt-1">Sin movimientos</p>
  return (
    <div className="mt-2 space-y-0.5">
      {entries.map(([metodo, total]) => (
        <div key={metodo} className="flex justify-between text-xs text-muted-foreground">
          <span>{METODO_LABELS[metodo] ?? metodo}</span>
          <span className="tabular-nums">{formatMoney(total)}</span>
        </div>
      ))}
    </div>
  )
}

export default function CajaPage() {
  const [mes, setMes] = useState(todayStrAR().slice(0, 7))

  const { data, isLoading } = useQuery<CajaData | null>({
    queryKey: ['finanzas-caja', mes],
    queryFn: async () => {
      const res = await fetch(`/api/admin/finanzas/caja?mes=${mes}`)
      if (!res.ok) return null
      const json = await res.json() as { data: CajaData }
      return json.data
    },
  })

  const netoPositivo = data ? parseFloat(data.neto) >= 0 : true

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4 md:mb-6 flex-wrap gap-3">
          <h1 className="text-xl font-semibold text-foreground">Flujo de caja</h1>
          <input
            type="month"
            value={mes}
            onChange={(e) => e.target.value && setMes(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label="Mes"
          />
        </div>

        {/* Tarjetas: entradas / salidas / neto */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Ingresos (cobranzas)</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{formatMoney(data?.ingresos.total ?? '0')}</p>
            {data && <MetodoBreakdown porMetodo={data.ingresos.porMetodo} />}
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Egresos (gastos)</p>
            <p className="text-2xl font-bold text-destructive mt-1">{formatMoney(data?.egresos.total ?? '0')}</p>
            {data && <MetodoBreakdown porMetodo={data.egresos.porMetodo} />}
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Neto del mes</p>
            <p className={cn('text-2xl font-bold mt-1', netoPositivo ? 'text-green-600' : 'text-destructive')}>
              {formatMoney(data?.neto ?? '0')}
            </p>
            {data?.anterior?.neto != null && (
              <p className="text-xs text-muted-foreground mt-1">
                Mes anterior: {formatMoney(data.anterior.neto)}
              </p>
            )}
          </div>
        </div>

        {/* Detalle semanal */}
        <div className="bg-card border border-border rounded-lg p-4 md:p-5 mb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Semana a semana
          </p>
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Cargando...</div>
          ) : !data || data.porSemana.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Sin movimientos este mes
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left py-1.5 font-medium">Semana del</th>
                  <th className="text-right py-1.5 font-medium">Ingresos</th>
                  <th className="text-right py-1.5 font-medium">Egresos</th>
                  <th className="text-right py-1.5 font-medium">Neto</th>
                </tr>
              </thead>
              <tbody>
                {data.porSemana.map((s) => (
                  <tr key={s.semana} className="border-b border-border last:border-0">
                    <td className="py-2 text-muted-foreground">{formatFechaAR(s.semana, true)}</td>
                    <td className="py-2 text-right tabular-nums text-green-600">{formatMoney(s.ingresos)}</td>
                    <td className="py-2 text-right tabular-nums text-destructive">{formatMoney(s.egresos)}</td>
                    <td className={cn(
                      'py-2 text-right tabular-nums font-medium',
                      parseFloat(s.neto) >= 0 ? 'text-foreground' : 'text-destructive',
                    )}>
                      {formatMoney(s.neto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong>Criterio caja:</strong> acá cuenta la plata que realmente entró y salió en el mes —
          los ingresos son las cobranzas registradas (no las ventas) y los egresos los gastos
          registrados. Para ver si el negocio gana plata más allá de la caja, mirá{' '}
          <Link href="/admin/resultado" className="text-primary underline">Resultado</Link>.
        </p>
      </div>
    </div>
  )
}
