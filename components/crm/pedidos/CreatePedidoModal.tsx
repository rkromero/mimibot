'use client'

import { useState, useRef, useEffect } from 'react'
import { Plus, Minus, Trash2, CheckCircle, Package, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { todayStrAR, addDaysStrAR } from '@/lib/dates'
import RegistrarPagoModal from '@/components/crm/cuenta-corriente/RegistrarPagoModal'
import Stepper from '@/components/shared/Stepper'
import ProductSheet from '@/components/crm/pedidos/ProductSheet'
import WhatsappLinkButton from '@/components/shared/WhatsappLinkButton'
import { esRolTipoAgent } from '@/lib/authz/roles'

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
  const todayStr = todayStrAR()

  const [step, setStep] = useState(clienteId ? 1 : 0)
  const [selectedClienteId, setSelectedClienteId] = useState(clienteId ?? '')
  const [items, setItems] = useState<SelectedItem[]>([])
  const [showProductSheet, setShowProductSheet] = useState(false)
  const [clienteQuery, setClienteQuery] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
  const [successData, setSuccessData] = useState<SuccessData | null>(null)
  const [showCobrar, setShowCobrar] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Confirm step fields
  const [descuento, setDescuento] = useState(0)
  const [condicionPago, setCondicionPago] = useState<'contado' | '7dias' | '14dias' | '30dias'>('contado')
  const [fechaEntrega, setFechaEntrega] = useState(addDaysStrAR(2))
  const [observaciones, setObservaciones] = useState('')

  // Delivery method — only for agent role
  const [metodoEntrega, setMetodoEntrega] = useState<'retiro_fabrica' | 'expreso' | null>(null)
  const [usarExpresoGuardado, setUsarExpresoGuardado] = useState<boolean | null>(null)
  const [nuevoExpresoNombre, setNuevoExpresoNombre] = useState('')
  const [nuevoExpresoDireccion, setNuevoExpresoDireccion] = useState('')

  // Debounce the client search input (250 ms) for server-side search
  const [debouncedQuery, setDebouncedQuery] = useState(clienteQuery)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(clienteQuery), 250)
    return () => clearTimeout(t)
  }, [clienteQuery])

  const { data: clientes = [], isLoading: clientesLoading } = useQuery<ClienteOption[]>({
    queryKey: ['clientes-search', debouncedQuery],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('limit', '20')
      params.set('sortBy', 'nombre')
      params.set('sortDir', 'asc')
      if (debouncedQuery.trim()) params.set('search', debouncedQuery.trim())
      const res = await fetch(`/api/clientes?${params.toString()}`)
      if (!res.ok) return []
      const json = await res.json() as { data: ClienteOption[] }
      return json.data
    },
    staleTime: 30_000,
    enabled: !clienteId,
  })

  // Nombre del vendedor logueado para firmar el mensaje de WhatsApp.
  const { data: session } = useSession()
  const vendedorName = session?.user?.name ?? null
  // Solo el rol 'agent' tiene el flujo de método de entrega; 'vendedor' queda congelado
  const isAgent = esRolTipoAgent(session?.user?.role)
  const confirmStep = isAgent ? 3 : 2
  const stepLabels = isAgent
    ? ['Cliente', 'Productos', 'Entrega', 'Confirmar']
    : ['Cliente', 'Productos', 'Confirmar']

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
          telefono?: string | null
          saldo?: number
          productosHabituales?: ProductoHabitual[]
          /** Expreso default guardado en la ficha del cliente */
          expresoNombre?: string | null
          expresoDireccion?: string | null
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
  const subtotal = items.reduce((sum, i) => sum + i.cantidad * (parseFloat(i.precioUnitario) || 0), 0)
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

  function changePrice(idx: number, value: string) {
    setItems(prev => prev.map((item, i) => (i === idx ? { ...item, precioUnitario: value } : item)))
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit() {
    if (!selectedClienteId || items.length === 0) return
    setIsPending(true)
    setError(null)
    try {
      // Build delivery payload — only for agent role
      const deliveryPayload: Record<string, unknown> = {}
      if (isAgent && metodoEntrega) {
        deliveryPayload.metodoEntrega = metodoEntrega
        if (metodoEntrega === 'expreso') {
          // Only send new expreso data if the agent chose to enter one
          const ingresarNuevo = usarExpresoGuardado === false || !clienteData?.expresoNombre
          if (ingresarNuevo) {
            deliveryPayload.expresoNombre = nuevoExpresoNombre.trim()
            deliveryPayload.expresoDireccion = nuevoExpresoDireccion.trim()
          }
          // If usarExpresoGuardado === true: server uses the stored expreso; no extra fields needed
        }
      }

      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId: selectedClienteId,
          fecha: todayStr,
          observaciones: observaciones.trim() || undefined,
          descuento,
          condicionPago,
          fechaEntrega,
          items: items.map(i => {
            const precio = parseFloat(i.precioUnitario)
            return {
              productoId: i.productoId,
              cantidad: i.cantidad,
              // Si el precio quedó vacío/ inválido, se omite y el backend usa el del producto
              ...(Number.isFinite(precio) && precio >= 0 ? { precioUnitario: precio } : {}),
            }
          }),
          ...deliveryPayload,
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
              {/* Enviar comprobante por WhatsApp — el vendedor entrega el resumen
                  apenas confirmado el pedido. Si el cliente no tiene teléfono,
                  el componente muestra el botón en estado deshabilitado. */}
              <WhatsappLinkButton
                clienteId={clienteId}
                phone={clienteData?.telefono ?? null}
                label="Enviar comprobante por WhatsApp"
                variant="subtle"
                className="w-full"
              />
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
                  setMetodoEntrega(null)
                  setUsarExpresoGuardado(null)
                  setNuevoExpresoNombre('')
                  setNuevoExpresoDireccion('')
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
            clienteTelefono={clienteData?.telefono ?? null}
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
            steps={stepLabels}
            currentStep={step}
            onBack={() => step > 0 ? setStep(s => s - 1) : onClose()}
            onClose={onClose}
          />

          {/* ---- STEP 0: Cliente ---- */}
          {step === 0 && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Search input */}
              <div className="px-4 pt-3 pb-2 shrink-0">
                <div className="flex items-center gap-2 border border-border rounded-xl px-3 py-2.5 bg-muted">
                  <Search size={16} className="text-muted-foreground shrink-0" />
                  <input
                    autoFocus
                    value={clienteQuery}
                    onChange={(e) => setClienteQuery(e.target.value)}
                    placeholder="Buscar cliente..."
                    className="flex-1 text-[16px] bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
                    inputMode="search"
                  />
                  {clienteQuery && (
                    <button
                      onClick={() => setClienteQuery('')}
                      className="p-1 text-muted-foreground"
                      aria-label="Limpiar búsqueda"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Client list — results come from server-side search */}
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                {clientesLoading ? (
                  <div className="space-y-2 pt-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="animate-pulse bg-muted h-14 rounded-xl" />
                    ))}
                  </div>
                ) : clientes.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {debouncedQuery.trim()
                      ? 'Sin resultados para la búsqueda'
                      : 'Empezá a escribir para buscar un cliente'}
                  </p>
                ) : (
                  <div className="space-y-0.5 pt-1">
                    {clientes.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setSelectedClienteId(c.id)
                          // Reset delivery state when selecting a new client
                          setMetodoEntrega(null)
                          setUsarExpresoGuardado(null)
                          setNuevoExpresoNombre('')
                          setNuevoExpresoDireccion('')
                          setStep(1)
                        }}
                        className="w-full flex items-center gap-3 p-4 rounded-xl hover:bg-accent active:bg-accent transition-colors min-h-[56px] text-left"
                      >
                        <span className="text-base font-medium text-foreground">
                          {c.nombre} {c.apellido}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
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
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-foreground">{item.productoNombre}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-sm text-muted-foreground">$</span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  step="0.01"
                                  value={item.precioUnitario}
                                  onChange={e => changePrice(idx, e.target.value)}
                                  aria-label="Precio unitario"
                                  className="w-24 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                />
                                <span className="text-sm text-muted-foreground">c/u</span>
                              </div>
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

          {/* ---- STEP 2 (agent only): Entrega ---- */}
          {isAgent && step === 2 && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-5">
                <p className="text-sm font-medium text-foreground">¿Cómo recibe el cliente la mercadería?</p>

                <div className="space-y-3">
                  <button
                    onClick={() => setMetodoEntrega('retiro_fabrica')}
                    className={cn(
                      'w-full p-4 rounded-xl border-2 text-left transition-colors',
                      metodoEntrega === 'retiro_fabrica'
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card',
                    )}
                  >
                    <span className="font-semibold text-foreground">🏭 Retiro en fábrica</span>
                    <p className="text-sm text-muted-foreground mt-0.5">El cliente retira el pedido</p>
                  </button>

                  <button
                    onClick={() => {
                      setMetodoEntrega('expreso')
                      setUsarExpresoGuardado(null)
                    }}
                    className={cn(
                      'w-full p-4 rounded-xl border-2 text-left transition-colors',
                      metodoEntrega === 'expreso'
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card',
                    )}
                  >
                    <span className="font-semibold text-foreground">📦 Envío por expreso</span>
                    <p className="text-sm text-muted-foreground mt-0.5">Se despacha por un transporte al cliente</p>
                  </button>
                </div>

                {metodoEntrega === 'expreso' && (
                  <div className="space-y-4">
                    {/* Cliente con expreso guardado */}
                    {clienteData?.expresoNombre ? (
                      <div className="space-y-3">
                        <p className="text-sm text-foreground">
                          Este cliente ya recibió envíos por{' '}
                          <span className="font-semibold">{clienteData.expresoNombre}</span>.{' '}
                          ¿Despachar por el mismo?
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setUsarExpresoGuardado(true)}
                            className={cn(
                              'flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-colors',
                              usarExpresoGuardado === true
                                ? 'border-primary bg-primary/5 text-foreground'
                                : 'border-border bg-card text-foreground',
                            )}
                          >
                            Sí, mismo expreso
                          </button>
                          <button
                            onClick={() => setUsarExpresoGuardado(false)}
                            className={cn(
                              'flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-colors',
                              usarExpresoGuardado === false
                                ? 'border-primary bg-primary/5 text-foreground'
                                : 'border-border bg-card text-foreground',
                            )}
                          >
                            No, cargar uno nuevo
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {/* Formulario de nuevo expreso */}
                    {(!clienteData?.expresoNombre || usarExpresoGuardado === false) && (
                      <div className="space-y-3">
                        <div>
                          <label className="text-sm font-medium text-foreground mb-1 block">
                            Nombre del expreso
                          </label>
                          <input
                            type="text"
                            value={nuevoExpresoNombre}
                            onChange={e => setNuevoExpresoNombre(e.target.value)}
                            placeholder="Ej: Andreani, OCA, Correo Argentino..."
                            className="w-full px-3 py-2.5 text-[16px] rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-foreground mb-1 block">
                            Dirección del expreso (dónde despachar)
                          </label>
                          <input
                            type="text"
                            value={nuevoExpresoDireccion}
                            onChange={e => setNuevoExpresoDireccion(e.target.value)}
                            placeholder="Dirección del transporte para despacho"
                            className="w-full px-3 py-2.5 text-[16px] rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer step 2 (entrega) */}
              <div className="p-4 border-t border-border bg-card shrink-0">
                {(() => {
                  let canAdvance = false
                  if (metodoEntrega === 'retiro_fabrica') {
                    canAdvance = true
                  } else if (metodoEntrega === 'expreso') {
                    if (clienteData?.expresoNombre && usarExpresoGuardado === true) {
                      canAdvance = true
                    } else if (!clienteData?.expresoNombre || usarExpresoGuardado === false) {
                      canAdvance = nuevoExpresoNombre.trim().length > 0 && nuevoExpresoDireccion.trim().length > 0
                    }
                  }
                  return (
                    <button
                      onClick={() => setStep(3)}
                      disabled={!canAdvance}
                      className="w-full py-4 bg-primary text-primary-foreground rounded-xl text-base font-semibold disabled:opacity-50"
                    >
                      Siguiente
                    </button>
                  )
                })()}
              </div>
            </>
          )}

          {/* ---- CONFIRM STEP: step 2 for non-agent, step 3 for agent ---- */}
          {step === confirmStep && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-5">

                {/* Resumen */}
                <div className="rounded-xl border border-border p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-semibold">Resumen</p>
                    <button onClick={() => setStep(1)} className="text-xs text-primary underline">Editar</button>
                  </div>
                  {items.map((i, idx) => (
                    <div key={i.productoId} className="flex justify-between items-center gap-2 text-sm">
                      <span className="text-muted-foreground truncate flex-1 min-w-0">{i.productoNombre} ×{i.cantidad}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-muted-foreground text-xs">$</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          value={i.precioUnitario}
                          onChange={e => changePrice(idx, e.target.value)}
                          aria-label={`Precio unitario de ${i.productoNombre}`}
                          className="w-20 text-right text-sm rounded-md border border-border px-1.5 py-0.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <span className="w-20 text-right tabular-nums">{formatMoney(i.cantidad * (parseFloat(i.precioUnitario) || 0))}</span>
                      </div>
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
                        onClick={() => setFechaEntrega(addDaysStrAR(opt.days))}
                        className={cn(
                          'px-4 py-2.5 rounded-xl text-sm font-medium border min-h-[44px] transition-colors',
                          fechaEntrega === addDaysStrAR(opt.days)
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
          clienteTelefono={clienteData?.telefono ?? null}
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
