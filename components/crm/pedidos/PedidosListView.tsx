'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import CreatePedidoModal from './CreatePedidoModal'

type Pedido = {
  id: string
  fecha: string
  clienteNombre: string
  clienteApellido: string
  vendedorNombre: string | null
  estado: 'pendiente' | 'confirmado' | 'entregado' | 'cancelado'
  total: string
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

export default function PedidosListView() {
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)
  const [filterEstado, setFilterEstado] = useState('')
  const [filterEstadoPago, setFilterEstadoPago] = useState('')

  const params = new URLSearchParams()
  if (filterEstado) params.set('estado', filterEstado)
  if (filterEstadoPago) params.set('estadoPago', filterEstadoPago)

  const { data: pedidos = [], isLoading } = useQuery<Pedido[]>({
    queryKey: ['pedidos', filterEstado, filterEstadoPago],
    queryFn: async () => {
      const res = await fetch(`/api/pedidos?${params}`)
      if (!res.ok) throw new Error('Error al cargar pedidos')
      const json = await res.json() as { data: Pedido[] }
      return json.data
    },
    staleTime: 30_000,
  })

  const selectClass = cn(
    'px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground',
    'focus:outline-none focus:ring-1 focus:ring-ring transition-colors',
  )

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-foreground">Pedidos</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} />
          Nuevo Pedido
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={filterEstado}
          onChange={(e) => setFilterEstado(e.target.value)}
          className={selectClass}
        >
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="confirmado">Confirmado</option>
          <option value="entregado">Entregado</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <select
          value={filterEstadoPago}
          onChange={(e) => setFilterEstadoPago(e.target.value)}
          className={selectClass}
        >
          <option value="">Todos los pagos</option>
          <option value="impago">Impago</option>
          <option value="parcial">Parcial</option>
          <option value="pagado">Pagado</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Cargando pedidos...</div>
        ) : pedidos.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No hay pedidos que mostrar</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Fecha</th>
                <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Cliente</th>
                <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Vendedor</th>
                <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Estado</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium border-b border-border">Total</th>
                <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Pago</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/crm/pedidos/${p.id}`)}
                  className="border-b border-border last:border-0 hover:bg-accent/50 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 px-3 text-muted-foreground">
                    {format(new Date(p.fecha), 'dd/MM/yyyy')}
                  </td>
                  <td className="py-2.5 px-3 font-medium text-foreground">
                    {p.clienteNombre} {p.clienteApellido}
                  </td>
                  <td className="py-2.5 px-3 text-muted-foreground">
                    {p.vendedorNombre ?? '—'}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', estadoColors[p.estado])}>
                      {estadoLabels[p.estado]}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-medium">{formatMoney(p.total)}</td>
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

      {showCreate && <CreatePedidoModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
