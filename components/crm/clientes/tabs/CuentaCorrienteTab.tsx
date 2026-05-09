'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import RegistrarPagoModal from '@/components/crm/cuenta-corriente/RegistrarPagoModal'

type Props = { clienteId: string }

type Movimiento = {
  id: string
  tipo: 'debito' | 'credito'
  monto: string
  fecha: string
  descripcion: string | null
  pedidoId: string | null
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
  saldo: string
  movimientos: Movimiento[]
  pedidos: PedidoCC[]
}

type PagoResult = {
  aplicaciones: Array<{
    pedidoId: string
    montoAplicado: string
  }>
  sobrante: string
}

function formatMoney(value: string | number) {
  return `$${parseFloat(String(value)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
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

export default function CuentaCorrienteTab({ clienteId }: Props) {
  const [showPago, setShowPago] = useState(false)
  const [lastPagoResult, setLastPagoResult] = useState<PagoResult | null>(null)

  const { data, isLoading, isError } = useQuery<CuentaCorrienteData>({
    queryKey: ['clientes', clienteId, 'cc'],
    queryFn: async () => {
      const res = await fetch(`/api/clientes/${clienteId}/cuenta-corriente`)
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

  const saldo = parseFloat(data.saldo)
  const saldoPositivo = saldo > 0

  return (
    <div className="space-y-6">
      {/* Saldo */}
      <div className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-1">
            {saldoPositivo ? 'Saldo deudor' : saldo < 0 ? 'Saldo a favor' : 'Saldo'}
          </p>
          <p className={cn('text-2xl font-semibold', saldoPositivo ? 'text-red-600' : saldo < 0 ? 'text-green-600' : 'text-foreground')}>
            {formatMoney(Math.abs(saldo))}
          </p>
        </div>
        <button
          onClick={() => setShowPago(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} />
          Registrar Pago
        </button>
      </div>

      {/* Distribución del último pago */}
      {lastPagoResult && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-green-800 dark:text-green-200 mb-2">Pago registrado</h3>
          <ul className="space-y-1 text-sm">
            {lastPagoResult.aplicaciones.map((ap) => (
              <li key={ap.pedidoId} className="flex gap-2 text-green-700 dark:text-green-300">
                <span>Pedido {ap.pedidoId.slice(-6)}:</span>
                <span className="font-medium">{formatMoney(ap.montoAplicado)}</span>
              </li>
            ))}
            {parseFloat(lastPagoResult.sobrante) > 0 && (
              <li className="flex gap-2 text-green-700 dark:text-green-300">
                <span>Saldo a favor:</span>
                <span className="font-medium">{formatMoney(lastPagoResult.sobrante)}</span>
              </li>
            )}
          </ul>
          <button
            onClick={() => setLastPagoResult(null)}
            className="mt-2 text-xs text-green-600 hover:underline"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Movimientos */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Movimientos</h3>
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {data.movimientos.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">Sin movimientos</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Fecha</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Tipo</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Descripción</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-medium border-b border-border">Monto</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Pedido</th>
                </tr>
              </thead>
              <tbody>
                {data.movimientos.map((m) => (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 px-3 text-muted-foreground">{format(new Date(m.fecha), 'dd/MM/yyyy')}</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Pedidos con saldo */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Pedidos</h3>
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {data.pedidos.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">Sin pedidos</div>
          ) : (
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
                        {format(new Date(p.fecha), 'dd/MM/yyyy')}
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
          )}
        </div>
      </div>

      {showPago && (
        <RegistrarPagoModal
          clienteId={clienteId}
          onClose={() => setShowPago(false)}
          onSuccess={(result) => {
            setLastPagoResult(result)
            setShowPago(false)
          }}
        />
      )}
    </div>
  )
}
