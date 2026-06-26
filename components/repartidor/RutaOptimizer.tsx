'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Route, Loader2, X, Navigation } from 'lucide-react'
import { useToast } from '@/components/shared/ToastProvider'
import { obtenerUbicacion, GeolocationDeniedError } from '@/lib/repartidor/route-ui'

type OptimizarResponse = {
  data: {
    ordenados: number
    sinUbicacion: number
    sospechosos: number
    motor: 'ors' | 'heuristica'
  }
}

/**
 * Controles de optimización de ruta para la vista "Mi ruta" del repartidor.
 * - Botón prominente "Optimizar ruta" (siempre visible arriba de la lista).
 * - Banner descartable de auto-sugerencia (cuando `suggested` es true), que
 *   dispara el mismo flujo.
 */
export default function RutaOptimizer({
  suggested,
  onDismissSuggestion,
}: {
  suggested: boolean
  onDismissSuggestion: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [loading, setLoading] = useState(false)

  async function handleOptimizar() {
    if (loading) return
    setLoading(true)
    try {
      // 1) Pedir ubicación. Si se niega/falla, mostramos error y NO llamamos al endpoint.
      let pos
      try {
        pos = await obtenerUbicacion()
      } catch (err) {
        if (err instanceof GeolocationDeniedError) {
          toast.error('Activá la ubicación para optimizar la ruta')
        } else {
          toast.error('No se pudo obtener tu ubicación. Activá la ubicación para optimizar la ruta')
        }
        return
      }

      // 2) Optimizar en el backend.
      const res = await fetch('/api/repartidor/optimizar-ruta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: pos.lat, lng: pos.lng }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null
        toast.error(j?.error ?? 'No se pudo optimizar la ruta')
        return
      }
      const json = (await res.json()) as OptimizarResponse

      // 3) Refrescar la lista y avisar.
      await qc.invalidateQueries({ queryKey: ['repartidor-pedidos'] })
      let msg = `Ruta optimizada: ${json.data.ordenados} paradas`
      if (json.data.sinUbicacion > 0) {
        msg += `, ${json.data.sinUbicacion} sin dirección geocodificada al final`
      }
      toast.success(msg)
      // Paradas con ubicación dudosa (outliers): quedaron al final, hay que revisarlas.
      if (json.data.sospechosos > 0) {
        const n = json.data.sospechosos
        toast.warning(
          `${n} ${n === 1 ? 'parada con ubicación dudosa quedó' : 'paradas con ubicación dudosa quedaron'} al final, revisá su dirección`,
        )
      }
      onDismissSuggestion()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      {suggested && (
        <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3">
          <Navigation size={20} className="text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground leading-tight">
              ¿Optimizar el orden de entrega?
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              Calculamos la ruta más corta desde tu ubicación.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleOptimizar()}
            disabled={loading}
            className="min-h-[44px] px-4 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] transition-all disabled:opacity-60 shrink-0"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : 'Optimizar'}
          </button>
          <button
            type="button"
            onClick={onDismissSuggestion}
            aria-label="Descartar sugerencia"
            className="min-h-[44px] min-w-[40px] inline-flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent active:bg-accent/70 transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => void handleOptimizar()}
        disabled={loading}
        className="w-full min-h-[52px] flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary/90 active:bg-primary/80 text-primary-foreground font-semibold text-base shadow-sm active:scale-[0.99] transition-all disabled:opacity-60"
        aria-label="Optimizar ruta"
      >
        {loading ? (
          <>
            <Loader2 size={20} className="animate-spin" />
            Optimizando...
          </>
        ) : (
          <>
            <Route size={20} strokeWidth={2} />
            Optimizar ruta
          </>
        )}
      </button>
    </div>
  )
}
