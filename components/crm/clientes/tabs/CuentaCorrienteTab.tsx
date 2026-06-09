'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { formatFechaAR } from '@/lib/dates'
import Link from 'next/link'
import { Trash2 } from 'lucide-react'
import RegistrarPagoModal from '@/components/crm/cuenta-corriente/RegistrarPagoModal'
import ConfirmDeleteModal from '@/components/shared/ConfirmDeleteModal'

type Props = {
  clienteId: string
  clienteNombre: string
  clienteTelefono?: string | null
  showPago: boolean
  onClosePago: () => void
}

type Movimiento = {
  id: string
  tipo: 'debito' | 'credito'
  monto: string
  fecha: string
  descripcion: string | null
  pedidoId: string | null
  metodoPago: 'efectivo' | 'transferencia' | 'mercadopago' | null
}

type PedidoCC = {
  id: string
  fecha: string
  total: string
  montoPagado: string
  saldoPendiente: string
  estadoPago: 'impago' | 'parcial' | 'pagado'
}

type CuentaCorrienteData = {
  saldo: number
  saldoLabel: string
  movimientos: Movimiento[]
  movimientosTotal: number
  movimientosTotalPages: number
  movimientosPage: number
  movimientosLimit: number
  pedidos: PedidoCC[]
}

