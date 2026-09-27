'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { TableroData } from '@/lib/tablero/tipos'
import { deltaTexto, money, pct } from './formato'

function Paso({ label, valor, detalle }: { label: string; valor: number; detalle?: string }) {
  return (
    <div className="bg-muted/40 rounded-lg p-3 text-center">
      <p className="text-2xl font-bold tabular-nums">{valor}</p>
      <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
      {detalle && <p className="text-[10px] text-muted-foreground mt-0.5">{detalle}</p>}
    </div>
  )
}

/** Bloques 4 y 5: embudo comercial del mes y gastos por categoría contra el mes anterior. */
export default function BloqueComercialGastos({ data }: { data: TableroData }) {
  const e = data.embudo
  const cerrados = e.ganados + e.perdidos
  const conversion = cerrados > 0 ? e.ganados / cerrados : null
  const muestrasPct = e.muestrasEntregadas > 0 ? e.muestrasConPedido / e.muestrasEntregadas : null
  const totalGastos = data.gastos.reduce((s, g) => s + g.total, 0)
  const subieron = data.gastos
    .filter((g) => g.total > g.anterior && g.anterior > 0)
    .sort((a, b) => (b.total - b.anterior) - (a.total - a.anterior))
    .slice(0, 3)

  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Comercial (embudo del mes)</p>
          <Link href="/pipeline" className="text-xs text-primary underline">Ver Pipeline</Link>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Paso label="Leads nuevos" valor={e.leadsNuevos} />
          <Paso label="Propuestas enviadas" valor={e.propuestasEnviadas} />
          <Paso label="Ganados" valor={e.ganados} detalle={conversion !== null ? `${pct(conversion, 0)} de los cerrados` : undefined} />
          <Paso label="Perdidos" valor={e.perdidos} />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Paso label="Muestras entregadas" valor={e.muestrasEntregadas} />
          <Paso label="Muestras que terminaron en pedido" valor={e.muestrasConPedido} detalle={muestrasPct !== null ? pct(muestrasPct, 0) : undefined} />
        </div>
        {e.motivosPerdida.length > 0 && (
          <div className="mt-3 border-t border-border pt-2">
            <p className="text-[11px] text-muted-foreground mb-1">Por qué se pierden</p>
            <ul className="space-y-1 text-sm">
              {e.motivosPerdida.map((m) => (
                <li key={m.motivo} className="flex items-center justify-between gap-2">
                  <span className="truncate">{m.motivo}</span>
                  <span className="tabular-nums text-muted-foreground">{m.cantidad}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gastos por categoría</p>
          <Link href="/admin/gastos" className="text-xs text-primary underline">Ver Gastos</Link>
        </div>
        {subieron.length > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md px-2.5 py-1.5 mb-2">
            Subieron más: {subieron.map((g) => `${g.categoria} (+${money(g.total - g.anterior)})`).join(' · ')}
          </p>
        )}
        {data.gastos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin gastos cargados en el mes.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-muted-foreground">
                <th className="text-left font-medium pb-1">Categoría</th>
                <th className="text-right font-medium pb-1">Mes</th>
                <th className="text-right font-medium pb-1">vs anterior</th>
              </tr>
            </thead>
            <tbody>
              {data.gastos.map((g) => {
                const d = deltaTexto(g.total, g.anterior)
                return (
                  <tr key={g.categoria} className="border-t border-border/60">
                    <td className="py-1.5">
                      {g.categoria}
                      <span className={cn('ml-1.5 text-[10px] px-1 py-0.5 rounded', g.tipo === 'costo_directo' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                        {g.tipo === 'costo_directo' ? 'directo' : 'operativo'}
                      </span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {money(g.total)}
                      {totalGastos > 0 && <span className="ml-1 text-[11px] text-muted-foreground">{pct(g.total / totalGastos, 0)}</span>}
                    </td>
                    <td className={cn('py-1.5 text-right tabular-nums text-xs', d?.startsWith('+') ? 'text-destructive' : 'text-muted-foreground')}>{d ?? '—'}</td>
                  </tr>
                )
              })}
              <tr className="border-t border-border font-semibold">
                <td className="py-1.5">Total</td>
                <td className="py-1.5 text-right tabular-nums">{money(totalGastos)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
