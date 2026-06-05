'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, RefreshCw } from 'lucide-react'
import PedidoCard, { type Pedido } from '@/components/repartidor/PedidoCard'
import ListoParaRepartirView from '@/components/repartidor/ListoParaRepartirView'

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

type Tab = 'listos' | 'ruta'

export default function RepartidorPage() {
  const [tab, setTab] = useState<Tab>('listos')

  const { data: rutaData, isLoading: rutaLoading, error: rutaError, refetch: rutaRefetch, isFetching: rutaFetching } = useQuery({
    queryKey: ['repartidor-pedidos'],
    queryFn: fetchPedidos,
    refetchInterval: 60_000,
  })

  // Share the same cache key used by ListoParaRepartirView for the count badge
  const { data: listosData } = useQuery<{ data: unknown[] }>({
    queryKey: ['repartidor-listos'],
    queryFn: () => fetch('/api/repartidor/listos').then((r) => r.json()) as Promise<{ data: unknown[] }>,
    refetchInterval: 60_000,
  })

  const listosCount = listosData?.data.length ?? 0
  const rutaCount = rutaData?.length ?? 0

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b border-border bg-card shrink-0">
        <button
          onClick={() => setTab('listos')}
          className={`relative flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
            tab === 'listos'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Por aceptar
          {listosCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-xs rounded-full bg-primary text-primary-foreground font-bold">
              {listosCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('ruta')}
          className={`relative flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
            tab === 'ruta'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Mi ruta
          {rutaCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-xs rounded-full bg-primary text-primary-foreground font-bold">
              {rutaCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      {tab === 'listos' ? (
        <ListoParaRepartirView onRutaArmada={() => setTab('ruta')} />
      ) : (
        <div className="flex-1 overflow-y-auto">
          {rutaLoading ? (
            <div className="p-4 space-y-4">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : rutaError ? (
            <div className="flex flex-col items-center justify-center min-h-[60dvh] px-6 text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle size={30} className="text-destructive" />
              </div>
              <div>
                <p className="font-bold text-xl text-foreground">Error al cargar</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  {rutaError instanceof Error ? rutaError.message : 'Revisá tu conexión e intentá de nuevo.'}
                </p>
              </div>
              <button
                onClick={() => void rutaRefetch()}
                disabled={rutaFetching}
                className="min-h-[52px] px-8 py-3 bg-primary text-primary-foreground rounded-xl font-semibold flex items-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-all"
              >
                {rutaFetching ? (
                  <RefreshCw size={18} className="animate-spin" />
                ) : (
                  <RefreshCw size={18} />
                )}
                Reintentar
              </button>
            </div>
          ) : !rutaData || rutaData.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[60dvh] px-6 text-center gap-3">
              <span className="text-6xl leading-none select-none">🎉</span>
              <p className="font-bold text-2xl text-foreground mt-2">¡Todo entregado!</p>
              <p className="text-muted-foreground text-sm">No hay pedidos en reparto por ahora.</p>
            </div>
          ) : (
            <div className="p-4 pb-10 space-y-4">
              {rutaFetching && !rutaLoading && (
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-1">
                  <RefreshCw size={12} className="animate-spin" />
                  Actualizando...
                </div>
              )}
              {rutaData.map((pedido) => (
                <PedidoCard key={pedido.id} {...pedido} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
