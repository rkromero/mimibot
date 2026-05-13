'use client'

import { useState, useRef, useEffect } from 'react'
import { ArrowLeft, X, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { format } from 'date-fns'
import WhatsappLinkButton from '@/components/shared/WhatsappLinkButton'
import { cobroConfirmadoMessage } from '@/lib/whatsapp/messages'

type Props = {
  clienteId: string
  clienteNombre: string
  /** Teléfono del cliente para el botón de WhatsApp. Opcional — si no viene,
   *  el botón se muestra deshabilitado con tooltip explicativo. */
  clienteTelefono?: string | null
  saldo: number
  pedidosPendientes: Array<{
    id: string
    fecha: string
    saldoPendiente: string
    estadoPago: 'impago' | 'parcial'
  }>
  onClose: () => void
  onSuccess: (result: PagoResult) => void
}

type PagoResult = {
  aplicaciones: Array<{
    pedidoId: string
    montoAplicado: string
  }>
  sobrante: string
}

type SuccessData = {
  monto: number
  result: PagoResult
}

function formatMoney(value: string | number) {
  return `$${parseFloat(String(value)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

export default function RegistrarPagoModal({ clienteId, clienteNombre, clienteTelefono, saldo, pedidosPendientes, onClose, onSuccess }: Props) {
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const vendedorName = session?.user?.name ?? null
  const inputRef = useRef<HTMLInputElement>(null)

  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showNota, setShowNota] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [successData, setSuccessData] = useState<SuccessData | null>(null)
  const [form, setForm] = useState({
    monto: '',
    descripcion: '',
  })

  // Autofocus al abrir
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(timer)
  }, [])

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  // Quick chips
  const saldoStr = saldo.toFixed(2)
  const quickAmounts = [
    { label: 'Saldar todo', value: saldoStr },
    ...(saldo > 5000 ? [{ label: '$5.000', value: '5000' }] : []),
    ...(saldo > 2000 ? [{ label: '$2.000', value: '2000' }] : []),
    ...(saldo > 1000 ? [{ label: '$1.000', value: '1000' }] : []),
  ].filter((v, i, arr) => arr.findIndex(a => a.value === v.value) === i)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const monto = parseFloat(form.monto)
    if (!form.monto || isNaN(monto) || monto <= 0) {
      setError('El monto debe ser mayor a 0')
      return
    }

    setIsPending(true)
    try {
      const todayStr = new Date().toISOString().split('T')[0]
      const res = await fetch(`/api/clientes/${clienteId}/cuenta-corriente`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monto: form.monto,
          fecha: todayStr,
          descripcion: form.descripcion.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json() as { error: string }
        setError(data.error ?? 'Error al registrar el pago')
        return
      }

      const json = await res.json() as { data: { distribucion: PagoResult } }

      void queryClient.invalidateQueries({ queryKey: ['clientes', clienteId, 'cc'] })
      void queryClient.invalidateQueries({ queryKey: ['clientes', clienteId, 'pedidos'] })
      void queryClient.invalidateQueries({ queryKey: ['clientes'] })

      setSuccessData({ monto, result: json.data.distribucion })
      setShowSuccess(true)
    } catch {
      setError('Error de conexión. Intentá de nuevo.')
    } finally {
      setIsPending(false)
    }
  }

  function handleSuccessClose() {
    if (successData) onSuccess(successData.result)
    onClose()
  }

  const montoNum = parseFloat(form.monto) || 0

  return (
    <div className="fixed inset-0 z-50 flex flex-col md:bg-black/50 md:items-center md:justify-center">
      <div className="absolute inset-0 hidden md:block" onClick={onClose} />

      <div className="relative flex flex-col h-full w-full bg-card md:h-auto md:max-h-[90vh] md:rounded-lg md:border md:border-border md:shadow-xl md:max-w-lg overflow-hidden">

        {/* Pantalla de éxito (overlay dentro del panel) */}
        {showSuccess && successData && (
          <div className="absolute inset-0 z-10 flex flex-col bg-card md:rounded-lg">
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle className="text-green-600 dark:text-green-400" size={40} />
                </div>
                <h2 className="text-2xl font-bold text-center text-foreground">Pago registrado</h2>
                <p className="text-3xl font-bold text-primary">{formatMoney(successData.monto)}</p>
                <p className="text-sm text-muted-foreground">{clienteNombre}</p>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Aplicación del pago</h3>
                {successData.result.aplicaciones.map((ap) => {
                  const pedido = pedidosPendientes.find(p => p.id === ap.pedidoId)
                  const montoAp = parseFloat(ap.montoAplicado)
                  return (
                    <div key={ap.pedidoId} className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Pedido {pedido ? format(new Date(pedido.fecha), 'dd/MM/yy') : ap.pedidoId.slice(-6)}
                        </p>
                        <p className="text-xs text-green-600 dark:text-green-400">Aplicado</p>
                      </div>
                      <p className="text-base font-bold text-green-700 dark:text-green-400">{formatMoney(montoAp)}</p>
                    </div>
                  )
                })}
                {parseFloat(successData.result.sobrante) > 0 && (
                  <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-foreground">Saldo a favor</p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">Crédito disponible</p>
                    </div>
                    <p className="text-base font-bold text-blue-700 dark:text-blue-400">{formatMoney(successData.result.sobrante)}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-border bg-card shrink-0 space-y-3">
              {/* Saldo restante = saldo previo - lo aplicado a pedidos (no cuenta
                  el sobrante porque eso es crédito a favor del cliente). */}
              {(() => {
                const aplicado = successData.result.aplicaciones.reduce(
                  (sum, ap) => sum + parseFloat(ap.montoAplicado),
                  0,
                )
                const saldoRestante = Math.max(0, saldo - aplicado)
                return (
                  <WhatsappLinkButton
                    phone={clienteTelefono ?? null}
                    label="Enviar comprobante por WhatsApp"
                    variant="subtle"
                    className="w-full"
                    message={cobroConfirmadoMessage({
                      clienteNombre,
                      vendedorName,
                      monto: successData.monto,
                      saldoRestante,
                      fecha: new Date(),
                    })}
                  />
                )
              })()}
              <button onClick={handleSuccessClose}
                className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl text-base font-semibold active:bg-primary/80 transition-colors">
                Volver al cliente
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-border shrink-0">
          <button onClick={onClose} className="md:hidden p-2 -ml-2 text-muted-foreground">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h2 className="text-base md:text-sm font-semibold text-foreground">Registrar Pago</h2>
            <p className="text-sm text-muted-foreground">{clienteNombre}</p>
          </div>
          <button onClick={onClose} className="hidden md:block p-1 text-muted-foreground hover:text-foreground transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 md:flex-none overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-5">

            {/* Saldo prominente */}
            {saldo > 0 && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl p-4">
                <p className="text-xs text-red-600 dark:text-red-400 mb-1">Saldo adeudado</p>
                <p className="text-3xl font-bold text-red-700 dark:text-red-400">{formatMoney(saldo)}</p>
              </div>
            )}

            {/* Pedidos pendientes (informativo) */}
            {pedidosPendientes.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pedidos con deuda</p>
                <div className="space-y-1.5">
                  {pedidosPendientes.slice(0, 4).map(p => (
                    <div key={p.id} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{format(new Date(p.fecha), 'dd/MM/yy')}</span>
                      <div className="flex items-center gap-2">
                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                          p.estadoPago === 'impago'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                            : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                        )}>
                          {p.estadoPago === 'impago' ? 'Impago' : 'Parcial'}
                        </span>
                        <span className="font-medium text-foreground">{formatMoney(p.saldoPendiente)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Input monto */}
            <div>
              <label className="block text-sm md:text-xs text-muted-foreground mb-2">Monto del pago *</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-muted-foreground">$</span>
                <input
                  ref={inputRef}
                  inputMode="decimal"
                  value={form.monto}
                  onChange={e => set('monto', e.target.value)}
                  placeholder="0,00"
                  className="w-full pl-10 pr-4 py-4 md:py-2.5 text-2xl md:text-lg font-bold text-foreground bg-background border border-border rounded-xl md:rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>
            </div>

            {/* Quick chips */}
            {quickAmounts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {quickAmounts.map(chip => (
                  <button
                    key={chip.value}
                    type="button"
                    onClick={() => set('monto', chip.value)}
                    className={cn(
                      'px-4 py-2 rounded-full text-sm font-medium border transition-colors',
                      form.monto === chip.value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border text-foreground bg-card active:bg-accent',
                    )}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}

            {/* Nota opcional (colapsable) */}
            {!showNota ? (
              <button type="button" onClick={() => setShowNota(true)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                <span>+</span> Agregar nota
              </button>
            ) : (
              <div>
                <label className="block text-sm md:text-xs text-muted-foreground mb-1.5">Nota (opcional)</label>
                <textarea
                  autoFocus
                  rows={2}
                  value={form.descripcion}
                  onChange={e => set('descripcion', e.target.value)}
                  placeholder="Ej: Transferencia bancaria, efectivo..."
                  className="w-full px-3 py-3 md:py-1.5 text-[16px] md:text-sm rounded-xl md:rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
            )}
          </div>

          {/* Footer sticky */}
          <div className="p-4 border-t border-border bg-card shrink-0">
            {montoNum > 0 && (
              <p className="text-center text-sm text-muted-foreground mb-3">
                Confirmando pago de <span className="font-semibold text-foreground">{formatMoney(montoNum)}</span>
              </p>
            )}
            <button type="submit" disabled={isPending || !form.monto}
              className="w-full py-3.5 md:py-2.5 bg-primary text-primary-foreground rounded-xl md:rounded-lg text-base md:text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
              {isPending ? 'Registrando...' : 'Confirmar Pago'}
            </button>
            <button type="button" onClick={onClose}
              className="hidden md:block w-full mt-2 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
