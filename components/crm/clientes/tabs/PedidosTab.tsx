'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import CreatePedidoModal from '@/components/crm/pedidos/CreatePedidoModal'

type Props = { clienteId: string }

type Pedido = {
  id: string
  fecha: string
  estado: 'pendiente' | 'confirmado' | 'entregado' | 'cancelado'
  total: string
  montoPagado: string
  saldoPendiente: string
  estadoPago: 'impago' | 'parcial' | 'pagado'
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

export default function PedidosTab({ clienteId }: Props) {
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)

  const { data: pedidos = [], isLoading } = useQuery<Pedido[]>({
    queryKey: ['clientes', clienteId, 'pedidos'],
    queryFn: async () => {
      const res = await fetch(`/api/pedidos?clienteId=${clienteId}`)
      if (!res.ok) throw new Error('Error al cargar pedidos')
      const json = await res.json() as { data: Pedido[] }
      return json.data
    },
    staleTime: 30_000,
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-foreground">Pedidos</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} />
          Nuevo Pedido
        </button>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Cargando pedidos...</div>
        ) : pedidos.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Sin pedidos registrados</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Fecha</th>
                <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Estado</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium border-b border-border">Total</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium border-b border-border">Pagado</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium border-b border-border">Saldo</th>
                <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Est. Pago</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/crm/pedidos/${p.id}`)}
                  className="border-b border-border last:border-0 hover:bg-accent/50 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 px-3 text-foreground">
                    {format(new Date(p.fecha), 'dd/MM/yyyy')}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', estadoColors[p.estado])}>
                      {estadoLabels[p.estado]}
                    </span>
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

      {showCreate && (
        <CreatePedidoModal
          clienteId={clienteId}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  )
}
