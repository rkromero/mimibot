'use client'

import { useRef, useState, useEffect } from 'react'
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Plus, Trash2, Download, CheckCircle, MoreVertical, Eye, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatFechaAR } from '@/lib/dates'
import CreatePedidoModal from './CreatePedidoModal'
import ConfirmDeleteModal from '@/components/shared/ConfirmDeleteModal'
import SwipeableListItem from '@/components/shared/SwipeableListItem'
import { useToast } from '@/components/shared/ToastProvider'
import DataTable from '@/components/data-table/DataTable'

type Pedido = {
  id: string
  fecha: string
  clienteNombre: string
  clienteApellido: string
  vendedorNombre: string | null
  estado: 'pendiente' | 'pendiente_aprobacion' | 'confirmado' | 'listo_para_repartir' | 'en_reparto' | 'entregado' | 'cancelado'
  total: string
  estadoPago: 'impago' | 'parcial' | 'pagado'
}

const estadoColors: Record<string, string> = {
  pendiente: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  pendiente_aprobacion: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  confirmado: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  listo_para_repartir: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  en_reparto: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  entregado: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  cancelado: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}

const estadoPagoColors: Record<string, string> = {
  impago: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  parcial: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  pagado: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
}

// Estilo neutro para cualquier estado no mapeado: la pastilla nunca queda en blanco.
const estadoFallbackColor = 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'

