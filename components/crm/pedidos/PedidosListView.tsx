'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Plus, Trash2, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import CreatePedidoModal from './CreatePedidoModal'
import ConfirmDeleteModal from '@/components/shared/ConfirmDeleteModal'

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
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const queryClient = useQueryClient()

  const [showCreate, setShowCreate] = useState(false)
  const [filterEstado, setFilterEstado] = useState('')
  const [filterEstadoPago, setFilterEstadoPago] = useState('')
  const [deletingPedido, setDeletingPedido] = useState<Pedido | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  async function handleExport() {
    setIsExporting(true)
    try {
      const res = await fetch('/api/export/pedidos')
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `pedidos_${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setIsExporting(false)
    }
  }

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

  async function handleDeletePedido() {
    if (!deletingPedido) return
    setDeleteError(null)
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/pedidos/${deletingPedido.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        setDeleteError(data.error ?? 'Error al eliminar')
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['pedidos'] })
      setDeletingPedido(null)
    } catch {
      setDeleteError('Error de conexión')
    } finally {
      setIsDeleting(false)
    }
  }

  const selectClass = cn(
    'px-3 py-2.5 md:py-1.5 text-[16px] md:text-sm rounded-md border border-border bg-background text-foreground',
    'focus:outline-none focus:ring-1 focus:ring-ring transition-colors',
  )

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <h1 className="text-xl font-semibold text-foreground">Pedidos</h1>
          {/* Desktop buttons */}
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={() => void handleExport()}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              <Download size={13} />
              CSV
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus size={14} />
              Nuevo Pedido
            </button>
          </div>
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

        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Cargando pedidos...</div>
        ) : pedidos.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No hay pedidos que mostrar</div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {pedidos.map((p) => (
                <div
                  key={p.id}
                  className="bg-card border border-border rounded-xl p-4 cursor-pointer transition-colors"
                >
                  <div
                    className="flex items-start justify-between gap-2"
                    onClick={() => router.push(`/crm/pedidos/${p.id}`)}
                  >
                    <div>
                      <p className="font-semibold text-foreground text-base">
                        {p.clienteNombre} {p.clienteApellido}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {format(new Date(p.fecha), 'dd/MM/yyyy')}
                      </p>
                    </div>
                    <p className="text-lg font-bold text-foreground shrink-0">{formatMoney(p.total)}</p>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div
                      className="flex items-center gap-2"
                      onClick={() => router.push(`/crm/pedidos/${p.id}`)}
                    >
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', estadoColors[p.estado])}>
                        {estadoLabels[p.estado]}
                      </span>
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', estadoPagoColors[p.estadoPago])}>
                        {estadoPagoLabels[p.estadoPago]}
                      </span>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteError(null)
                          setDeletingPedido(p)
                        }}
                        className="p-2 text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                        title="Eliminar pedido"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Fecha</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Cliente</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Vendedor</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Estado</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium border-b border-border">Total</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Pago</th>
                    {isAdmin && (
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border" />
                    )}
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-border last:border-0 hover:bg-accent/50 transition-colors"
                    >
                      <td
                        className="py-2.5 px-3 text-muted-foreground cursor-pointer"
                        onClick={() => router.push(`/crm/pedidos/${p.id}`)}
                      >
                        {format(new Date(p.fecha), 'dd/MM/yyyy')}
                      </td>
                      <td
                        className="py-2.5 px-3 font-medium text-foreground cursor-pointer"
                        onClick={() => router.push(`/crm/pedidos/${p.id}`)}
                      >
                        {p.clienteNombre} {p.clienteApellido}
                      </td>
                      <td
                        className="py-2.5 px-3 text-muted-foreground cursor-pointer"
                        onClick={() => router.push(`/crm/pedidos/${p.id}`)}
                      >
                        {p.vendedorNombre ?? '—'}
                      </td>
                      <td
                        className="py-2.5 px-3 cursor-pointer"
                        onClick={() => router.push(`/crm/pedidos/${p.id}`)}
                      >
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', estadoColors[p.estado])}>
                          {estadoLabels[p.estado]}
                        </span>
                      </td>
                      <td
                        className="py-2.5 px-3 text-right font-medium cursor-pointer"
                        onClick={() => router.push(`/crm/pedidos/${p.id}`)}
                      >
                        {formatMoney(p.total)}
                      </td>
                      <td
                        className="py-2.5 px-3 cursor-pointer"
                        onClick={() => router.push(`/crm/pedidos/${p.id}`)}
                      >
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', estadoPagoColors[p.estadoPago])}>
                          {estadoPagoLabels[p.estadoPago]}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="py-2.5 px-3">
                          <button
                            onClick={() => {
                              setDeleteError(null)
                              setDeletingPedido(p)
                            }}
                            className="p-1.5 text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                            title="Eliminar pedido"
                          >
                            <Trash2 size={14} />
                          </button>
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

      {/* FAB mobile */}
      <button
        onClick={() => setShowCreate(true)}
        className="fixed bottom-[76px] right-4 z-30 flex items-center gap-2 h-14 rounded-full bg-primary text-primary-foreground shadow-lg px-5 md:hidden active:scale-95 transition-transform"
      >
        <Plus size={20} strokeWidth={2} />
        <span className="text-sm font-semibold pr-1">Pedido</span>
      </button>

      {showCreate && <CreatePedidoModal onClose={() => setShowCreate(false)} />}

      {deletingPedido && (
        <ConfirmDeleteModal
          title="Eliminar pedido"
          description={`¿Eliminar el pedido de ${deletingPedido.clienteNombre} ${deletingPedido.clienteApellido} del ${format(new Date(deletingPedido.fecha), 'dd/MM/yyyy')}? Esta acción no se puede deshacer.`}
          warning={deleteError ?? undefined}
          onConfirm={handleDeletePedido}
          onClose={() => setDeletingPedido(null)}
          isPending={isDeleting}
        />
      )}
    </div>
  )
}
