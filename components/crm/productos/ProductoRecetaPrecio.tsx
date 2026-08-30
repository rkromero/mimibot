'use client'

import { useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { round2 } from '@/lib/costos/calculo'
import { resolverMargen } from '@/lib/costos/margen'
import type { Receta } from '@/components/admin/cotizador/RecetaCard'

const inputClass = cn(
  'w-full px-3 py-2.5 md:py-1.5 text-[16px] md:text-sm rounded-md border',
  'border-border bg-background text-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring',
  'transition-colors duration-100',
)

type Props = {
  recetas: Receta[]
  margenGlobal: number | null
  recetaId: string
  onRecetaId: (v: string) => void
  costo: string
  onCosto: (v: string) => void
  margen: string
  onMargen: (v: string) => void
  precio: string
  onPrecio: (v: string) => void
  ivaPct: string
}

// Bloque de costo por receta y precio sugerido del producto (FASE 1D).
// Con receta elegida el costo es de solo lectura: se muestra el costo
// calculado que ya trae la receta desde el endpoint (lib/costos).
export default function ProductoRecetaPrecio({
  recetas, margenGlobal, recetaId, onRecetaId, costo, onCosto,
  margen, onMargen, precio, onPrecio, ivaPct,
}: Props) {
  const [filtro, setFiltro] = useState('')
  const receta = recetas.find((r) => r.id === recetaId) ?? null
  const opciones = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    return recetas.filter((r) => !q || r.nombre.toLowerCase().includes(q) || String(r.gramaje).includes(q))
  }, [recetas, filtro])

  const costoCalculado = receta ? receta.costo.costoUnitario : null
  const costoEfectivo = costoCalculado ?? (costo !== '' ? Number(costo) : null)

  // Cascada de margen: producto → receta → global (la lista llega en Fase 2)
  const margenProducto = margen !== '' && !isNaN(Number(margen)) ? Number(margen) : null
  const margenReceta = receta?.margenPct != null ? Number(receta.margenPct) : null
  const resuelto = resolverMargen(margenProducto ?? margenReceta, null, margenGlobal ?? 0)
  const origenLabel = margenProducto != null ? 'producto' : margenReceta != null ? 'receta' : 'global'

  const iva = Number(ivaPct) || 0
  const netoFull = costoEfectivo != null && costoEfectivo > 0 && resuelto.valor < 100
    ? costoEfectivo / (1 - resuelto.valor / 100)
    : null
  const neto = netoFull != null ? round2(netoFull) : null
  const final = netoFull != null ? round2(netoFull * (1 + iva / 100)) : null

  const precioNum = precio !== '' ? Number(precio) : null
  const difiere = neto != null && precioNum != null && Math.abs(precioNum - neto) > 0.005
  const difPct = difiere && neto > 0 ? round2(((precioNum - neto) / neto) * 100) : null

  return (
    <div className="space-y-3 border border-border rounded-md p-3">
      <p className="text-xs font-medium text-foreground">Costo y precio sugerido</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Receta</label>
          {recetas.length > 6 && (
            <input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Filtrar recetas..."
              className={cn(inputClass, 'mb-1')}
            />
          )}
          <select value={recetaId} onChange={(e) => onRecetaId(e.target.value)} className={inputClass}>
            <option value="">Sin receta (costo manual)</option>
            {opciones.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre} — {r.gramaje} g{r.esCotizador ? ' (cotizador)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            Costo ($)
            {receta && (
              <span className="relative group inline-flex" tabIndex={0}>
                <Info size={12} className="text-sky-600 dark:text-sky-400" />
                <span className="pointer-events-none absolute left-0 top-5 z-20 hidden group-hover:block group-focus:block w-60 rounded-md border border-border bg-card p-2 shadow-lg">
                  {receta.costo.detalle.map((d) => (
                    <span key={d.insumoId} className="flex justify-between text-[11px] text-muted-foreground">
                      <span>{d.nombre}</span><span>$ {d.costo.toFixed(2)}</span>
                    </span>
                  ))}
                  <span className="flex justify-between text-[11px] text-muted-foreground">
                    <span>Packaging</span><span>$ {receta.costo.costoPackaging.toFixed(2)}</span>
                  </span>
                  <span className="flex justify-between text-[11px] font-semibold text-foreground border-t border-border mt-1 pt-1">
                    <span>Costo unitario</span><span>$ {receta.costo.costoUnitario.toFixed(2)}</span>
                  </span>
                </span>
              </span>
            )}
          </label>
          <input
            type="number" min="0" step="0.01"
            value={receta ? receta.costo.costoUnitario.toFixed(2) : costo}
            onChange={(e) => { if (!receta) onCosto(e.target.value) }}
            readOnly={!!receta}
            placeholder="0.00"
            className={cn(inputClass, receta && 'bg-muted/50 text-muted-foreground cursor-default')}
          />
          {receta && <p className="text-[11px] text-muted-foreground mt-0.5">Calculado desde la receta</p>}
        </div>
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1">Margen % (opcional)</label>
        <input
          type="number" min="0" max="99.99" step="0.01"
          value={margen}
          onChange={(e) => onMargen(e.target.value)}
          placeholder={
            margenReceta != null
              ? `Hereda: ${margenReceta}% (receta)`
              : margenGlobal != null
                ? `Hereda: ${margenGlobal}% (global)`
                : 'Hereda del global'
          }
          className={inputClass}
        />
      </div>

      {costoEfectivo != null && costoEfectivo > 0 && (
        <div className="text-xs space-y-0.5">
          <div className="flex justify-between text-muted-foreground">
            <span>Costo</span><span>$ {costoEfectivo.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Margen ({origenLabel})</span><span>{resuelto.valor}%</span>
          </div>
          <div className="flex justify-between text-foreground">
            <span>Precio neto sugerido</span><span>$ {neto != null ? neto.toFixed(2) : '—'}</span>
          </div>
          <div className="flex justify-between font-semibold text-foreground">
            <span>Precio final con IVA ({iva}%)</span><span>$ {final != null ? final.toFixed(2) : '—'}</span>
          </div>
          {difiere && neto != null && difPct != null && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="inline-flex px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                Precio guardado {difPct > 0 ? '+' : ''}{difPct}% vs sugerido
              </span>
              <button
                type="button"
                onClick={() => onPrecio(neto.toFixed(2))}
                className="text-[11px] text-primary underline hover:no-underline"
              >
                Usar precio sugerido
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
