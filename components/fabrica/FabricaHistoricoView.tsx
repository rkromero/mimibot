'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatFechaAR } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { Search, Truck, Package, RefreshCw } from 'lucide-react'

type PedidoItemFabrica = {
  id: string
  cantidad: number
  subtotal: string
  producto: { id: string; nombre: string; sku: string | null }
}

type PedidoHistorico = {
  id: string
  fecha: string
  estado: string
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

const estadoBadge: Record<string, { label: string; cls: string }> = {
  en_reparto: {
    label: 'En reparto',
    cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  },
  entregado: {
    label: 'Entregado',
    cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  },
}

function formatMoney(v: string | number) {
  return `$${parseFloat(String(v)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

export default function FabricaHistoricoView() {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data, isLoading, isError, refetch } = useQuery<{ data: PedidoHistorico[] }>({
    queryKey: ['fabrica', 'historico'],
    queryFn: () =>
      fetch('/api/fabrica/pedidos?estado=en_reparto,entregado').then((r) => r.json()),
    staleTime: 30_000,
  })

  const pedidos = useMemo(() => {
    const all = data?.data ?? []
    if (!search.trim()) return all
    const q = search.toLowerCase()
    return all.filter((p) => {
      const clienteNombre = `${p.cliente?.nombre ?? ''} ${p.cliente?.apellido ?? ''}`.toLowerCase()
      const fechaStr = formatFechaAR(new Date(p.fecha)).toLowerCase()
      const idSuffix = p.id.slice(-8).toLowerCase()
      return clienteNombre.includes(q) || fechaStr.includes(q) || idSuffix.includes(q)
    })
  }, [data, search])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-lg">
        Cargando histórico...
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-4">
        <p className="text-destructive text-lg">Error al cargar histórico</p>
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

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">
          Histórico
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

      {/* Search */}
      <div className="relative mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por cliente, fecha o número..."
          className="w-full pl-9 pr-4 py-2.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
        />
      </div>

      {pedidos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Package size={48} className="mb-4 opacity-20" />
          <p className="text-xl">
            {search ? 'Sin resultados para esa búsqueda' : 'No hay pedidos en el histórico'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pedidos.map((pedido) => {
            const badge = estadoBadge[pedido.estado]
            const isExpanded = expanded === pedido.id

            return (
              <article key={pedido.id} className="border border-border rounded-xl bg-card shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? null : pedido.id)}
                  className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-accent/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-base font-bold text-foreground">
                        {pedido.cliente?.nombre} {pedido.cliente?.apellido}
                      </span>
                      <span className="text-xs font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded">
                        #{pedido.id.slice(-8).toUpperCase()}
                      </span>
                      {badge && (
                        <span className={cn('text-xs font-semibold px-2.5 py-0.5 rounded-full', badge.cls)}>
                          {badge.label}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {formatFechaAR(new Date(pedido.fecha))}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="text-lg font-bold tabular-nums">{formatMoney(pedido.total)}</span>
                    <svg
                      className={cn('w-4 h-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-border/60">
                    {/* Delivery */}
                    <div className="flex items-start gap-3 px-5 py-3 border-b border-border/60 text-sm">
                      <Truck size={16} className="mt-0.5 text-muted-foreground shrink-0" />
                      {pedido.metodoEntrega === 'expreso' ? (
                        <span>
                          <span className="font-semibold">Expreso:</span>{' '}
                          {pedido.expresoNombre ?? '—'}
                          {pedido.expresoDireccion && (
                            <span className="text-muted-foreground"> · {pedido.expresoDireccion}</span>
                          )}
                        </span>
                      ) : pedido.metodoEntrega === 'retiro_fabrica' ? (
                        <span className="font-semibold">Retiro en fábrica</span>
                      ) : (
                        <span className="text-muted-foreground">
                          {pedido.cliente?.direccion
                            ? `${pedido.cliente.direccion}${pedido.cliente.localidad ? `, ${pedido.cliente.localidad}` : ''}${pedido.cliente.provincia ? ` (${pedido.cliente.provincia})` : ''}`
                            : 'Sin dirección'}
                        </span>
                      )}
                    </div>

                    {/* Items */}
                    <div className="px-5 py-3">
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
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
