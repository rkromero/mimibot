'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatFechaInstanteAR } from '@/lib/dates'
import { useToast } from '@/components/shared/ToastProvider'
import { useGenerarDocumento, type DocTipo } from '@/lib/pedidos/useGenerarDocumento'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import { cn } from '@/lib/utils'
import { Truck, Package, RefreshCw, FileText, Download, Tag, CheckCircle2, Send, X } from 'lucide-react'

type PedidoItemFabrica = {
  id: string
  cantidad: number
  subtotal: string
  producto: { id: string; nombre: string; sku: string | null; marca: { id: string; nombre: string } | null }
}

type PedidoFabrica = {
  id: string
  estado: string
  fecha: string
  total: string
  esReparto: boolean
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

function entregaLabel(pedido: PedidoFabrica): string {
  if (pedido.metodoEntrega === 'expreso') return `Expreso: ${pedido.expresoNombre ?? '—'}`
  if (pedido.metodoEntrega === 'retiro_fabrica') return 'Retiro en fábrica'
  if (pedido.esReparto) return 'Camioneta'
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

// Marcas distintas presentes en un pedido (un pedido puede mezclar marcas).
function marcasDistintas(items: PedidoItemFabrica[]): string[] {
  const seen = new Set<string>()
  for (const item of items) {
    seen.add(item.producto.marca?.nombre ?? 'Sin marca')
  }
  return [...seen]
}

function MarcaTag({ nombre }: { nombre: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
      {nombre}
    </span>
  )
}

function EstadoBadge({
  estado,
  esReparto,
  metodoEntrega,
}: {
  estado: string
  esReparto: boolean
  metodoEntrega: 'expreso' | 'retiro_fabrica' | null
}) {
  if (estado === 'listo_para_repartir') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        <CheckCircle2 size={11} />
        Listo p/ reparto
      </span>
    )
  }
  if (esReparto) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
        <Truck size={11} />
        Camioneta
      </span>
    )
  }
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

type ActionCellProps = {
  pedido: PedidoFabrica
  confirmListoId: string | null
  setConfirmListoId: (id: string | null) => void
  mutateListoParaRepartir: { mutate: (id: string) => void; isPending: boolean }
  generarDocumento: (id: string, tipo: DocTipo) => void
  isGenerating: (id: string, tipo: DocTipo) => boolean
  anyGenerating: (id: string) => boolean
}

function ActionCell({
  pedido,
  confirmListoId,
  setConfirmListoId,
  mutateListoParaRepartir,
  generarDocumento,
  isGenerating,
  anyGenerating,
}: ActionCellProps) {
  const isExpreso = pedido.metodoEntrega === 'expreso'
  const isCamioneta = pedido.esReparto
  const isRetiro = pedido.metodoEntrega === 'retiro_fabrica' && !pedido.esReparto
  const needsListo = isCamioneta || isExpreso || isRetiro

  const listoBtnColor = isExpreso
    ? 'bg-blue-600 text-white hover:bg-blue-700'
    : isRetiro
      ? 'bg-amber-600 text-white hover:bg-amber-700'
      : 'bg-emerald-600 text-white hover:bg-emerald-700'
  const listoIcon = isExpreso ? <Send size={11} /> : isRetiro ? <Package size={11} /> : <CheckCircle2 size={11} />
  const listoLabel = isExpreso ? 'Listo expreso' : isRetiro ? 'Listo p/retirar' : 'Listo p/repartir'
  const esperandoLabel = isRetiro ? 'Esperando retiro' : 'Esperando repartidor'

  return (
    <div className="flex items-center gap-1 flex-nowrap">
      <button
        onClick={() => void generarDocumento(pedido.id, 'remito')}
        disabled={anyGenerating(pedido.id)}
        className="flex items-center justify-center h-7 w-7 shrink-0 border border-border rounded hover:bg-accent transition-colors disabled:opacity-50"
        title="Remito PDF"
        aria-label="Remito PDF"
      >
        {isGenerating(pedido.id, 'remito') ? <RefreshCw size={12} className="animate-spin" /> : <FileText size={13} />}
      </button>
      <button
        onClick={() => void generarDocumento(pedido.id, 'proforma')}
        disabled={anyGenerating(pedido.id)}
        className="flex items-center justify-center h-7 w-7 shrink-0 border border-border rounded hover:bg-accent transition-colors disabled:opacity-50"
        title="Proforma PDF"
        aria-label="Proforma PDF"
      >
        {isGenerating(pedido.id, 'proforma') ? <RefreshCw size={12} className="animate-spin" /> : <Download size={13} />}
      </button>
      <button
        onClick={() => void generarDocumento(pedido.id, 'etiqueta')}
        disabled={anyGenerating(pedido.id)}
        className="flex items-center justify-center h-7 w-7 shrink-0 border border-border rounded hover:bg-accent transition-colors disabled:opacity-50"
        title="Etiqueta PDF"
        aria-label="Etiqueta PDF"
      >
        {isGenerating(pedido.id, 'etiqueta') ? <RefreshCw size={12} className="animate-spin" /> : <Tag size={13} />}
      </button>

      {pedido.estado === 'listo_para_repartir' ? (
        <span className="text-xs text-muted-foreground italic">{esperandoLabel}</span>
      ) : needsListo ? (
        confirmListoId === pedido.id ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => mutateListoParaRepartir.mutate(pedido.id)}
              disabled={mutateListoParaRepartir.isPending}
              className={cn(
                'px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50',
                listoBtnColor,
              )}
            >
              {mutateListoParaRepartir.isPending ? '...' : 'Confirmar'}
            </button>
            <button
              onClick={() => setConfirmListoId(null)}
              disabled={mutateListoParaRepartir.isPending}
              className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ×
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmListoId(pedido.id)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors',
              listoBtnColor,
            )}
          >
            {listoIcon}
            {listoLabel}
          </button>
        )
      ) : null}
    </div>
  )
}

