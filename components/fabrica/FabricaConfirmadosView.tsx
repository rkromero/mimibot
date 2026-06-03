'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatFechaAR } from '@/lib/dates'
import { useToast } from '@/components/shared/ToastProvider'
import { useGenerarDocumento } from '@/lib/pedidos/useGenerarDocumento'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import { Truck, Package, RefreshCw, FileText, Download, Tag } from 'lucide-react'

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
        <span className="font-medium">Expreso:</span>{' '}
        {pedido.expresoNombre ?? '—'}
        {pedido.expresoDireccion && (
          <span className="text-muted-foreground"> · {pedido.expresoDireccion}</span>
        )}
      </span>
    )
  }
  if (pedido.metodoEntrega === 'retiro_fabrica') {
    return <span className="font-medium">Retiro en fábrica</span>
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
  const { generarDocumento, isGenerating, anyGenerating } = useGenerarDocumento()
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
      <div className="p-4 md:p-6">
        <div className="text-sm text-muted-foreground">Cargando pedidos...</div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState
          title="Error al cargar pedidos"
          description="No se pudieron obtener los pedidos confirmados."
          action={{ label: 'Reintentar', onClick: () => void refetch() }}
        />
      </div>
    )
  }

  const pedidos = data?.data ?? []

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Pedidos Confirmados"
        description={`${pedidos.length} ${pedidos.length === 1 ? 'pedido' : 'pedidos'}`}
        actions={
          <button
            onClick={() => void refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <RefreshCw size={13} />
            Actualizar
          </button>
        }
      />

      {pedidos.length === 0 ? (
        <EmptyState
          title="Sin pedidos confirmados"
          description="Todos los pedidos confirmados ya fueron procesados."
        />
      ) : (
        <div className="space-y-4">
          {pedidos.map((pedido) => (
            <article key={pedido.id} className="border border-border rounded-lg bg-card overflow-hidden">

              {/* Header */}
              <div className="flex items-start justify-between px-4 py-3 border-b border-border">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-semibold text-foreground">
                      {pedido.cliente?.nombre} {pedido.cliente?.apellido}
                    </span>
                    <span className="text-xs font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                      #{pedido.id.slice(-8).toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatFechaAR(new Date(pedido.fecha))}
                  </p>
                </div>
                <span className="text-lg font-semibold text-foreground tabular-nums shrink-0 ml-4">
                  {formatMoney(pedido.total)}
                </span>
              </div>

              {/* Delivery */}
              <div className="flex items-start gap-2 px-4 py-2 border-b border-border text-sm text-muted-foreground">
                <Truck size={14} className="mt-0.5 shrink-0" />
                <EntregaInfo pedido={pedido} />
              </div>

              {/* Items */}
              <div className="px-4 py-3 border-b border-border">
                <div className="flex items-center gap-1.5 mb-2">
                  <Package size={13} className="text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Productos
                  </span>
                </div>
                <div className="space-y-1">
                  {pedido.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <span className="text-foreground">{item.producto.nombre}</span>
                      <div className="flex items-center gap-4 shrink-0 ml-4">
                        <span className="font-medium text-foreground">×{item.cantidad}</span>
                        <span className="tabular-nums text-muted-foreground w-20 text-right">
                          {formatMoney(item.subtotal)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {pedido.observaciones && (
                  <p className="mt-2 text-xs text-muted-foreground italic border-t border-border pt-2">
                    {pedido.observaciones}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                {/* Document buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void generarDocumento(pedido.id, 'remito')}
                    disabled={anyGenerating(pedido.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent transition-colors disabled:opacity-50"
                    title="Descargar remito PDF"
                  >
                    <FileText size={13} />
                    {isGenerating(pedido.id, 'remito') ? 'Generando...' : 'Remito'}
                  </button>
                  <button
                    onClick={() => void generarDocumento(pedido.id, 'proforma')}
                    disabled={anyGenerating(pedido.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent transition-colors disabled:opacity-50"
                    title="Descargar proforma PDF"
                  >
                    <Download size={13} />
                    {isGenerating(pedido.id, 'proforma') ? 'Generando...' : 'Proforma'}
                  </button>
                  <button
                    onClick={() => void generarDocumento(pedido.id, 'etiqueta')}
                    disabled={anyGenerating(pedido.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent transition-colors disabled:opacity-50"
                    title="Descargar etiqueta de envío PDF"
                  >
                    <Tag size={13} />
                    {isGenerating(pedido.id, 'etiqueta') ? 'Generando...' : 'Etiqueta'}
                  </button>
                </div>

                {/* Transition action */}
                {confirmId === pedido.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">¿Pasar a En reparto?</span>
                    <button
                      onClick={() => mutate.mutate(pedido.id)}
                      disabled={mutate.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {mutate.isPending ? 'Procesando...' : 'Confirmar'}
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      disabled={mutate.isPending}
                      className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmId(pedido.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    <Truck size={13} />
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
