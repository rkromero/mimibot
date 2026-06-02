'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatFechaAR } from '@/lib/dates'
import { useToast } from '@/components/shared/ToastProvider'
import { Truck, Package, CheckCircle2, RefreshCw } from 'lucide-react'

type PedidoItemFabrica = {
  id: string
  cantidad: number
  subtotal: string
  producto: { id: string; nombre: string; sku: string | null }
}

type PedidoFabrica = {
  id: string
  fecha: string
  total: string
  metodoEntrega: 'retiro_fabrica' | 'expreso' | null
  expresoNombre: string | null
  expresoDireccion: string | null
  observaciones: string | null
  cliente: {
    id: string
    nombre: string
    apellido: string
    direccion: string | null
    localidad: string | null
    provincia: string | null
  } | null
  items: PedidoItemFabrica[]
}

function formatMoney(v: string | number) {
  return `$${parseFloat(String(v)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

function EntregaInfo({ pedido }: { pedido: PedidoFabrica }) {
  if (pedido.metodoEntrega === 'expreso') {
    return (
      <span>
        <span className="font-semibold">Expreso:</span>{' '}
        {pedido.expresoNombre ?? '—'}
        {pedido.expresoDireccion && (
          <span className="text-muted-foreground"> · {pedido.expresoDireccion}</span>
        )}
      </span>
    )
  }
  if (pedido.metodoEntrega === 'retiro_fabrica') {
    return <span className="font-semibold">Retiro en fábrica</span>
  }
  const dir = pedido.cliente?.direccion
  const loc = pedido.cliente?.localidad
  const prov = pedido.cliente?.provincia
  if (dir) {
    return (
      <span>
        {dir}
        {loc && `, ${loc}`}
        {prov && ` (${prov})`}
      </span>
    )
  }
  return <span className="text-muted-foreground italic">Sin dirección registrada</span>
}

export default function FabricaConfirmadosView() {
  const qc = useQueryClient()
  const toast = useToast()
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const { data, isLoading, isError, refetch } = useQuery<{ data: PedidoFabrica[] }>({
    queryKey: ['fabrica', 'confirmado'],
    queryFn: () => fetch('/api/fabrica/pedidos?estado=confirmado').then((r) => r.json()),
    staleTime: 30_000,
  })

  const mutate = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/pedidos/${id}/en-reparto`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Error al actualizar el pedido')
      }
      return id
    },
    onSuccess: (id) => {
      qc.setQueryData(['fabrica', 'confirmado'], (old: { data: PedidoFabrica[] } | undefined) => ({
        data: (old?.data ?? []).filter((p) => p.id !== id),
      }))
      toast.success('Pedido pasado a En reparto correctamente')
      setConfirmId(null)
    },
    onError: (err: Error) => {
      toast.error(err.message)
      setConfirmId(null)
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-lg">
        Cargando pedidos...
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-4">
        <p className="text-destructive text-lg">Error al cargar pedidos</p>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-border hover:bg-accent transition-colors"
        >
          <RefreshCw size={14} />
          Reintentar
        </button>
      </div>
    )
  }

  const pedidos = data?.data ?? []

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">
          Pedidos Confirmados
          <span className="ml-3 text-base font-normal text-muted-foreground">
            {pedidos.length} {pedidos.length === 1 ? 'pedido' : 'pedidos'}
          </span>
        </h2>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-accent transition-colors"
        >
          <RefreshCw size={14} />
          Actualizar
        </button>
      </div>

      {pedidos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <CheckCircle2 size={56} className="mb-4 opacity-20" />
          <p className="text-xl">No hay pedidos confirmados pendientes</p>
          <p className="text-sm mt-1">Todos los pedidos confirmados ya fueron procesados</p>
        </div>
      ) : (
        <div className="space-y-5">
          {pedidos.map((pedido) => (
            <article key={pedido.id} className="border border-border rounded-xl bg-card shadow-sm overflow-hidden">

              {/* Header */}
              <div className="flex items-start justify-between px-5 py-4 border-b border-border bg-accent/20">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xl font-bold text-foreground">
                      {pedido.cliente?.nombre} {pedido.cliente?.apellido}
                    </span>
                    <span className="text-sm font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded">
                      #{pedido.id.slice(-8).toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {formatFechaAR(new Date(pedido.fecha))}
                  </p>
                </div>
                <span className="text-2xl font-bold text-foreground tabular-nums shrink-0 ml-4">
                  {formatMoney(pedido.total)}
                </span>
              </div>

              {/* Delivery */}
              <div className="flex items-start gap-3 px-5 py-3 border-b border-border/60 text-sm">
                <Truck size={16} className="mt-0.5 text-muted-foreground shrink-0" />
                <EntregaInfo pedido={pedido} />
              </div>

              {/* Items */}
              <div className="px-5 py-3 border-b border-border/60">
                <div className="flex items-center gap-2 mb-2">
                  <Package size={14} className="text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Productos
                  </span>
                </div>
                <div className="space-y-1.5">
                  {pedido.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">{item.producto.nombre}</span>
                      <div className="flex items-center gap-5 text-muted-foreground shrink-0 ml-4">
                        <span className="font-semibold text-foreground">×{item.cantidad}</span>
                        <span className="tabular-nums w-24 text-right">{formatMoney(item.subtotal)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {pedido.observaciones && (
                  <p className="mt-2 text-sm text-muted-foreground italic border-t border-border/40 pt-2">
                    {pedido.observaciones}
                  </p>
                )}
              </div>

              {/* Action */}
              <div className="px-5 py-3 flex items-center justify-end gap-3 bg-muted/10">
                {confirmId === pedido.id ? (
                  <>
                    <span className="text-sm text-muted-foreground">
                      ¿Confirmar que este pedido pasa a En reparto?
                    </span>
                    <button
                      onClick={() => mutate.mutate(pedido.id)}
                      disabled={mutate.isPending}
                      className="px-5 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {mutate.isPending ? 'Procesando...' : 'Sí, pasar a En reparto'}
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      disabled={mutate.isPending}
                      className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmId(pedido.id)}
                    className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors shadow-sm"
                  >
                    <Truck size={16} />
                    Pasar a En reparto
                  </button>
                )}
              </div>

            </article>
          ))}
        </div>
      )}
    </div>
  )
}
