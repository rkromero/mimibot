'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { todayStrAR } from '@/lib/dates'

type ResultadoMes = {
  ventas: string
  cantidadPedidos: number
  costoDirecto: string
  gastoOperativo: string
  margenBruto: string
  resultadoNeto: string
}

type ResultadoData = {
  mes: string
  actual: ResultadoMes
  anterior: ResultadoMes | null
}

function formatMoney(value: string | number) {
  return `$${parseFloat(String(value)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

function pct(parte: string, total: string): string {
  const t = parseFloat(total)
  if (t <= 0) return '—'
  return `${((parseFloat(parte) / t) * 100).toFixed(1)}%`
}

// Variación vs mes anterior: "+12,3%" / "−8,1%" (— si no hay base)
function delta(actual: string, anterior: string | undefined): string | null {
  if (anterior === undefined) return null
  const prev = parseFloat(anterior)
  if (prev === 0) return null
  const diff = ((parseFloat(actual) - prev) / Math.abs(prev)) * 100
  return `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}% vs mes anterior`
}

export default function ResultadoPage() {
  const [mes, setMes] = useState(todayStrAR().slice(0, 7))

  const { data, isLoading } = useQuery<ResultadoData | null>({
    queryKey: ['finanzas-resultado', mes],
    queryFn: async () => {
      const res = await fetch(`/api/admin/finanzas/resultado?mes=${mes}`)
      if (!res.ok) return null
      const json = await res.json() as { data: ResultadoData }
      return json.data
    },
  })

  const r = data?.actual
  const prev = data?.anterior ?? undefined
  const netoPositivo = r ? parseFloat(r.resultadoNeto) >= 0 : true

  const filas = r ? [
    { label: `Ventas (${r.cantidadPedidos} pedidos)`, valor: r.ventas, signo: '', destacada: false, delta: delta(r.ventas, prev?.ventas) },
    { label: 'Costos directos (materia prima)', valor: r.costoDirecto, signo: '−', destacada: false, delta: delta(r.costoDirecto, prev?.costoDirecto) },
    { label: `Margen bruto (${pct(r.margenBruto, r.ventas)} de las ventas)`, valor: r.margenBruto, signo: '=', destacada: true, delta: delta(r.margenBruto, prev?.margenBruto) },
    { label: 'Gastos operativos', valor: r.gastoOperativo, signo: '−', destacada: false, delta: delta(r.gastoOperativo, prev?.gastoOperativo) },
    { label: `Resultado neto (${pct(r.resultadoNeto, r.ventas)} de las ventas)`, valor: r.resultadoNeto, signo: '=', destacada: true, delta: delta(r.resultadoNeto, prev?.resultadoNeto) },
  ] : []

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4 md:mb-6 flex-wrap gap-3">
          <h1 className="text-xl font-semibold text-foreground">Resultado del mes</h1>
          <input
            type="month"
            value={mes}
            onChange={(e) => e.target.value && setMes(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label="Mes"
          />
        </div>

        {/* Tarjetas principales */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Ventas</p>
            <p className="text-2xl font-bold text-foreground mt-1">{formatMoney(r?.ventas ?? '0')}</p>
            {r && delta(r.ventas, prev?.ventas) && (
              <p className="text-xs text-muted-foreground mt-1">{delta(r.ventas, prev?.ventas)}</p>
            )}
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Margen bruto</p>
            <p className="text-2xl font-bold text-foreground mt-1">{formatMoney(r?.margenBruto ?? '0')}</p>
            {r && <p className="text-xs text-muted-foreground mt-1">{pct(r.margenBruto, r.ventas)} de las ventas</p>}
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Resultado neto</p>
            <p className={cn('text-2xl font-bold mt-1', netoPositivo ? 'text-green-600' : 'text-destructive')}>
              {formatMoney(r?.resultadoNeto ?? '0')}
            </p>
            {r && delta(r.resultadoNeto, prev?.resultadoNeto) && (
              <p className="text-xs text-muted-foreground mt-1">{delta(r.resultadoNeto, prev?.resultadoNeto)}</p>
            )}
          </div>
        </div>

        {/* Cuenta de resultados */}
        <div className="bg-card border border-border rounded-lg p-4 md:p-5 mb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Cuenta de resultados
          </p>
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Cargando...</div>
          ) : (
            <div>
              {filas.map((f) => (
                <div
                  key={f.label}
                  className={cn(
                    'flex items-center justify-between gap-3 py-2.5',
                    f.destacada
                      ? 'border-t border-border font-semibold'
                      : 'text-muted-foreground',
                  )}
                >
                  <span className={cn('text-sm', f.destacada && 'text-foreground')}>
                    {f.signo && <span className="inline-block w-4 text-muted-foreground">{f.signo}</span>}
                    {f.label}
                  </span>
                  <div className="text-right shrink-0">
                    <span className={cn(
                      'text-sm tabular-nums',
                      f.destacada && (parseFloat(f.valor) >= 0 ? 'text-foreground' : 'text-destructive'),
                      f.destacada && f.label.startsWith('Resultado') && parseFloat(f.valor) >= 0 && 'text-green-600',
                    )}>
                      {formatMoney(f.valor)}
                    </span>
                    {f.delta && <span className="block text-[11px] text-muted-foreground/70">{f.delta}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong>Criterio devengado:</strong> las ventas cuentan cuando el pedido se confirma
          (excluye pendientes y cancelados), no cuando se cobra. Los costos directos son los
          gastos de categorías tipo &quot;costo directo&quot; (materia prima, packaging) y los gastos
          operativos el resto. Para ver la plata que realmente entró y salió, mirá{' '}
          <Link href="/admin/caja" className="text-primary underline">Caja</Link>.
        </p>
      </div>
    </div>
  )
}
