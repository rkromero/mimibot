'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle, Truck, XCircle, FileText, Download } from 'lucide-react'
import EntregaProofModal from './EntregaProofModal'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { useToast } from '@/components/shared/ToastProvider'

type Props = { id: string }

type PedidoItem = {
  id: string
  cantidad: number
  precioUnitario: string
  subtotal: string
  producto: { id: string; nombre: string; sku?: string | null }
}

type AplicacionPago = {
  id: string
  createdAt: string
  montoAplicado: string
  movimientoCreditoId: string
  deletedAt: string | null
}

type Pedido = {
  id: string
  clienteId: string
  clienteNombre: string
  clienteApellido: string
  vendedorNombre: string | null
  fecha: string
  estado: 'pendiente' | 'confirmado' | 'entregado' | 'cancelado'
  observaciones: string | null
  total: string
  montoPagado: string
  saldoPendiente: string
  estadoPago: 'impago' | 'parcial' | 'pagado'
  items: PedidoItem[]
  aplicaciones: AplicacionPago[]
}

const estadoColors: Record<string, string> = {
  pendiente: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  confirmado: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  entregado: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  cancelado: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}

const estadoPagoColors: Record<string, string> = {
  impago: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  parcial: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  pagado: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
}

const estadoLabels: Record<string, string> = {
  pendiente: 'Pendiente',
  confirmado: 'Confirmado',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}

const estadoPagoLabels: Record<string, string> = {
  impago: 'Impago',
  parcial: 'Parcial',
  pagado: 'Pagado',
}

