'use client'

import { useQuery } from '@tanstack/react-query'
import { AlertCircle, RefreshCw } from 'lucide-react'
import PedidoCard, { type Pedido } from '@/components/repartidor/PedidoCard'

async function fetchPedidos(): Promise<Pedido[]> {
  const res = await fetch('/api/repartidor/pedidos')
  if (!res.ok) throw new Error('No se pudieron cargar los pedidos')
  const json = await res.json() as { data: Pedido[] }
  return json.data
}

function CardSkeleton() {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3 animate-pulse">
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-6 w-3/5 bg-muted rounded-lg" />
          <div className="h-4 w-4/5 bg-muted rounded-md" />
        </div>
        <div className="h-6 w-16 bg-muted rounded-lg shrink-0" />
      </div>
      <div className="h-4 w-2/3 bg-muted rounded-md" />
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[52px] bg-muted rounded-xl" />
        ))}
      </div>
    </div>
  )
}

export default function RepartidorPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['repartidor-pedidos'],
    queryFn: fetchPedidos,
    refetchInterval: 60_000,
  })

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60dvh] px-6 text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle size={30} className="text-destructive" />
        </div>
        <div>
          <p className="font-bold text-xl text-foreground">Error al cargar</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            {error instanceof Error ? error.message : 'Revisá tu conexión e intentá de nuevo.'}
          </p>
        </div>
        <button
          onClick={() => void refetch()}
          disabled={isFetching}
          className="min-h-[52px] px-8 py-3 bg-primary text-primary-foreground rounded-xl font-semibold flex items-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-all"
        >
          {isFetching ? (
            <RefreshCw size={18} className="animate-spin" />
          ) : (
            <RefreshCw size={18} />
          )}
          Reintentar
        </button>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60dvh] px-6 text-center gap-3">
        <span className="text-6xl leading-none select-none">🎉</span>
        <p className="font-bold text-2xl text-foreground mt-2">¡Todo entregado!</p>
        <p className="text-muted-foreground text-sm">No hay pedidos en reparto por ahora.</p>
      </div>
    )
  }

  return (
    <div className="p-4 pb-10 space-y-4">
      {isFetching && !isLoading && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-1">
          <RefreshCw size={12} className="animate-spin" />
          Actualizando...
        </div>
      )}
      {data.map((pedido) => (
        <PedidoCard key={pedido.id} {...pedido} />
      ))}
    </div>
  )
}
