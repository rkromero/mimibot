'use client'

import { useState } from 'react'
import { Plus, Minus, Trash2, CheckCircle, Package } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { format, addDays } from 'date-fns'
import RegistrarPagoModal from '@/components/crm/cuenta-corriente/RegistrarPagoModal'
import Stepper from '@/components/shared/Stepper'
import SearchSheet from '@/components/shared/SearchSheet'
import ProductSheet from '@/components/crm/pedidos/ProductSheet'

type Props = {
  clienteId?: string
  onClose: () => void
}

type SelectedItem = {
  productoId: string
  productoNombre: string
  cantidad: number
  precioUnitario: string
}

type ClienteOption = {
  id: string
  nombre: string
  apellido: string
  saldo?: number
  estadoActividad?: string | null
}

type SuccessData = {
  pedidoId: string
  total: string
}

function formatMoney(value: number) {
  return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

export default function CreatePedidoModal({ clienteId, onClose }: Props) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  const [step, setStep] = useState(clienteId ? 1 : 0)
  const [selectedClienteId, setSelectedClienteId] = useState(clienteId ?? '')
  const [items, setItems] = useState<SelectedItem[]>([])
  const [showProductSheet, setShowProductSheet] = useState(false)
  const [showClientSearch, setShowClientSearch] = useState(!clienteId)
  const [showSuccess, setShowSuccess] = useState(false)
  const [successData, setSuccessData] = useState<SuccessData | null>(null)
  const [showCobrar, setShowCobrar] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 3 fields
  const [descuento, setDescuento] = useState(0)
  const [condicionPago, setCondicionPago] = useState<'contado' | '7dias' | '14dias' | '30dias'>('contado')
  const [fechaEntrega, setFechaEntrega] = useState(format(addDays(new Date(), 2), 'yyyy-MM-dd'))
  const [observaciones, setObservaciones] = useState('')

  // Fetch clientes list (for SearchSheet)
  const { data: clientes = [], isLoading: clientesLoading } = useQuery<ClienteOption[]>({
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

  // Get selected cliente details + productos habituales (top compras del cliente)
  type ProductoHabitual = { id: string; nombre: string; precio: string; sku: string | null; totalCantidad: number }
  const { data: clienteData } = useQuery({
    queryKey: ['cliente', selectedClienteId],
    queryFn: async () => {
      const res = await fetch(`/api/clientes/${selectedClienteId}`)
      if (!res.ok) return null
      const json = await res.json() as {
        data: {
          nombre: string
          apellido: string
          saldo?: number
          productosHabituales?: ProductoHabitual[]
        }
      }
      return json.data
    },
    enabled: !!selectedClienteId,
    staleTime: 60_000,
  })

  // Habituales that are not already in the cart — so the chip count stays useful
  const habitualesDisponibles: ProductoHabitual[] = (clienteData?.productosHabituales ?? [])
    .filter(p => !items.some(i => i.productoId === p.id))

  // Computed values
  const subtotal = items.reduce((sum, i) => sum + i.cantidad * parseFloat(i.precioUnitario), 0)
  const descuentoMonto = subtotal * (descuento / 100)
  const total = subtotal - descuentoMonto
  const clienteNombre = clienteData ? `${clienteData.nombre} ${clienteData.apellido}` : ''

  function changeQty(idx: number, delta: number) {
    setItems(prev =>
      prev.map((item, i) => {
        if (i !== idx) return item
        return { ...item, cantidad: Math.max(1, item.cantidad + delta) }
      }),
    )
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit() {
    if (!selectedClienteId || items.length === 0) return
    setIsPending(true)
    setError(null)
    try {
      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId: selectedClienteId,
          fecha: todayStr,
          observaciones: observaciones.trim() || undefined,
          condicionPago,
          fechaEntrega,
          items: items.map(i => ({
            productoId: i.productoId,
            cantidad: i.cantidad,
            precioUnitario: parseFloat(i.precioUnitario),
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
      void queryClient.invalidateQueries({ queryKey: ['clientes', selectedClienteId] })
      setSuccessData({ pedidoId: json.data.id, total: json.data.total ?? String(total) })
      setShowSuccess(true)
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setIsPending(false)
    }
  }

  // ----------------------------------------------------------------
  // SUCCESS SCREEN
  // ----------------------------------------------------------------
  if (showSuccess && successData) {
    return (
      <>
        <div className="fixed inset-0 z-50 flex flex-col bg-card md:bg-black/50 md:items-center md:justify-center">
          <div className="flex flex-col h-full w-full bg-card md:h-auto md:max-h-[90vh] md:rounded-lg md:border md:border-border md:shadow-xl md:max-w-2xl">
            <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
              <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="text-green-600" size={40} />
              </div>
              <h2 className="text-2xl font-bold text-center">¡Pedido confirmado!</h2>
              <p className="text-3xl font-bold text-primary">{formatMoney(parseFloat(successData.total))}</p>
              <p className="text-sm text-muted-foreground">#{successData.pedidoId.slice(-8).toUpperCase()}</p>
            </div>
            <div className="p-4 space-y-3 border-t border-border">
              <button
                onClick={() => setShowCobrar(true)}
                className="w-full py-4 bg-primary text-primary-foreground rounded-xl text-base font-semibold"
              >
                Cobrar ahora
              </button>
              <button
                onClick={() => { router.push(`/crm/pedidos/${successData.pedidoId}`); onClose() }}
                className="w-full py-3.5 border border-border rounded-xl text-base font-medium text-foreground bg-card active:bg-accent"
              >
                Ver pedido
              </button>
              <button
                onClick={() => {
                  setShowSuccess(false)
                  setSuccessData(null)
                  setItems([])
                  setStep(clienteId ? 1 : 0)
                  setDescuento(0)
                  setObservaciones('')
                  setCondicionPago('contado')
                }}
                className="w-full py-2 text-sm text-muted-foreground"
              >
                Nuevo pedido
              </button>
            </div>
          </div>
        </div>

        {showCobrar && (
          <RegistrarPagoModal
            clienteId={selectedClienteId}
            clienteNombre={clienteNombre}
            saldo={parseFloat(successData.total)}
            pedidosPendientes={[{
              id: successData.pedidoId,
              fecha: todayStr,
              saldoPendiente: successData.total,
              estadoPago: 'impago' as const,
            }]}
            onClose={() => setShowCobrar(false)}
            onSuccess={() => { setShowCobrar(false); onClose() }}
          />
        )}
      </>
    )
  }

  // ----------------------------------------------------------------
  // STEPPER FLOW
  // ----------------------------------------------------------------
  return (
    <>
      <div className="fixed inset-0 z-50 flex flex-col bg-card md:bg-black/50 md:items-center md:justify-center">
        <div className="flex flex-col h-full w-full bg-card md:h-auto md:max-h-[90vh] md:rounded-lg md:border md:border-border md:shadow-xl md:max-w-2xl">

          {/* Stepper header */}
          <Stepper
            steps={['Cliente', 'Productos', 'Confirmar']}
            currentStep={step}
            onBack={() => step > 0 ? setStep(s => s - 1) : onClose()}
            onClose={onClose}
          />

          {/* ---- STEP 0: Cliente ---- */}
          {step === 0 && (
            <>
              <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4 text-center">
                <p className="text-sm text-muted-foreground">Seleccioná un cliente para continuar</p>
                {!showClientSearch && (
                  <button
                    onClick={() => setShowClientSearch(true)}
                    className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-semibold"
                  >
                    Buscar cliente
                  </button>
                )}
              </div>

              <SearchSheet
                open={showClientSearch}
                onClose={() => setShowClientSearch(false)}
                items={clientes.map(c => ({
                  id: c.id,
                  label: `${c.nombre} ${c.apellido}`,
                  sublabel: undefined,
                }))}
                onSelect={(id) => {
                  setSelectedClienteId(id)
                  setShowClientSearch(false)
                  setStep(1)
                }}
                isLoading={clientesLoading}
                placeholder="Buscar cliente..."
              />
            </>
          )}

          {/* ---- STEP 1: Productos ---- */}
          {step === 1 && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Productos habituales del cliente — 1 toque para sumar */}
                {habitualesDisponibles.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground px-1">
                      Habituales de este cliente
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {habitualesDisponibles.map(p => (
                        <button
                          key={p.id}
                          onClick={() => setItems(prev => [
                            ...prev,
                            { productoId: p.id, productoNombre: p.nombre, cantidad: 1, precioUnitario: p.precio },
                          ])}
                          className="shrink-0 flex flex-col items-start gap-0.5 px-3 py-2 rounded-xl border border-primary/30 bg-primary/5 active:bg-primary/15 transition-colors min-w-[120px] max-w-[180px]"
                        >
                          <span className="text-sm font-semibold text-foreground truncate w-full text-left">
                            {p.nombre}
                          </span>
                          <span className="text-xs text-primary font-medium">
                            + {formatMoney(parseFloat(p.precio))}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {items.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center gap-3">
                    <Package size={40} className="opacity-30 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {habitualesDisponibles.length > 0
                        ? 'Tocá un habitual o agregá un producto'
                        : 'Aún no agregaste productos'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {items.map((item, idx) => {
                      const qty = item.cantidad
                      const price = parseFloat(item.precioUnitario)
                      const itemSubtotal = qty * price
                      return (
                        <div key={item.productoId} className="bg-card border border-border rounded-xl p-4">
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="flex-1">
                              <p className="font-semibold text-foreground">{item.productoNombre}</p>
                              <p className="text-sm text-muted-foreground">{formatMoney(price)} c/u</p>
                            </div>
                            <button
                              onClick={() => removeItem(idx)}
                              className="p-2 text-muted-foreground hover:text-destructive active:text-destructive transition-colors -mt-1 -mr-1"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => changeQty(idx, -1)}
                                disabled={qty <= 1}
                                className="w-11 h-11 rounded-full border border-border flex items-center justify-center text-foreground active:bg-accent transition-colors disabled:opacity-40"
                              >
                                <Minus size={18} />
                              </button>
                              <span className="w-8 text-center text-lg font-bold text-foreground">{qty}</span>
                              <button
                                onClick={() => changeQty(idx, 1)}
                                className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:bg-primary/80 transition-colors"
                              >
                                <Plus size={18} />
                              </button>
                            </div>
                            <p className="text-lg font-bold text-foreground">{formatMoney(itemSubtotal)}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                <button
                  onClick={() => setShowProductSheet(true)}
                  className="w-full py-4 border-2 border-dashed border-border rounded-xl text-primary font-medium text-base flex items-center justify-center gap-2 active:bg-accent/40 transition-colors"
                >
                  <Plus size={20} />
                  Agregar producto
                </button>
              </div>

              {/* Footer step 1 */}
              <div className="p-4 border-t border-border bg-card shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-muted-foreground">Total</span>
                  <span className="text-2xl font-bold text-foreground">{formatMoney(subtotal)}</span>
                </div>
                <button
                  onClick={() => setStep(2)}
                  disabled={items.length === 0}
                  className="w-full py-4 bg-primary text-primary-foreground rounded-xl text-base font-semibold disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>

              <ProductSheet
                open={showProductSheet}
                onClose={() => setShowProductSheet(false)}
                clienteId={selectedClienteId}
                existingItems={items}
                onConfirm={(newItems) => {
                  setItems(newItems)
                  setShowProductSheet(false)
                }}
              />
            </>
          )}

          {/* ---- STEP 2: Confirmar ---- */}
          {step === 2 && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-5">

                {/* Resumen */}
                <div className="rounded-xl border border-border p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-semibold">Resumen</p>
                    <button onClick={() => setStep(1)} className="text-xs text-primary underline">Editar</button>
                  </div>
                  {items.map(i => (
                    <div key={i.productoId} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{i.productoNombre} ×{i.cantidad}</span>
                      <span>{formatMoney(i.cantidad * parseFloat(i.precioUnitario))}</span>
                    </div>
                  ))}
                </div>

                {/* Descuento */}
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-foreground w-28 shrink-0">Descuento</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max="100"
                      value={descuento === 0 ? '' : descuento}
                      onChange={e => setDescuento(Math.min(100, Math.max(0, Number(e.target.value))))}
                      placeholder="0"
                      className="w-16 text-center text-[16px] border border-border rounded-lg px-2 py-2.5 bg-background"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                    {descuento > 0 && (
                      <span className="text-sm text-destructive">-{formatMoney(descuentoMonto)}</span>
                    )}
                  </div>
                </div>

                {/* Condición de pago */}
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">Condición de pago</p>
                  <div className="flex gap-2 flex-wrap">
                    {(['contado', '7dias', '14dias', '30dias'] as const).map(c => (
                      <button
                        key={c}
                        onClick={() => setCondicionPago(c)}
                        className={cn(
                          'px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors min-h-[44px]',
                          condicionPago === c
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-card border-border text-foreground',
                        )}
                      >
                        {c === 'contado' ? 'Contado' : c === '7dias' ? '7 días' : c === '14dias' ? '14 días' : '30 días'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fecha de entrega */}
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">Fecha de entrega</p>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { label: 'Hoy', days: 0 },
                      { label: 'Mañana', days: 1 },
                      { label: '+2 días', days: 2 },
                    ].map(opt => (
                      <button
                        key={opt.days}
                        onClick={() => setFechaEntrega(format(addDays(new Date(), opt.days), 'yyyy-MM-dd'))}
                        className={cn(
                          'px-4 py-2.5 rounded-xl text-sm font-medium border min-h-[44px] transition-colors',
                          fechaEntrega === format(addDays(new Date(), opt.days), 'yyyy-MM-dd')
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-card border-border text-foreground',
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                    <input
                      type="date"
                      value={fechaEntrega}
                      onChange={e => setFechaEntrega(e.target.value)}
                      className="px-3 py-2.5 rounded-xl border border-border bg-card text-sm min-h-[44px]"
                    />
                  </div>
                </div>

                {/* Observaciones */}
                <textarea
                  rows={2}
                  value={observaciones}
                  onChange={e => setObservaciones(e.target.value)}
                  placeholder="Notas adicionales (opcional)..."
                  className="w-full px-3 py-2.5 text-[16px] rounded-xl border border-border bg-background text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              {/* Sticky footer step 2 */}
              <div className="p-4 border-t border-border bg-card shrink-0">
                {error && <p className="text-sm text-destructive mb-3">{error}</p>}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-muted-foreground">Total</span>
                  <span className="text-2xl font-bold text-foreground">{formatMoney(total)}</span>
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={isPending || items.length === 0}
                  className="w-full py-4 bg-primary text-primary-foreground rounded-xl text-base font-semibold disabled:opacity-50"
                >
                  {isPending ? 'Creando pedido...' : 'Confirmar pedido'}
                </button>
              </div>
            </>
          )}

        </div>
      </div>

      {showCobrar && successData && (
        <RegistrarPagoModal
          clienteId={selectedClienteId}
          clienteNombre={clienteNombre}
          saldo={parseFloat(successData.total)}
          pedidosPendientes={[{
            id: successData.pedidoId,
            fecha: todayStr,
            saldoPendiente: successData.total,
            estadoPago: 'impago' as const,
          }]}
          onClose={() => setShowCobrar(false)}
          onSuccess={() => { setShowCobrar(false); onClose() }}
        />
      )}
    </>
  )
}
