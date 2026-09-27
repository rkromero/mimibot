'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { TableroData } from '@/lib/tablero/tipos'
import { deltaTexto, money, pct } from './formato'

const SEMAFORO: Record<TableroData['semaforo'], { label: string; clase: string; punto: string }> = {
  ganando: { label: 'Ganando', clase: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800', punto: 'bg-green-500' },
  equilibrio: { label: 'En equilibrio', clase: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800', punto: 'bg-amber-500' },
  perdiendo: { label: 'Perdiendo', clase: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800', punto: 'bg-red-500' },
  'sin-datos': { label: 'Sin datos', clase: 'bg-muted text-muted-foreground border-border', punto: 'bg-muted-foreground' },
}

function Tarjeta({ titulo, valor, detalle, tono }: { titulo: string; valor: string; detalle?: string | null; tono?: 'pos' | 'neg' }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className={cn('text-2xl font-bold mt-1 tabular-nums', tono === 'pos' && 'text-green-600', tono === 'neg' && 'text-destructive')}>{valor}</p>
      {detalle && <p className="text-xs text-muted-foreground mt-1">{detalle}</p>}
    </div>
  )
}

/** Bloque 1: semáforo del mes, cuenta de resultados, punto de equilibrio y proyección. */
export default function BloqueResultado({ data }: { data: TableroData }) {
  const r = data.resultado.actual
  const a = data.resultado.anterior
  const s = SEMAFORO[data.semaforo]
  const pe = data.puntoEquilibrio
  const proy = data.proyeccion
  const margenNeto = r.ventas > 0 ? r.resultadoNeto / r.ventas : null

  return (
    <section className="space-y-3">
      <div className={cn('flex items-center justify-between gap-3 rounded-lg border px-4 py-3', s.clase)}>
        <div className="flex items-center gap-2.5">
          <span className={cn('h-3 w-3 rounded-full shrink-0', s.punto)} />
          <p className="font-semibold">{s.label}</p>
          <p className="text-sm opacity-80">
            {margenNeto !== null ? `Resultado neto ${pct(margenNeto)} de las ventas` : 'Todavía no hay ventas cargadas en el mes'}
          </p>
        </div>
        <Link href="/admin/resultado" className="text-xs underline opacity-80 hover:opacity-100 shrink-0">Ver detalle</Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Tarjeta titulo={`Ventas · ${r.cantidadPedidos} pedidos`} valor={money(r.ventas)} detalle={deltaTexto(r.ventas, a.ventas) && `${deltaTexto(r.ventas, a.ventas)} vs mes anterior`} />
        <Tarjeta titulo="Costo directo" valor={money(r.costoDirecto)} detalle={r.ventas > 0 ? `${pct(r.costoDirecto / r.ventas)} de las ventas` : null} />
        <Tarjeta titulo="Margen bruto" valor={money(r.margenBruto)} detalle={r.ventas > 0 ? `${pct(r.margenBruto / r.ventas)} de las ventas` : null} />
        <Tarjeta titulo="Gasto operativo" valor={money(r.gastoOperativo)} detalle={deltaTexto(r.gastoOperativo, a.gastoOperativo) && `${deltaTexto(r.gastoOperativo, a.gastoOperativo)} vs mes anterior`} />
        <Tarjeta titulo="Resultado neto" valor={money(r.resultadoNeto)} tono={r.resultadoNeto >= 0 ? 'pos' : 'neg'} detalle={deltaTexto(r.resultadoNeto, a.resultadoNeto) && `${deltaTexto(r.resultadoNeto, a.resultadoNeto)} vs mes anterior`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Punto de equilibrio</p>
          {pe ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm text-muted-foreground">Hay que vender</p>
                <p className="text-lg font-bold tabular-nums">{money(pe.ventasNecesarias)}</p>
              </div>
              <div className="mt-2 h-2.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', pe.avance >= 1 ? 'bg-green-500' : pe.avance >= 0.8 ? 'bg-amber-500' : 'bg-red-500')}
                  style={{ width: `${Math.min(100, pe.avance * 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Llevás {pct(pe.avance, 0)} de lo necesario
                {pe.faltante > 0 ? ` · faltan ${money(pe.faltante)}` : ' · ya cubriste los gastos del mes'}.
                Con el margen bruto actual ({pct(pe.margenBrutoPct)}), cada peso vendido deja {money(pe.margenBrutoPct, 2)} para pagar gastos operativos.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No se puede calcular: hacen falta ventas en el mes y un margen bruto positivo (costo directo menor a las ventas).
            </p>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Proyección de cierre</p>
          {proy ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm text-muted-foreground">Ventas proyectadas</p>
                <p className="text-lg font-bold tabular-nums">{money(proy.ventas)}</p>
              </div>
              <div className="flex items-baseline justify-between gap-3 mt-1">
                <p className="text-sm text-muted-foreground">Resultado proyectado</p>
                <p className={cn('text-lg font-bold tabular-nums', proy.resultadoNeto >= 0 ? 'text-green-600' : 'text-destructive')}>{money(proy.resultadoNeto)}</p>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Día {proy.diaActual} de {proy.diasDelMes}: ventas y gastos de lo que va del mes, extrapolados al mes completo. Es una tendencia, no un pronóstico.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Mes cerrado: el resultado de arriba es el definitivo con los datos cargados.</p>
          )}
        </div>
      </div>
    </section>
  )
}
