'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatFechaAR } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { useGenerarDocumento } from '@/lib/pedidos/useGenerarDocumento'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import { Search, Truck, Package, RefreshCw, FileText, Download, ChevronDown, Tag, Send } from 'lucide-react'

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

function MetodoBadge({ metodoEntrega }: { metodoEntrega: 'expreso' | 'retiro_fabrica' | null }) {
  if (metodoEntrega === 'expreso') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
        <Send size={11} />
        Expreso
      </span>
    )
  }
  if (metodoEntrega === 'retiro_fabrica') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
        Retiro
      </span>
    )
  }
  return null
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

function entregaLabel(pedido: PedidoHistorico): string {
  if (pedido.metodoEntrega === 'expreso') return `Expreso: ${pedido.expresoNombre ?? '—'}`
  if (pedido.metodoEntrega === 'retiro_fabrica') return 'Retiro en fábrica'
  const loc = pedido.cliente?.localidad ?? pedido.cliente?.direccion
  return loc ?? '—'
}

function productosResumen(items: PedidoItemFabrica[]): string {
  const first = items[0]
  if (!first) return '—'
  if (items.length === 1) return `${first.producto.nombre} ×${first.cantidad}`
  const total = items.reduce((s, i) => s + i.cantidad, 0)
  return `${items.length} productos (${total} un.)`
}

export default function FabricaHistoricoView() {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const { generarDocumento, isGenerating, anyGenerating } = useGenerarDocumento()

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
      <div className="p-4 md:p-6">
        <div className="text-sm text-muted-foreground">Cargando histórico...</div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState
          title="Error al cargar histórico"
          description="No se pudieron obtener los pedidos del histórico."
          action={{ label: 'Reintentar', onClick: () => void refetch() }}
        />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Histórico"
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

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por cliente, fecha o número..."
          className="w-full pl-9 pr-4 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
        />
      </div>

      {pedidos.length === 0 ? (
        <EmptyState
          title={search ? 'Sin resultados' : 'Sin pedidos en el histórico'}
          description={search ? `No hay resultados para "${search}".` : undefined}
        />
      ) : (
        <>
          {/* Desktop: tabla */}
          <div className="hidden md:block overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card border-b border-border">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-28">Nº Pedido</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cliente</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-28">Fecha</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Productos</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider w-28">Total</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-36">Entrega</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-28">Estado</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pedidos.map((pedido) => {
                  const badge = estadoBadge[pedido.estado]
                  return (
                    <tr key={pedido.id} className="hover:bg-accent/40 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-mono text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                          #{pedido.id.slice(-8).toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                        {pedido.cliente?.nombre} {pedido.cliente?.apellido}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {formatFechaAR(new Date(pedido.fecha))}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[220px] truncate" title={pedido.items.map(i => `${i.producto.nombre} ×${i.cantidad}`).join(', ')}>
                        {productosResumen(pedido.items)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap">
                        {formatMoney(pedido.total)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap max-w-[140px] truncate" title={entregaLabel(pedido)}>
                        {entregaLabel(pedido)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {badge && (
                            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', badge.cls)}>
                              {badge.label}
                            </span>
                          )}
                          <MetodoBadge metodoEntrega={pedido.metodoEntrega} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => void generarDocumento(pedido.id, 'remito')}
                            disabled={anyGenerating(pedido.id)}
                            className="flex items-center gap-1 px-2 py-1 border border-border rounded text-xs hover:bg-accent transition-colors disabled:opacity-50"
                            title="Remito PDF"
                          >
                            <FileText size={11} />
                            {isGenerating(pedido.id, 'remito') ? '...' : 'Remito'}
                          </button>
                          <button
                            onClick={() => void generarDocumento(pedido.id, 'proforma')}
                            disabled={anyGenerating(pedido.id)}
                            className="flex items-center gap-1 px-2 py-1 border border-border rounded text-xs hover:bg-accent transition-colors disabled:opacity-50"
                            title="Proforma PDF"
                          >
                            <Download size={11} />
                            {isGenerating(pedido.id, 'proforma') ? '...' : 'Proforma'}
                          </button>
                          <button
                            onClick={() => void generarDocumento(pedido.id, 'etiqueta')}
                            disabled={anyGenerating(pedido.id)}
                            className="flex items-center gap-1 px-2 py-1 border border-border rounded text-xs hover:bg-accent transition-colors disabled:opacity-50"
                            title="Etiqueta PDF"
                          >
                            <Tag size={11} />
                            {isGenerating(pedido.id, 'etiqueta') ? '...' : 'Etiqueta'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: tarjetas expandibles */}
          <div className="md:hidden space-y-2">
            {pedidos.map((pedido) => {
              const badge = estadoBadge[pedido.estado]
              const isExpanded = expanded === pedido.id

              return (
                <article key={pedido.id} className="border border-border rounded-lg bg-card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : pedido.id)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">
                          {pedido.cliente?.nombre} {pedido.cliente?.apellido}
                        </span>
                        <span className="text-xs font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                          #{pedido.id.slice(-8).toUpperCase()}
                        </span>
                        {badge && (
                          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', badge.cls)}>
                            {badge.label}
                          </span>
                        )}
                        <MetodoBadge metodoEntrega={pedido.metodoEntrega} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatFechaAR(new Date(pedido.fecha))}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-semibold tabular-nums">{formatMoney(pedido.total)}</span>
                      <ChevronDown
                        size={14}
                        className={cn('text-muted-foreground transition-transform', isExpanded && 'rotate-180')}
                      />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border">
                      {/* Delivery */}
                      <div className="flex items-start gap-2 px-4 py-2 border-b border-border text-sm text-muted-foreground">
                        <Truck size={14} className="mt-0.5 shrink-0" />
                        {pedido.metodoEntrega === 'expreso' ? (
                          <span>
                            <span className="font-medium text-foreground">Expreso:</span>{' '}
                            {pedido.expresoNombre ?? '—'}
                            {pedido.expresoDireccion && (
                              <span> · {pedido.expresoDireccion}</span>
                            )}
                          </span>
                        ) : pedido.metodoEntrega === 'retiro_fabrica' ? (
                          <span className="font-medium text-foreground">Retiro en fábrica</span>
                        ) : (
                          <span>
                            {pedido.cliente?.direccion
                              ? `${pedido.cliente.direccion}${pedido.cliente.localidad ? `, ${pedido.cliente.localidad}` : ''}${pedido.cliente.provincia ? ` (${pedido.cliente.provincia})` : ''}`
                              : 'Sin dirección'}
                          </span>
                        )}
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

                      {/* Document buttons */}
                      <div className="px-4 py-3 flex items-center gap-2">
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
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
