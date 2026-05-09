'use client'

import { useState } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
}

type ItemRow = {
  productoId: string
  cantidad: string
  precioUnitario: string
}

const inputClass = cn(
  'w-full px-3 py-1.5 text-sm rounded-md border',
  'border-border bg-background text-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring',
  'transition-colors duration-100',
)

function formatMoney(value: number) {
  return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

export default function CreatePedidoModal({ clienteId, onClose }: Props) {
  const queryClient = useQueryClient()
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    clienteId: clienteId ?? '',
    fecha: todayStr,
    observaciones: '',
  })
  const [items, setItems] = useState<ItemRow[]>([
    { productoId: '', cantidad: '1', precioUnitario: '' },
  ])

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

  const { data: productos = [] } = useQuery<Producto[]>({
    queryKey: ['productos-activos'],
    queryFn: async () => {
      const res = await fetch('/api/productos?activo=true')
      if (!res.ok) return []
      const json = await res.json() as { data: Producto[] }
      return json.data
    },
    staleTime: 60_000,
  })

  function setField<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleProductoChange(idx: number, productoId: string) {
    const producto = productos.find((p) => p.id === productoId)
    setItems((prev) =>
      prev.map((item, i) =>
        i === idx
          ? { ...item, productoId, precioUnitario: producto?.precio ?? '' }
          : item,
      ),
    )
  }

  function handleItemChange(idx: number, field: keyof ItemRow, value: string) {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
    )
  }

  function addItem() {
    setItems((prev) => [...prev, { productoId: '', cantidad: '1', precioUnitario: '' }])
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const total = items.reduce((sum, item) => {
    const qty = parseFloat(item.cantidad) || 0
    const price = parseFloat(item.precioUnitario) || 0
    return sum + qty * price
  }, 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.clienteId) {
      setError('Seleccioná un cliente')
      return
    }

    const validItems = items.filter((item) => item.productoId && parseFloat(item.cantidad) > 0 && parseFloat(item.precioUnitario) >= 0)
    if (validItems.length === 0) {
      setError('Agregá al menos un item válido')
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
          items: validItems.map((item) => ({
            productoId: item.productoId,
            cantidad: parseInt(item.cantidad),
            precioUnitario: parseFloat(item.precioUnitario),
          })),
        }),
      })

      if (!res.ok) {
        const data = await res.json() as { error: string }
        setError(data.error ?? 'Error al crear pedido')
        return
      }

      void queryClient.invalidateQueries({ queryKey: ['pedidos'] })
      void queryClient.invalidateQueries({ queryKey: ['clientes', form.clienteId, 'pedidos'] })
      void queryClient.invalidateQueries({ queryKey: ['clientes', form.clienteId, 'cc'] })
      onClose()
    } catch {
      setError('Error de conexión')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <button className="absolute inset-0" onClick={onClose} aria-label="Cerrar" />
      <div className="relative bg-card border border-border rounded-lg p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">Nuevo Pedido</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Cliente + Fecha */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Cliente *</label>
              {clienteId ? (
                <input
                  readOnly
                  value={clientes.find((c) => c.id === clienteId)
                    ? `${clientes.find((c) => c.id === clienteId)!.nombre} ${clientes.find((c) => c.id === clienteId)!.apellido}`
                    : 'Cliente seleccionado'
                  }
                  className={cn(inputClass, 'bg-muted cursor-not-allowed')}
                />
              ) : (
                <select
                  required
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
                required
                value={form.fecha}
                onChange={(e) => setField('fecha', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* Observaciones */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Observaciones</label>
            <textarea
              rows={2}
              value={form.observaciones}
              onChange={(e) => setField('observaciones', e.target.value)}
              placeholder="Notas o instrucciones adicionales..."
              className={cn(inputClass, 'resize-none')}
            />
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground">Items</label>
              <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                <Plus size={12} />
                Agregar item
              </button>
            </div>

            <div className="space-y-2">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground px-1">
                <div className="col-span-5">Producto</div>
                <div className="col-span-2">Cantidad</div>
                <div className="col-span-3">Precio unit.</div>
                <div className="col-span-1 text-right">Subt.</div>
                <div className="col-span-1" />
              </div>

              {items.map((item, idx) => {
                const qty = parseFloat(item.cantidad) || 0
                const price = parseFloat(item.precioUnitario) || 0
                const subtotal = qty * price

                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <select
                        value={item.productoId}
                        onChange={(e) => handleProductoChange(idx, e.target.value)}
                        className={inputClass}
                      >
                        <option value="">Seleccionar...</option>
                        {productos.map((p) => (
                          <option key={p.id} value={p.id}>{p.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={item.cantidad}
                        onChange={(e) => handleItemChange(idx, 'cantidad', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div className="col-span-3">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.precioUnitario}
                        onChange={(e) => handleItemChange(idx, 'precioUnitario', e.target.value)}
                        placeholder="0.00"
                        className={inputClass}
                      />
                    </div>
                    <div className="col-span-1 text-right text-xs font-medium text-foreground">
                      {subtotal > 0 ? formatMoney(subtotal) : '—'}
                    </div>
                    <div className="col-span-1 flex justify-end">
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Total */}
            <div className="flex justify-end mt-3 pt-3 border-t border-border">
              <div className="text-sm font-semibold text-foreground">
                Total: {formatMoney(total)}
              </div>
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Creando...' : 'Crear Pedido'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
