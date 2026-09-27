'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { todayStrAR } from '@/lib/dates'
import type { TableroData } from '@/lib/tablero/tipos'
import BloqueResultado from './BloqueResultado'
import BloqueCaja from './BloqueCaja'
import BloqueVentas from './BloqueVentas'
import BloqueComercialGastos from './BloqueComercialGastos'

/**
 * Tablero de comando (solo admin): una pantalla con el mes elegido y la
 * comparación contra el anterior, en cinco bloques: resultado con semáforo,
 * caja y deuda, ventas por marca / vendedor, embudo comercial y gastos.
 */
export default function TableroView() {
  const [mes, setMes] = useState(todayStrAR().slice(0, 7))

  const { data, isLoading, isFetching, error, refetch } = useQuery<TableroData>({
    queryKey: ['admin-tablero', mes],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tablero?mes=${mes}`)
      const json = await res.json().catch(() => ({})) as { data?: TableroData; error?: string }
      if (!res.ok || !json.data) throw new Error(json.error ?? 'No se pudo cargar el tablero')
      return json.data
    },
    staleTime: 60_000,
  })

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Tablero de comando</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Importes con IVA, tal como están cargados. Venta = pedido confirmado o posterior, por fecha del pedido; las muestras no cuentan.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={mes}
              onChange={(e) => e.target.value && setMes(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              aria-label="Mes"
            />
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="p-2 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50"
              aria-label="Actualizar"
              title="Actualizar"
            >
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-36 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : error || !data ? (
          <div className="bg-card border border-border rounded-lg p-6 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : 'No se pudo cargar el tablero'}
          </div>
        ) : (
          <>
            <BloqueResultado data={data} />
            <BloqueCaja data={data} />
            <BloqueVentas data={data} />
            <BloqueComercialGastos data={data} />
          </>
        )}
      </div>
    </div>
  )
}