const estadoLabels: Record<string, string> = {
  pendiente: 'Pendiente',
  pendiente_aprobacion: 'Pte. Aprobación',
  confirmado: 'Confirmado',
  listo_para_repartir: 'Listo p/ repartir',
  en_reparto: 'En reparto',
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
  const role = session?.user?.role
  const isAdmin = role === 'admin'
  const isGerente = role === 'gerente'
  const canApproveOrRevert = isAdmin || isGerente
  const queryClient = useQueryClient()
  const toast = useToast()

  const [showCreate, setShowCreate] = useState(false)
  const [filterEstado, setFilterEstado] = useState('')
  const [filterEstadoPago, setFilterEstadoPago] = useState('')
  const [filterVendedor, setFilterVendedor] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [deletingPedido, setDeletingPedido] = useState<Pedido | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null)
      }
    }
    if (openMenuId) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openMenuId])

  // Debounce de la búsqueda para no disparar un request por tecla
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // Vendedores para el filtro rápido (solo admin/gerente)
  const { data: vendedoresData } = useQuery<{ data: Array<{ id: string; name: string | null }> }>({
    queryKey: ['/api/users', 'vendedores-filtro-pedidos'],
    queryFn: () => fetch('/api/users?role=agent,vendedor,rtv').then((r) => r.json()),
    enabled: canApproveOrRevert,
    staleTime: 5 * 60_000,
  })
  const vendedores = vendedoresData?.data ?? []

  // Confirmar pedido legacy (pendiente → confirmado)
  const confirmMutation = useMutation({
    mutationFn: async (pedidoId: string) => {
      const res = await fetch(`/api/pedidos/${pedidoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'confirmado' }),
      })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        throw new Error(data.error ?? 'Error al confirmar')
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/pedidos'] })
      toast.success('Pedido confirmado')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  // Aprobar pedido (pendiente_aprobacion → confirmado)
  const approveMutation = useMutation({
    mutationFn: async (pedidoId: string) => {
      const res = await fetch(`/api/pedidos/${pedidoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'confirmado' }),
      })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        throw new Error(data.error ?? 'Error al aprobar')
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/pedidos'] })
      toast.success('Pedido aprobado')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

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
      void queryClient.invalidateQueries({ queryKey: ['/api/pedidos'] })
      setDeletingPedido(null)
      toast.success('Pedido eliminado')
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

  const extraParams: Record<string, string> = {}
  if (filterEstado) extraParams['estado'] = filterEstado
  if (filterEstadoPago) extraParams['estadoPago'] = filterEstadoPago
  if (filterVendedor) extraParams['vendedorId'] = filterVendedor
  if (debouncedSearch) extraParams['search'] = debouncedSearch

  const columns = [
    {
      key: 'fecha',
      label: 'Fecha',
      sortable: true,
      render: (row: Pedido) => (
        <span className="text-muted-foreground">
          {formatFechaAR(row.fecha)}
        </span>
      ),
    },
    {
      key: 'clienteNombre',
      label: 'Cliente',
      sortable: true,
      render: (row: Pedido) => (
        <span className="font-medium text-foreground">
          {row.clienteNombre} {row.clienteApellido}
        </span>
      ),
    },
    {
      key: 'vendedorNombre',
      label: 'Vendedor',
      render: (row: Pedido) => (
        <span className="text-muted-foreground">{row.vendedorNombre ?? '—'}</span>
      ),
    },
    {
      key: 'estado',
      label: 'Estado',
      render: (row: Pedido) => (
        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', estadoColors[row.estado] ?? estadoFallbackColor)}>
          {estadoLabels[row.estado] ?? row.estado}
        </span>
      ),
    },
    {
      key: 'total',
      label: 'Total',
      sortable: true,
      headerClassName: 'text-right',
      className: 'text-right font-medium',
      render: (row: Pedido) => <span>{formatMoney(row.total)}</span>,
    },
    {
      key: 'estadoPago',
      label: 'Pago',
      render: (row: Pedido) => (
        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', estadoPagoColors[row.estadoPago])}>
          {estadoPagoLabels[row.estadoPago]}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      headerClassName: 'w-10',
      render: (row: Pedido) => (
        <div
          className="relative flex justify-end"
          ref={openMenuId === row.id ? menuRef : undefined}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              setOpenMenuId(openMenuId === row.id ? null : row.id)
            }}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
            title="Acciones"
          >
            <MoreVertical size={14} />
          </button>
          {openMenuId === row.id && (
            <div className="absolute right-0 top-8 z-20 w-44 rounded-md border border-border bg-card shadow-lg py-1">
              <button
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpenMenuId(null); router.push(`/crm/pedidos/${row.id}`) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
              >
                <Eye size={13} className="text-muted-foreground" />
                Ver pedido
              </button>
              {/* Aprobar: disponible para gerente/admin en pedidos pendiente_aprobacion */}
              {canApproveOrRevert && row.estado === 'pendiente_aprobacion' && (
                <>
                  <div className="border-t border-border my-1" />
                  <button
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpenMenuId(null); approveMutation.mutate(row.id) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                  >
                    <CheckCircle size={13} className="text-green-600" />
                    Aprobar pedido
                  </button>
                </>
              )}
              {isAdmin && (
                <>
                  <div className="border-t border-border my-1" />
                  <button
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpenMenuId(null); setDeleteError(null); setDeletingPedido(row) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 size={13} />
                    Eliminar
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <h1 className="text-xl font-semibold text-foreground">Pedidos</h1>
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

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)} className={selectClass}>
            <option value="">Todos los estados</option>
            <option value="pendiente_aprobacion">Pte. Aprobación</option>
            <option value="pendiente">Pendiente</option>
            <option value="confirmado">Confirmado</option>
            <option value="listo_para_repartir">Listo p/ repartir</option>
            <option value="en_reparto">En reparto</option>
            <option value="entregado">Entregado</option>
            <option value="cancelado">Cancelado</option>
          </select>
          <select value={filterEstadoPago} onChange={(e) => setFilterEstadoPago(e.target.value)} className={selectClass}>
            <option value="">Todos los pagos</option>
            <option value="impago">Impago</option>
            <option value="parcial">Parcial</option>
            <option value="pagado">Pagado</option>
          </select>
          {canApproveOrRevert && (
            <select value={filterVendedor} onChange={(e) => setFilterVendedor(e.target.value)} className={selectClass}>
              <option value="">Todos los vendedores</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.name ?? '—'}</option>
              ))}
            </select>
          )}

          <div className="relative w-full sm:w-auto sm:ml-auto sm:min-w-[260px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por nombre, CUIT o dirección..."
              className="w-full pl-10 pr-3 py-2.5 md:py-1.5 text-[16px] md:text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
            />
          </div>
        </div>

        <DataTable<Pedido>
          endpoint="/api/pedidos"
          columns={columns}
          extraParams={extraParams}
          defaultPageSize={50}
          showSearch={false}
          onRowClick={(row) => router.push(`/crm/pedidos/${row.id}`)}
          renderMobileCard={(p) => (
            <SwipeableListItem
              key={p.id}
              leftAction={
                p.estado === 'pendiente'
                  ? {
                      label: 'Confirmar',
                      icon: <CheckCircle size={20} />,
                      className: 'bg-green-500 text-white',
                      onClick: () => confirmMutation.mutate(p.id),
                    }
                  : (p.estado === 'pendiente_aprobacion' && canApproveOrRevert)
                  ? {
                      label: 'Aprobar',
                      icon: <CheckCircle size={20} />,
                      className: 'bg-green-500 text-white',
                      onClick: () => approveMutation.mutate(p.id),
                    }
                  : undefined
              }
              rightAction={
                isAdmin
                  ? {
                      label: 'Eliminar',
                      icon: <Trash2 size={20} />,
                      className: 'bg-destructive text-white',
                      onClick: () => { setDeleteError(null); setDeletingPedido(p) },
                    }
                  : undefined
              }
            >
              <div
                className="bg-card border border-border rounded-xl p-4 cursor-pointer transition-colors"
                onClick={() => router.push(`/crm/pedidos/${p.id}`)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground text-base">
                      {p.clienteNombre} {p.clienteApellido}
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {formatFechaAR(p.fecha)}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-foreground shrink-0">{formatMoney(p.total)}</p>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', estadoColors[p.estado] ?? estadoFallbackColor)}>
                    {estadoLabels[p.estado] ?? p.estado}
                  </span>
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', estadoPagoColors[p.estadoPago])}>
                    {estadoPagoLabels[p.estadoPago]}
                  </span>
                </div>
              </div>
            </SwipeableListItem>
          )}
          emptyMessage="No hay pedidos que mostrar"
        />
      </div>

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
          description={`¿Eliminar el pedido de ${deletingPedido.clienteNombre} ${deletingPedido.clienteApellido} del ${formatFechaAR(deletingPedido.fecha)}? Esta acción no se puede deshacer.`}
          warning={deleteError ?? undefined}
          onConfirm={handleDeletePedido}
          onClose={() => setDeletingPedido(null)}
          isPending={isDeleting}
        />
      )}
    </div>
  )
}
