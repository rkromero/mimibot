'use client'

import { useState, useRef } from 'react'
import { X, Plus, Minus, Trash2, ArrowLeft, CheckCircle, Package } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'

type Props = {
  clienteId?: string
  onClose: () => void
}

type ClienteOption = {
  id: string
  nombre: string
  apellido: string
}

type Producto = {
  id: string
  nombre: string
  precio: string
  sku: string | null
  stockActual: number
  stockMinimo: number
  bajoCritico: boolean
}

type ItemRow = {
  productoId: string
  productoNombre: string
  cantidad: number
  precioUnitario: string
}

type RemovedItem = {
  item: ItemRow
  idx: number
}

type SuccessData = {
  pedidoId: string
  total: string
}

function formatMoney(value: number) {
  return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

const inputClass = cn(
  'w-full px-3 py-2.5 md:py-1.5 text-[16px] md:text-sm rounded-md border',
  'border-border bg-background text-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring',
  'transition-colors duration-100',
)

export default function CreatePedidoModal({ clienteId, onClose }: Props) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showProductSearch, setShowProductSearch] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [removedItem, setRemovedItem] = useState<RemovedItem | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [successData, setSuccessData] = useState<SuccessData | null>(null)

  const [form, setForm] = useState({
    clienteId: clienteId ?? '',
    fecha: todayStr,
    observaciones: '',
  })
  const [items, setItems] = useState<ItemRow[]>([])

  // Query clientes (solo si no hay clienteId fijo)
  const { data: clientes = [] } = useQuery<ClienteOption[]>({
    queryKey: ['clientes-options'],
    queryFn: async () => {
      const res = await fetch('/api/clientes')
      if (!res.ok) return []
      const json = await res.json() as { data: ClienteOption[] }
      return json.data
    },
    staleTime: 60_000,
    enabled: !clienteId,
  })

  // Query cliente individual (para mostrar nombre en header cuando clienteId está dado)
  const { data: clienteData } = useQuery({
    queryKey: ['cliente', clienteId],
    queryFn: async () => {
      if (!clienteId) return null
      const res = await fetch(`/api/clientes/${clienteId}`)
      if (!res.ok) return null
      const json = await res.json() as { data: { nombre: string; apellido: string } }
      return json.data
    },
    enabled: !!clienteId,
    staleTime: 60_000,
  })

  type RawProducto = { id: string; nombre: string; precio: string; sku: string | null }
  type StockSaldo = { id: string; stockActual: number; stockMinimo: number; bajoCritico: boolean }

  const { data: rawProductos = [] } = useQuery<RawProducto[]>({
    queryKey: ['productos-activos'],
    queryFn: async () => {
      const res = await fetch('/api/productos?activo=true')
      if (!res.ok) return []
      const json = await res.json() as { data: RawProducto[] }
      return json.data
    },
    staleTime: 60_000,
  })

  const { data: stockSaldos = [] } = useQuery<StockSaldo[]>({
    queryKey: ['stock-saldos'],
    queryFn: async () => {
      const res = await fetch('/api/stock/saldos')
      if (!res.ok) return []
      const json = await res.json() as { data: StockSaldo[] }
      return json.data
    },
    staleTime: 30_000,
  })

  const stockMap = new Map(stockSaldos.map((s) => [s.id, s]))

  const productos: Producto[] = rawProductos.map((p) => {
    const stock = stockMap.get(p.id)
    return {
      ...p,
      stockActual: stock?.stockActual ?? 0,
      stockMinimo: stock?.stockMinimo ?? 0,
      bajoCritico: stock?.bajoCritico ?? false,
    }
  })

  const clienteNombreStr = clienteData
    ? `${clienteData.nombre} ${clienteData.apellido}`
    : ''

  const filteredProducts = productos.filter((p) =>
    !productSearch || p.nombre.toLowerCase().includes(productSearch.toLowerCase()),
  )

  const total = items.reduce(
    (sum, item) => sum + item.cantidad * parseFloat(item.precioUnitario),
    0,
  )

  function setField<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function addProducto(producto: Producto) {
    setItems((prev) => {
      const existing = prev.findIndex((i) => i.productoId === producto.id)
      if (existing >= 0) {
        return prev.map((item, i) =>
          i === existing ? { ...item, cantidad: item.cantidad + 1 } : item,
        )
      }
      return [
        ...prev,
        {
          productoId: producto.id,
          productoNombre: producto.nombre,
          cantidad: 1,
          precioUnitario: producto.precio,
        },
      ]
    })
    setShowProductSearch(false)
    setProductSearch('')
  }

  function changeQty(idx: number, delta: number) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item
        const newQty = Math.max(1, item.cantidad + delta)
        return { ...item, cantidad: newQty }
      }),
    )
  }

  function removeItem(idx: number) {
    const item = items[idx]
    if (!item) return
    setItems((prev) => prev.filter((_, i) => i !== idx))
    setRemovedItem({ item, idx })
    if (toastTimeout.current) clearTimeout(toastTimeout.current)
    toastTimeout.current = setTimeout(() => setRemovedItem(null), 3500)
  }

  function undoRemove() {
    if (!removedItem) return
    setItems((prev) => {
      const next = [...prev]
      next.splice(Math.min(removedItem.idx, next.length), 0, removedItem.item)
      return next
    })
    setRemovedItem(null)
  }

  async function handleSubmit() {
    setError(null)
    if (!form.clienteId) {
      setError('Seleccioná un cliente')
      return
    }
    if (items.length === 0) {
      setError('Agregá al menos un producto')
      return
    }

    setIsPending(true)
    try {
      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId: form.clienteId,
          fecha: form.fecha,
          observaciones: form.observaciones.trim() || undefined,
          items: items.map((item) => ({
            productoId: item.productoId,
            cantidad: item.cantidad,
            precioUnitario: parseFloat(item.precioUnitario),
          })),
        }),
      })

      if (!res.ok) {
        const data = await res.json() as { error: string }
        setError(data.error ?? 'Error al crear pedido')
        return
      }

      const json = await res.json() as { data: { id: string; total: string } }
      void queryClient.invalidateQueries({ queryKey: ['pedidos'] })
      void queryClient.invalidateQueries({ queryKey: ['clientes', form.clienteId, 'pedidos'] })
      void queryClient.invalidateQueries({ queryKey: ['clientes', form.clienteId, 'cc'] })
      setSuccessData({ pedidoId: json.data.id, total: json.data.total ?? String(total) })
      setShowSuccess(true)
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <>
      {/* Pantalla de éxito */}
      {showSuccess && successData && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-card md:bg-black/50 md:items-center md:justify-center">
          <div className="flex flex-col h-full md:h-auto md:max-w-sm md:w-full md:bg-card md:rounded-lg md:border md:border-border md:shadow-xl md:overflow-hidden">
            <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4 md:py-8">
              <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="text-green-600" size={40} />
              </div>
              <h2 className="text-2xl font-bold text-center text-foreground">¡Pedido confirmado!</h2>
              <p className="text-3xl font-bold text-primary">
                {formatMoney(parseFloat(successData.total))}
              </p>
              <p className="text-sm text-muted-foreground">
                #{successData.pedidoId.slice(-8).toUpperCase()}
              </p>
            </div>
            <div className="p-4 space-y-2 border-t border-border">
              <button
                onClick={() => {
                  router.push(`/crm/pedidos/${successData.pedidoId}`)
                  onClose()
                }}
                className="w-full py-3.5 md:py-2 border border-border rounded-xl md:rounded-md text-base md:text-sm font-medium text-foreground bg-card active:bg-accent hover:bg-accent transition-colors"
              >
                Ver pedido
              </button>
              <button
                onClick={() => {
                  setShowSuccess(false)
                  setSuccessData(null)
                  setItems([])
                  setForm((prev) => ({ ...prev, observaciones: '' }))
                }}
                className="w-full py-3.5 md:py-2 bg-primary text-primary-foreground rounded-xl md:rounded-md text-base md:text-sm font-semibold active:bg-primary/80 hover:bg-primary/90 transition-colors"
              >
                Nuevo pedido{clienteId ? ' para este cliente' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal principal */}
      <div className="fixed inset-0 z-50 flex flex-col md:bg-black/50 md:items-center md:justify-center">
        <div className="absolute inset-0 hidden md:block" onClick={onClose} />
        <div className="relative flex flex-col h-full w-full bg-card md:h-auto md:max-h-[90vh] md:rounded-lg md:border md:border-border md:shadow-xl md:max-w-2xl md:overflow-hidden">

          {/* Buscador de productos — full-screen mobile, contained in modal on desktop */}
          {showProductSearch && (
            <div className="fixed inset-0 z-[60] flex flex-col bg-background md:absolute md:inset-0 md:z-10">
              <div className="flex items-center gap-3 p-4 border-b border-border">
                <button
                  onClick={() => {
                    setShowProductSearch(false)
                    setProductSearch('')
                  }}
                  className="p-2 -ml-2 text-muted-foreground"
                >
                  <ArrowLeft size={20} className="md:hidden" />
                  <X size={16} className="hidden md:block" />
                </button>
                <input
                  autoFocus
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Buscar producto..."
                  className="flex-1 text-[16px] bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
                />
                {productSearch && (
                  <button
                    onClick={() => setProductSearch('')}
                    className="p-1 text-muted-foreground"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredProducts.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    {productSearch ? 'Sin resultados' : 'No hay productos disponibles'}
                  </div>
                ) : (
                  filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => addProducto(p)}
                      className="w-full flex items-center justify-between p-4 md:py-2.5 border-b border-border text-left active:bg-accent/60 hover:bg-accent/40 transition-colors"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-base md:text-sm font-medium text-foreground">{p.nombre}</span>
                        {p.sku && <span className="text-xs text-muted-foreground font-mono">{p.sku}</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {p.bajoCritico ? (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                            Stock: {p.stockActual}
                          </span>
                        ) : p.stockActual > 0 ? (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-50 text-green-700">
                            Stock: {p.stockActual}
                          </span>
                        ) : null}
                        <span className="text-sm md:text-xs text-muted-foreground">
                          {formatMoney(parseFloat(p.precio))}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Header */}
          <div className="flex items-center gap-3 p-4 border-b border-border shrink-0">
            <button
              onClick={onClose}
              className="md:hidden p-2 -ml-2 text-muted-foreground"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1">
              <h2 className="text-base md:text-sm font-semibold text-foreground">Nuevo Pedido</h2>
              {clienteNombreStr && (
                <p className="text-sm text-muted-foreground">{clienteNombreStr}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="hidden md:block p-1 text-muted-foreground hover:text-foreground"
            >
              <X size={15} />
            </button>
          </div>

          {/* Content scrollable */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* Desktop: selector de cliente y fecha */}
            <div className="hidden md:grid md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Cliente *</label>
                {clienteId ? (
                  <input
                    readOnly
                    value={clienteNombreStr || 'Cliente seleccionado'}
                    className={cn(inputClass, 'bg-muted cursor-not-allowed')}
                  />
                ) : (
                  <select
                    value={form.clienteId}
                    onChange={(e) => setField('clienteId', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Seleccionar cliente...</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} {c.apellido}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Fecha *</label>
                <input
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setField('fecha', e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Mobile: selector de cliente (solo si no hay clienteId fijo) */}
            {!clienteId && (
              <div className="md:hidden">
                <label className="block text-xs text-muted-foreground mb-1">Cliente *</label>
                <select
                  value={form.clienteId}
                  onChange={(e) => setField('clienteId', e.target.value)}
                  className={cn(
                    'w-full px-3 py-2.5 text-[16px] rounded-md border border-border bg-background text-foreground',
                    'focus:outline-none focus:ring-1 focus:ring-ring transition-colors',
                  )}
                >
                  <option value="">Seleccionar cliente...</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} {c.apellido}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Items list */}
            {items.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Package size={40} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No hay productos en el pedido</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item, idx) => {
                  const qty = item.cantidad
                  const price = parseFloat(item.precioUnitario)
                  const subtotal = qty * price
                  return (
                    <div key={idx} className="bg-card border border-border rounded-xl p-4 md:rounded-md md:p-3">
                      <div className="flex items-start justify-between gap-2 mb-3 md:mb-2">
                        <div className="flex-1">
                          <p className="font-semibold text-foreground md:text-sm">{item.productoNombre}</p>
                          <p className="text-sm text-muted-foreground md:text-xs">{formatMoney(price)} c/u</p>
                        </div>
                        <button
                          onClick={() => removeItem(idx)}
                          className="p-2 text-muted-foreground hover:text-destructive active:text-destructive transition-colors -mt-1 -mr-1"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 md:gap-2">
                          <button
                            onClick={() => changeQty(idx, -1)}
                            disabled={qty <= 1}
                            className="w-11 h-11 rounded-full border border-border flex items-center justify-center text-foreground active:bg-accent transition-colors disabled:opacity-40 md:w-8 md:h-8 md:rounded-md"
                          >
                            <Minus size={18} />
                          </button>
                          <span className="w-8 text-center text-lg font-bold text-foreground md:text-base md:w-6">{qty}</span>
                          <button
                            onClick={() => changeQty(idx, 1)}
                            className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:bg-primary/80 transition-colors md:w-8 md:h-8 md:rounded-md"
                          >
                            <Plus size={18} />
                          </button>
                        </div>
                        <p className="text-lg font-bold text-foreground md:text-base">{formatMoney(subtotal)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Boton agregar producto */}
            <button
              onClick={() => setShowProductSearch(true)}
              className="w-full py-4 md:py-3 border-2 border-dashed border-border rounded-xl text-primary font-medium text-base md:text-sm flex items-center justify-center gap-2 active:bg-accent/40 transition-colors"
            >
              <Plus size={20} />
              Agregar producto
            </button>

            {/* Desktop: observaciones */}
            <div className="hidden md:block">
              <label className="block text-xs text-muted-foreground mb-1">Observaciones</label>
              <textarea
                rows={2}
                value={form.observaciones}
                onChange={(e) => setField('observaciones', e.target.value)}
                placeholder="Notas o instrucciones adicionales..."
                className={cn(inputClass, 'resize-none')}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>

          {/* Footer sticky con total */}
          <div className="p-4 border-t border-border bg-card shrink-0">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-2xl font-bold text-foreground">{formatMoney(total)}</span>
            </div>
            <button
              onClick={handleSubmit}
              disabled={isPending || items.length === 0}
              className="w-full py-3.5 md:py-2.5 bg-primary text-primary-foreground rounded-xl md:rounded-lg text-base md:text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Creando...' : 'Confirmar Pedido'}
            </button>
          </div>
        </div>
      </div>

      {/* Toast deshacer eliminacion */}
      {removedItem && (
        <div className="fixed bottom-[80px] md:bottom-6 left-4 right-4 z-[80] bg-foreground text-background rounded-xl p-4 flex items-center justify-between shadow-lg">
          <span className="text-sm">{removedItem.item.productoNombre} eliminado</span>
          <button
            onClick={undoRemove}
            className="text-sm font-semibold underline ml-4 shrink-0"
          >
            Deshacer
          </button>
        </div>
      )}
    </>
  )
}