export default function FabricaConfirmadosView() {
  const qc = useQueryClient()
  const toast = useToast()
  const { generarDocumento, generarDocumentosBulk, isGenerating, anyGenerating, isBulkGenerating } =
    useGenerarDocumento()
  const [confirmListoId, setConfirmListoId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { data, isLoading, isError, isFetching, refetch } = useQuery<{ data: PedidoFabrica[] }>({
    queryKey: ['fabrica', 'confirmado'],
    queryFn: () =>
      fetch('/api/fabrica/pedidos?estado=confirmado,listo_para_repartir').then((r) => r.json()),
    staleTime: 30_000,
  })

  const pedidos = data?.data ?? []

  // Si un pedido seleccionado deja de estar en la lista (p. ej. se marcó listo),
  // lo quitamos de la selección para no imprimir documentos de pedidos que ya
  // no se ven.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev
      const visibles = new Set(pedidos.map((p) => p.id))
      const next = new Set([...prev].filter((id) => visibles.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [pedidos])

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === pedidos.length ? new Set() : new Set(pedidos.map((p) => p.id)),
    )
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  const allSelected = pedidos.length > 0 && selectedIds.size === pedidos.length
  const selectedCount = selectedIds.size

  function imprimirBulk(tipo: DocTipo) {
    void generarDocumentosBulk([...selectedIds], tipo)
  }

  const mutateListoParaRepartir = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/pedidos/${id}/listo-para-repartir`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Error al actualizar el pedido')
      }
      return id
    },
    onSuccess: (id) => {
      qc.setQueryData(['fabrica', 'confirmado'], (old: { data: PedidoFabrica[] } | undefined) => ({
        data: (old?.data ?? []).map((p) =>
          p.id === id ? { ...p, estado: 'listo_para_repartir' } : p,
        ),
      }))
      toast.success('Pedido marcado como listo para repartir')
      setConfirmListoId(null)
    },
    onError: (err: Error) => {
      toast.error(err.message)
      setConfirmListoId(null)
    },
  })

  const actionProps = {
    confirmListoId,
    setConfirmListoId,
    mutateListoParaRepartir,
    generarDocumento,
    isGenerating,
    anyGenerating,
  }

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

  return (
    <div className="p-4 md:p-6 w-full">
      <PageHeader
        title="Pedidos Confirmados"
        description={`${pedidos.length} ${pedidos.length === 1 ? 'pedido' : 'pedidos'}`}
        actions={
          <button
            onClick={() => void refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
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
        <>
          {/* Desktop: tabla */}
          <div className="hidden lg:block overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card border-b border-border">
                <tr>
                  <th className="px-3 py-2.5 text-left w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 cursor-pointer accent-primary align-middle"
                      title="Seleccionar todos"
                      aria-label="Seleccionar todos"
                    />
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-28">Nº Pedido</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cliente</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-28">Fecha</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Productos</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-24">Marca</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider w-28">Total</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-32">Entrega</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-32">Estado</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pedidos.map((pedido) => (
                  <tr
                    key={pedido.id}
                    className={cn(
                      'transition-colors',
                      selectedIds.has(pedido.id) ? 'bg-primary/5' : 'hover:bg-accent/40',
                    )}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(pedido.id)}
                        onChange={() => toggleSelect(pedido.id)}
                        className="h-4 w-4 cursor-pointer accent-primary align-middle"
                        aria-label={`Seleccionar pedido ${pedido.id.slice(-8).toUpperCase()}`}
                      />
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                        #{pedido.id.slice(-8).toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-medium text-foreground whitespace-nowrap">
                      {pedido.cliente?.nombre} {pedido.cliente?.apellido}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                      {formatFechaInstanteAR(pedido.fecha)}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground max-w-[220px] truncate" title={pedido.items.map(i => `${i.producto.nombre} (${i.producto.marca?.nombre ?? 'Sin marca'}) ×${i.cantidad}`).join(', ')}>
                      {productosResumen(pedido.items)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {marcasDistintas(pedido.items).map((m) => (
                          <MarcaTag key={m} nombre={m} />
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums whitespace-nowrap">
                      {formatMoney(pedido.total)}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground whitespace-nowrap max-w-[140px] truncate" title={entregaLabel(pedido)}>
                      {entregaLabel(pedido)}
                    </td>
                    <td className="px-3 py-3">
                      <EstadoBadge estado={pedido.estado} esReparto={pedido.esReparto} metodoEntrega={pedido.metodoEntrega} />
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <ActionCell pedido={pedido} {...actionProps} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile / tablet: tarjetas */}
          <div className="lg:hidden space-y-4">
            {pedidos.map((pedido) => {
              const isExpreso = pedido.metodoEntrega === 'expreso'
              const isCamioneta = pedido.esReparto
              const isRetiro = pedido.metodoEntrega === 'retiro_fabrica' && !pedido.esReparto
              const needsListo = isCamioneta || isExpreso || isRetiro
              const listoBtnColor = isExpreso
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : isRetiro
                  ? 'bg-amber-600 text-white hover:bg-amber-700'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              const listoIcon = isExpreso ? <Send size={13} /> : isRetiro ? <Package size={13} /> : <CheckCircle2 size={13} />
              const listoLabel = isExpreso ? 'Listo expreso' : isRetiro ? 'Listo para retirar' : 'Listo para repartir'
              const confirmQuestion = isExpreso
                ? '¿Marcar listo expreso?'
                : isRetiro
                  ? '¿Marcar listo para retirar?'
                  : '¿Marcar listo para repartir?'
              const esperandoLabel = isRetiro ? 'Esperando retiro' : 'Esperando repartidor'
              return (
                <article key={pedido.id} className="border border-border rounded-lg bg-card overflow-hidden">

                  {/* Header */}
                  <div className="flex items-start justify-between px-4 py-3 border-b border-border gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(pedido.id)}
                        onChange={() => toggleSelect(pedido.id)}
                        className="h-4 w-4 mt-1 shrink-0 cursor-pointer accent-primary"
                        aria-label="Seleccionar pedido"
                      />
                      <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-semibold text-foreground">
                          {pedido.cliente?.nombre} {pedido.cliente?.apellido}
                        </span>
                        <span className="text-xs font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                          #{pedido.id.slice(-8).toUpperCase()}
                        </span>
                        <EstadoBadge estado={pedido.estado} esReparto={pedido.esReparto} metodoEntrega={pedido.metodoEntrega} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatFechaInstanteAR(pedido.fecha)}
                      </p>
                      </div>
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
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="text-foreground truncate">{item.producto.nombre}</span>
                            <MarcaTag nombre={item.producto.marca?.nombre ?? 'Sin marca'} />
                          </span>
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

                    {pedido.estado === 'listo_para_repartir' ? (
                      <span className="text-xs text-muted-foreground italic">
                        {esperandoLabel}
                      </span>
                    ) : needsListo ? (
                      confirmListoId === pedido.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {confirmQuestion}
                          </span>
                          <button
                            onClick={() => mutateListoParaRepartir.mutate(pedido.id)}
                            disabled={mutateListoParaRepartir.isPending}
                            className={cn(
                              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50',
                              listoBtnColor,
                            )}
                          >
                            {mutateListoParaRepartir.isPending ? 'Procesando...' : 'Confirmar'}
                          </button>
                          <button
                            onClick={() => setConfirmListoId(null)}
                            disabled={mutateListoParaRepartir.isPending}
                            className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmListoId(pedido.id)}
                          className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                            listoBtnColor,
                          )}
                        >
                          {listoIcon}
                          {listoLabel}
                        </button>
                      )
                    ) : null}
                  </div>

                </article>
              )
            })}
          </div>
        </>
      )}

      {selectedCount > 0 && (
        <div className="sticky bottom-0 z-30 -mx-4 md:-mx-6 mt-4 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 px-4 md:px-6 py-3">
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <span className="text-sm font-medium text-foreground">
              {selectedCount} {selectedCount === 1 ? 'pedido seleccionado' : 'pedidos seleccionados'}
            </span>
            <div className="flex flex-wrap items-center gap-2 md:ml-auto">
              <button
                onClick={() => imprimirBulk('remito')}
                disabled={isBulkGenerating()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-border bg-background hover:bg-accent transition-colors disabled:opacity-50"
              >
                <FileText size={14} />
                {isBulkGenerating('remito') ? 'Generando...' : 'Imprimir remitos'}
              </button>
              <button
                onClick={() => imprimirBulk('proforma')}
                disabled={isBulkGenerating()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-border bg-background hover:bg-accent transition-colors disabled:opacity-50"
              >
                <Download size={14} />
                {isBulkGenerating('proforma') ? 'Generando...' : 'Imprimir proformas'}
              </button>
              <button
                onClick={() => imprimirBulk('etiqueta')}
                disabled={isBulkGenerating()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-border bg-background hover:bg-accent transition-colors disabled:opacity-50"
              >
                <Tag size={14} />
                {isBulkGenerating('etiqueta') ? 'Generando...' : 'Imprimir etiquetas'}
              </button>
              <button
                onClick={clearSelection}
                disabled={isBulkGenerating()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              >
                <X size={14} />
                Limpiar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
