'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { TableroData } from '@/lib/tablero/tipos'
import { METODO_LABEL, money, pct } from './formato'

/** Bloque 2: caja del mes (cobrado vs pagado por método) y deuda de clientes por antigüedad. */
export default function BloqueCaja({ data }: { data: TableroData }) {
  const { caja, deuda } = data
  const flujo = caja.cobrado - caja.pagado
  const ant = deuda.antiguedad
  const tramos = [
    { label: 'Al día (< 30 días)', valor: ant.alDia, clase: 'bg-green-500' },
    { label: '30 a 59 días', valor: ant.d30, clase: 'bg-amber-400' },
    { label: '60 a 89 días', valor: ant.d60, clase: 'bg-orange-500' },
    { label: '90 días o más', valor: ant.mas60, clase: 'bg-red-500' },
  ]

  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Caja del mes</p>
          <Link href="/admin/caja" className="text-xs text-primary underline">Ver Caja</Link>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div>
            <p className="text-[11px] text-muted-foreground">Cobrado</p>
            <p className="text-lg font-bold tabular-nums text-green-600">{money(caja.cobrado)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Pagado (gastos)</p>
            <p className="text-lg font-bold tabular-nums text-destructive">{money(caja.pagado)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Flujo neto</p>
            <p className={cn('text-lg font-bold tabular-nums', flujo >= 0 ? 'text-green-600' : 'text-destructive')}>{money(flujo)}</p>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-muted-foreground">
              <th className="text-left font-medium pb-1">Método</th>
              <th className="text-right font-medium pb-1">Cobrado</th>
              <th className="text-right font-medium pb-1">Pagado</th>
            </tr>
          </thead>
          <tbody>
            {caja.porMetodo.length === 0 && (
              <tr><td colSpan={3} className="py-3 text-center text-muted-foreground text-xs">Sin movimientos en el mes</td></tr>
            )}
            {caja.porMetodo.map((m) => (
              <tr key={m.metodo} className="border-t border-border/60">
                <td className="py-1.5">{METODO_LABEL[m.metodo] ?? m.metodo}</td>
                <td className="py-1.5 text-right tabular-nums">{money(m.cobrado)}</td>
                <td className="py-1.5 text-right tabular-nums">{money(m.pagado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground mt-3">
          Cobranza del mes: {pct(caja.cobranzaPct)} de lo vendido
          {caja.diasDeCobro !== null && ` · días de cobro: ${Math.round(caja.diasDeCobro)} (deuda actual sobre la venta diaria de los últimos 90 días)`}.
        </p>
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Deuda de clientes (hoy)</p>
          <Link href="/reportes/morosos" className="text-xs text-primary underline">Ver Morosos</Link>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-muted-foreground">{ant.pedidos} pedidos con saldo</p>
          <p className="text-xl font-bold tabular-nums">{money(ant.total)}</p>
        </div>
        {ant.total > 0 && (
          <div className="mt-2 flex h-2.5 w-full rounded-full overflow-hidden bg-muted">
            {tramos.map((t) => t.valor > 0 && (
              <div key={t.label} className={t.clase} style={{ width: `${(t.valor / ant.total) * 100}%` }} title={`${t.label}: ${money(t.valor)}`} />
            ))}
          </div>
        )}
        <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {tramos.map((t) => (
            <li key={t.label} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-muted-foreground"><span className={cn('h-2 w-2 rounded-full', t.clase)} />{t.label}</span>
              <span className="tabular-nums">{money(t.valor)}</span>
            </li>
          ))}
        </ul>

        {deuda.top.length > 0 && (
          <div className="mt-3 border-t border-border pt-2">
            <p className="text-[11px] text-muted-foreground mb-1">Mayores deudores</p>
            <ul className="space-y-1 text-sm">
              {deuda.top.slice(0, 6).map((d) => (
                <li key={d.clienteId} className="flex items-center justify-between gap-2">
                  <Link href={`/crm/clientes/${d.clienteId}`} className="truncate hover:underline">{d.nombre}</Link>
                  <span className="shrink-0 tabular-nums">
                    {money(d.saldo)}
                    <span className={cn('ml-1.5 text-[11px]', d.diasMax >= 60 ? 'text-destructive' : 'text-muted-foreground')}>{d.diasMax} d</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