function formatMoney(value: string | number) {
  return `$${parseFloat(String(value)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

export default function PedidoDetail({ id }: Props) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [showProof, setShowProof] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [generatingDoc, setGeneratingDoc] = useState<'remito' | 'proforma' | null>(null)

  async function handleGenerarDocumento(tipo: 'remito' | 'proforma') {
    setGeneratingDoc(tipo)
    try {
      const res = await fetch(`/api/pedidos/${id}/documentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo }),
      })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        setActionError(data.error ?? 'Error al generar documento')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename="([^"]+)"/)
      a.download = match?.[1] ?? `${tipo}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setActionError('Error de conexión al generar documento')
    } finally {
      setGeneratingDoc(null)
    }
  }

  const { data: pedido, isLoading, isError } = useQuery<Pedido>({
    queryKey: ['pedido', id],
    queryFn: async () => {
      const res = await fetch(`/api/pedidos/${id}`)
      if (!res.ok) throw new Error('Error al cargar pedido')
      const json = await res.json() as { data: Pedido }
      return json.data
    },
    staleTime: 30_000,
  })

  const { mutate: updateEstado, isPending: isUpdating } = useMutation({
    mutationFn: async (estado: string) => {
      const res = await fetch(`/api/pedidos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        throw new Error(data.error ?? 'Error al actualizar')
      }
      return res.json()
    },
    onSuccess: (_data, estado) => {
      setActionError(null)
      setConfirmCancel(false)
      setShowProof(false)
      void queryClient.invalidateQueries({ queryKey: ['pedido', id] })
      void queryClient.invalidateQueries({ queryKey: ['pedidos'] })
      if (pedido) {
        void queryClient.invalidateQueries({ queryKey: ['clientes', pedido.clienteId, 'pedidos'] })
        void queryClient.invalidateQueries({ queryKey: ['clientes', pedido.clienteId, 'cc'] })
      }
      if (estado === 'confirmado') {
        void queryClient.invalidateQueries({ queryKey: ['stock-saldos'] })
        toast.success('Pedido confirmado')
      } else if (estado === 'entregado') {
        toast.success('Entrega registrada')
      } else if (estado === 'cancelado') {
        toast.warning('Pedido cancelado')
      }
    },
    onError: (err: Error) => {
      setActionError(err.message)
      toast.error(err.message)
    },
  })

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-sm text-muted-foreground">Cargando pedido...</div>
      </div>
    )
  }

  if (isError || !pedido) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-sm text-destructive">Error al cargar el pedido.</div>
      </div>
    )
  }

  const displayTotal = pedido.estado === 'pendiente'
    ? pedido.items.reduce((sum, item) => sum + parseFloat(item.subtotal), 0).toFixed(2)
    : pedido.total

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/crm/pedidos" className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-foreground">
              Pedido #{id.slice(-8).toUpperCase()}
            </h1>
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', estadoColors[pedido.estado])}>
              {estadoLabels[pedido.estado]}
            </span>
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', estadoPagoColors[pedido.estadoPago])}>
              {estadoPagoLabels[pedido.estadoPago]}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {format(new Date(pedido.fecha), 'dd/MM/yyyy')} — Vendedor: {pedido.vendedorNombre ?? '—'}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {pedido.estado === 'pendiente' && (
            <>
              <button
                onClick={() => updateEstado('confirmado')}
                disabled={isUpdating}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <CheckCircle size={14} />
                Confirmar
              </button>
              {!confirmCancel ? (
                <button
                  onClick={() => setConfirmCancel(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent transition-colors"
                >
                  <XCircle size={14} />
                  Cancelar
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">¿Confirmar cancelación?</span>
                  <button
                    onClick={() => updateEstado('cancelado')}
                    disabled={isUpdating}
                    className="px-2 py-1 text-xs bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 transition-colors disabled:opacity-50"
                  >
                    Sí, cancelar
                  </button>
                  <button
                    onClick={() => setConfirmCancel(false)}
                    className="px-2 py-1 text-xs border border-border rounded hover:bg-accent transition-colors"
                  >
                    No
                  </button>
                </div>
              )}
            </>
          )}
          {pedido.estado === 'confirmado' && (
            <button
              onClick={() => setShowProof(true)}
              disabled={isUpdating}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Truck size={14} />
              Marcar Entregado
            </button>
          )}
          {(pedido.estado === 'confirmado' || pedido.estado === 'entregado') && (
            <>
              <button
                onClick={() => void handleGenerarDocumento('remito')}
                disabled={!!generatingDoc}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent transition-colors disabled:opacity-50"
                title="Descargar remito PDF"
              >
                <FileText size={14} />
                {generatingDoc === 'remito' ? 'Generando...' : 'Remito'}
              </button>
              <button
                onClick={() => void handleGenerarDocumento('proforma')}
                disabled={!!generatingDoc}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent transition-colors disabled:opacity-50"
                title="Descargar proforma PDF"
              >
                <Download size={14} />
                {generatingDoc === 'proforma' ? 'Generando...' : 'Proforma'}
              </button>
            </>
          )}
        </div>
      </div>

      {actionError && (
        <div className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">{actionError}</div>
      )}

      {/* Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-4 space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Información</h3>
          <div className="flex gap-2 text-sm">
            <span className="text-muted-foreground w-24 shrink-0">Cliente:</span>
            <Link href={`/crm/clientes/${pedido.clienteId}`} className="text-primary hover:underline">
              {pedido.clienteNombre} {pedido.clienteApellido}
            </Link>
          </div>
          <div className="flex gap-2 text-sm">
            <span className="text-muted-foreground w-24 shrink-0">Fecha:</span>
            <span>{format(new Date(pedido.fecha), 'dd/MM/yyyy')}</span>
          </div>
          {pedido.observaciones && (
            <div className="flex gap-2 text-sm">
              <span className="text-muted-foreground w-24 shrink-0">Notas:</span>
              <span className="text-foreground">{pedido.observaciones}</span>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg p-4 space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Resumen Financiero</h3>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-medium">{formatMoney(displayTotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Pagado</span>
            <span className="text-green-600 font-medium">{formatMoney(pedido.montoPagado)}</span>
          </div>
          <div className="flex justify-between text-sm border-t border-border pt-2 mt-2">
            <span className="text-muted-foreground">Saldo pendiente</span>
            <span className={cn('font-semibold', parseFloat(pedido.saldoPendiente) > 0 ? 'text-red-600' : 'text-green-600')}>
              {formatMoney(pedido.saldoPendiente)}
            </span>
          </div>
        </div>
      </div>

      {/* Items */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Items del Pedido</h3>
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Producto</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium border-b border-border">Cantidad</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium border-b border-border">Precio Unit.</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium border-b border-border">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {pedido.items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="py-2.5 px-3 text-foreground">
                    {item.producto?.nombre ?? '—'}
                    {item.producto?.sku && (
                      <span className="block text-xs text-muted-foreground font-mono">{item.producto.sku}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right text-muted-foreground">{item.cantidad}</td>
                  <td className="py-2.5 px-3 text-right text-muted-foreground">{formatMoney(item.precioUnitario)}</td>
                  <td className="py-2.5 px-3 text-right font-medium">{formatMoney(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="py-2.5 px-3 text-right text-sm font-semibold text-muted-foreground border-t border-border">
                  Total
                </td>
                <td className="py-2.5 px-3 text-right font-bold text-foreground border-t border-border">
                  {formatMoney(displayTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {showProof && (
        <EntregaProofModal
          onConfirm={() => {
            updateEstado('entregado')
            setShowProof(false)
          }}
          onClose={() => setShowProof(false)}
          isLoading={isUpdating}
        />
      )}

      {/* Pagos aplicados */}
      {pedido.aplicaciones.filter(ap => !ap.deletedAt).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Pagos Aplicados</h3>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Fecha</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-medium border-b border-border">Monto aplicado</th>
                </tr>
              </thead>
              <tbody>
                {pedido.aplicaciones.filter(ap => !ap.deletedAt).map((ap) => (
                  <tr key={ap.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 px-3 text-muted-foreground">
                      {format(new Date(ap.createdAt), 'dd/MM/yyyy')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-green-600">
                      {formatMoney(ap.montoAplicado)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
