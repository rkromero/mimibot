'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { TableroData } from '@/lib/tablero/tipos'
import { deltaTexto, money, pct } from './formato'

/** Bloque 3: ventas por marca, indicadores de clientes y ventas por vendedor contra su meta. */
export default function BloqueVentas({ data }: { data: TableroData }) {
  const v = data.ventas
  const totalMarcas = v.porMarca.reduce((s, m) => s + m.facturado, 0)

  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="bg-card border border-border rounded-lg p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Ventas por marca</p>
        {v.porMarca.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin ventas en el mes.</p>
        ) : (
          <ul className="space-y-2.5">
            {v.porMarca.map((m) => {
              const share = totalMarcas > 0 ? m.facturado / totalMarcas : 0
              const d = deltaTexto(m.facturado, m.anterior)
              return (
                <li key={m.marcaId}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{m.marca} <span className="text-xs text-muted-foreground font-normal">· {m.pedidos} ped.</span></span>
                    <span className="tabular-nums">
                      {money(m.facturado)}
                      <span className="ml-1.5 text-xs text-muted-foreground">{pct(share, 0)}</span>
                      {d && <span className={cn('ml-1.5 text-[11px]', d.startsWith('+') ? 'text-green-600' : 'text-destructive')}>{d}</span>}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${share * 100}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <p className="text-xs text-muted-foreground mt-3">
          Facturación por los productos de cada marca (subtotales de ítems, sin envío). Para ver ganancia por marca hay que cargar el costo de los productos.
        </p>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-lg p-3">
            <p className="text-[11px] text-muted-foreground">Ticket promedio</p>
            <p className="text-lg font-bold tabular-nums">{money(v.ticketPromedio)}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-3">
            <p className="text-[11px] text-muted-foreground">Clientes que compraron</p>
            <p className="text-lg font-bold tabular-nums">{v.clientesQueCompraron}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-3">
            <p className="text-[11px] text-muted-foreground">Clientes nuevos</p>
            <p className="text-lg font-bold tabular-nums">{v.clientesNuevos}</p>
            <p className="text-[10px] text-muted-foreground">primer pedido en el mes</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Por vendedor</p>
            <Link href="/admin/metas" className="text-xs text-primary underline">Ver Metas</Link>
          </div>
          {v.porVendedor.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin ventas en el mes.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted-foreground">
                  <th className="text-left font-medium pb-1">Vendedor</th>
                  <th className="text-right font-medium pb-1">Ventas</th>
                  <th className="text-right font-medium pb-1">Pedidos / meta</th>
                </tr>
              </thead>
              <tbody>
                {v.porVendedor.map((r) => {
                  const cumple = r.metaPedidos !== null && r.metaPedidos > 0 ? r.pedidos / r.metaPedidos : null
                  return (
                    <tr key={r.vendedorId} className="border-t border-border/60">
                      <td className="py-1.5">{r.nombre}</td>
                      <td className="py-1.5 text-right tabular-nums">{money(r.ventas)}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {r.pedidos}
                        {r.metaPedidos !== null && (
                          <span className={cn('ml-1 text-xs', cumple !== null && cumple >= 1 ? 'text-green-600' : 'text-muted-foreground')}>
                            / {r.metaPedidos}{cumple !== null && ` (${pct(cumple, 0)})`}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  )
}