function formatMoney(value: string | number) {
  return `$${parseFloat(String(value)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

const metodoPagoLabels: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  mercadopago: 'QR / MP',
}
const metodoPagoColors: Record<string, string> = {
  efectivo: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  transferencia: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  mercadopago: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
}

const estadoPagoColors: Record<string, string> = {
  impago: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  parcial: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  pagado: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
}
const estadoPagoLabels: Record<string, string> = {
  impago: 'Impago',
  parcial: 'Parcial',
  pagado: 'Pagado',
}

export default function CuentaCorrienteTab({ clienteId, clienteNombre, clienteTelefono, showPago, onClosePago }: Props) {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const queryClient = useQueryClient()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleDeleteMovimiento() {
    if (!pendingDeleteId) return
    setDeleteError(null)
    setDeletingId(pendingDeleteId)
    try {
      const res = await fetch(`/api/clientes/${clienteId}/cuenta-corriente/${pendingDeleteId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const json = await res.json() as { error: string }
        setDeleteError(json.error ?? 'Error al eliminar')
        return
      }
      await queryClient.invalidateQueries({ queryKey: ['clientes', clienteId, 'cc'] })
      setPendingDeleteId(null)
    } catch {
      setDeleteError('Error de conexión')
    } finally {
      setDeletingId(null)
    }
  }

  const [ccPage, setCcPage] = useState(1)
  const ccLimit = 50

  const { data, isLoading, isError } = useQuery<CuentaCorrienteData>({
    queryKey: ['clientes', clienteId, 'cc', ccPage],
    queryFn: async () => {
      const res = await fetch(`/api/clientes/${clienteId}/cuenta-corriente?page=${ccPage}&limit=${ccLimit}`)
      if (!res.ok) throw new Error('Error al cargar cuenta corriente')
      const json = await res.json() as { data: CuentaCorrienteData }
      return json.data
    },
    staleTime: 30_000,
  })

  if (isLoading) {
    return <div className="text-sm text-muted-foreground p-2">Cargando cuenta corriente...</div>
  }
  if (isError || !data) {
    return <div className="text-sm text-destructive p-2">Error al cargar cuenta corriente</div>
  }

  const saldo = data.saldo
  const saldoPositivo = saldo > 0

  const pedidosPendientes = data.pedidos
    .filter(p => p.estadoPago !== 'pagado' && parseFloat(p.saldoPendiente) > 0)
    .map(p => ({
      id: p.id,
      fecha: p.fecha,
      saldoPendiente: p.saldoPendiente,
      estadoPago: p.estadoPago as 'impago' | 'parcial',
    }))

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-foreground">Cuenta Corriente</h2>

      {/* Saldo */}
      <div className="bg-card border border-border rounded-lg p-4">
        <p className="text-xs text-muted-foreground mb-1">
          {saldoPositivo ? 'Saldo deudor' : saldo < 0 ? 'Saldo a favor' : 'Saldo'}
        </p>
        <p className={cn('text-3xl font-bold', saldoPositivo ? 'text-red-600' : saldo < 0 ? 'text-green-600' : 'text-foreground')}>
          {formatMoney(Math.abs(saldo))}
        </p>
      </div>

      {/* Movimientos */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Movimientos</h3>
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {data.movimientos.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">Sin movimientos</div>
          ) : (
            <>
              {/* Mobile: lista de movimientos */}
              <div className="md:hidden">
                {data.movimientos.map(m => (
                  <div key={m.id} className="flex items-start justify-between p-3 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm text-muted-foreground">{formatFechaAR(m.fecha, true)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{m.descripcion ?? (m.tipo === 'credito' ? 'Pago recibido' : 'Pedido')}</p>
                      {m.tipo === 'credito' && m.metodoPago && (
                        <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium mt-1 inline-block', metodoPagoColors[m.metodoPago])}>
                          {metodoPagoLabels[m.metodoPago]}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn('text-base font-semibold', m.tipo === 'credito' ? 'text-green-600' : 'text-red-600')}>
                        {m.tipo === 'credito' ? '+' : '-'}{formatMoney(m.monto)}
                      </span>
                      {isAdmin && m.tipo === 'credito' && (
                        <button
                          onClick={() => { setDeleteError(null); setPendingDeleteId(m.id) }}
                          disabled={deletingId === m.id}
                          className="p-1 text-muted-foreground hover:text-red-600 disabled:opacity-50 transition-colors"
                          title="Eliminar pago"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop: tabla */}
              <div className="hidden md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Fecha</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Tipo</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Descripción</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Método</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium border-b border-border">Monto</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Pedido</th>
                      {isAdmin && <th className="py-2 px-3 border-b border-border" />}
                    </tr>
                  </thead>
                  <tbody>
                    {data.movimientos.map((m) => (
                      <tr key={m.id} className="border-b border-border last:border-0">
                        <td className="py-2.5 px-3 text-muted-foreground">{formatFechaAR(m.fecha)}</td>
                        <td className="py-2.5 px-3">
                          <span className={cn(
                            'px-2 py-0.5 rounded-full text-xs font-medium',
                            m.tipo === 'credito'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
                          )}>
                            {m.tipo === 'credito' ? 'Crédito' : 'Débito'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground">{m.descripcion ?? '—'}</td>
                        <td className="py-2.5 px-3">
                          {m.tipo === 'credito' && m.metodoPago ? (
                            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', metodoPagoColors[m.metodoPago])}>
                              {metodoPagoLabels[m.metodoPago]}
                            </span>
                          ) : '—'}
                        </td>
                        <td className={cn('py-2.5 px-3 text-right font-medium', m.tipo === 'credito' ? 'text-green-600' : 'text-red-600')}>
                          {m.tipo === 'credito' ? '+' : '-'}{formatMoney(m.monto)}
                        </td>
                        <td className="py-2.5 px-3">
                          {m.pedidoId ? (
                            <Link href={`/crm/pedidos/${m.pedidoId}`} className="text-primary hover:underline text-xs">
                              #{m.pedidoId.slice(-6)}
                            </Link>
                          ) : '—'}
                        </td>
                        {isAdmin && (
                          <td className="py-2.5 px-3 text-center">
                            {m.tipo === 'credito' && (
                              <button
                                onClick={() => { setDeleteError(null); setPendingDeleteId(m.id) }}
                                disabled={deletingId === m.id}
                                className="p-1 text-muted-foreground hover:text-red-600 disabled:opacity-50 transition-colors"
                                title="Eliminar pago"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        {/* Pagination for movimientos */}
        {(data.movimientosTotal ?? 0) > ccLimit && (
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <span>
              {((ccPage - 1) * ccLimit + 1)}–{Math.min(ccPage * ccLimit, data.movimientosTotal)} de {data.movimientosTotal}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={ccPage <= 1}
                onClick={() => setCcPage((p) => p - 1)}
                className="px-2 py-1 rounded border border-border disabled:opacity-40"
              >
                &#8592;
              </button>
              <span>{ccPage} / {data.movimientosTotalPages}</span>
              <button
                disabled={ccPage >= data.movimientosTotalPages}
                onClick={() => setCcPage((p) => p + 1)}
                className="px-2 py-1 rounded border border-border disabled:opacity-40"
              >
                &#8594;
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pedidos */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Pedidos</h3>
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {data.pedidos.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">Sin pedidos</div>
          ) : (
            <>
              {/* Mobile: lista de pedidos */}
              <div className="md:hidden">
                {data.pedidos.map(p => (
                  <Link key={p.id} href={`/crm/pedidos/${p.id}`}
                    className="flex items-center justify-between p-3 border-b border-border last:border-0 active:bg-accent/50">
                    <div>
                      <p className="text-sm text-foreground">{formatFechaAR(p.fecha, true)}</p>
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', estadoPagoColors[p.estadoPago])}>
                        {estadoPagoLabels[p.estadoPago]}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">{formatMoney(p.total)}</p>
                      {parseFloat(p.saldoPendiente) > 0 && (
                        <p className="text-xs text-red-600">Saldo: {formatMoney(p.saldoPendiente)}</p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
              {/* Desktop: tabla */}
              <div className="hidden md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Fecha</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium border-b border-border">Total</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium border-b border-border">Pagado</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium border-b border-border">Saldo</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pedidos.map((p) => (
                      <tr key={p.id} className="border-b border-border last:border-0">
                        <td className="py-2.5 px-3">
                          <Link href={`/crm/pedidos/${p.id}`} className="text-primary hover:underline">
                            {formatFechaAR(p.fecha)}
                          </Link>
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium">{formatMoney(p.total)}</td>
                        <td className="py-2.5 px-3 text-right text-muted-foreground">{formatMoney(p.montoPagado)}</td>
                        <td className="py-2.5 px-3 text-right text-muted-foreground">{formatMoney(p.saldoPendiente)}</td>
                        <td className="py-2.5 px-3">
                          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', estadoPagoColors[p.estadoPago])}>
                            {estadoPagoLabels[p.estadoPago]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {showPago && (
        <RegistrarPagoModal
          clienteId={clienteId}
          clienteNombre={clienteNombre}
          clienteTelefono={clienteTelefono ?? null}
          saldo={saldo}
          pedidosPendientes={pedidosPendientes}
          onClose={onClosePago}
          onSuccess={(_result) => {
            onClosePago()
          }}
        />
      )}

      {pendingDeleteId && (
        <ConfirmDeleteModal
          title="Eliminar pago"
          description="¿Eliminar este pago? Se revertirán los saldos de los pedidos asociados."
          warning={deleteError ?? undefined}
          onConfirm={() => void handleDeleteMovimiento()}
          onClose={() => { setPendingDeleteId(null); setDeleteError(null) }}
          isPending={deletingId === pendingDeleteId}
        />
      )}
    </div>
  )
}
