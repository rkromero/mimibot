'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { ArrowLeft, CheckCircle, Truck, XCircle, FileText, Download, RotateCcw, Tag, ImageIcon, Pencil, X, MoreVertical, type LucideIcon } from 'lucide-react'
import EntregaProofModal from './EntregaProofModal'
import ComprobantePago from './ComprobantePago'
import EntregaUbicacionMap from './EntregaUbicacionMap'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { formatFechaAR } from '@/lib/dates'
import { useToast } from '@/components/shared/ToastProvider'
import { useGenerarDocumento } from '@/lib/pedidos/useGenerarDocumento'
import ProductSheet from './ProductSheet'
import { esRolVentas } from '@/lib/authz/roles'

type Props = { id: string }

type PedidoItem = {
  id: string
  productoId: string
  cantidad: number
  precioUnitario: string
  subtotal: string
  producto: { id: string; nombre: string; sku?: string | null }
}

type SelectedItem = {
  productoId: string
  productoNombre: string
  cantidad: number
  precioUnitario: string
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
  vendedorId: string
  fecha: string
  estado: 'pendiente' | 'pendiente_aprobacion' | 'confirmado' | 'listo_para_repartir' | 'en_reparto' | 'entregado' | 'cancelado'
  observaciones: string | null
  total: string
  descuento: string
  montoPagado: string
  saldoPendiente: string
  estadoPago: 'impago' | 'parcial' | 'pagado'
  items: PedidoItem[]
  aplicaciones: AplicacionPago[]
  entregaLat: number | null
  entregaLng: number | null
  entregaPrecisionM: number | null
  metodoEntrega: 'expreso' | 'retiro_fabrica' | null
  esReparto: boolean
  firmaUrl: string | null
  remitoFotoUrl: string | null
  comprobantePagoUrl: string | null
}

const ESTADOS_BLOQUEADOS = new Set(['confirmado', 'listo_para_repartir', 'en_reparto', 'entregado'])

const estadoColors: Record<string, string> = {
  pendiente: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  pendiente_aprobacion: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  confirmado: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  en_reparto: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
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
  pendiente_aprobacion: 'Pte. Aprobación',
  confirmado: 'Confirmado',
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

type ComprobanteProps = {
  pedidoId: string
  metodoEntrega: 'expreso' | 'retiro_fabrica' | null
  esReparto: boolean
}

function ComprobanteEntrega({ pedidoId, metodoEntrega, esReparto }: ComprobanteProps) {
  const { data, isLoading, isError } = useQuery<{ url: string | null; tipo: string | null; missingComprobante: boolean }>({
    queryKey: ['comprobante', pedidoId],
    queryFn: async () => {
      const res = await fetch(`/api/pedidos/${pedidoId}/comprobante`, {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error('Error al cargar comprobante')
      return res.json() as Promise<{ url: string | null; tipo: string | null; missingComprobante: boolean }>
    },
    staleTime: 60_000,
    enabled: metodoEntrega === 'expreso' || esReparto,
  })

  const tipoLabel = metodoEntrega === 'expreso' ? 'Foto de remito firmado' : 'Firma del cliente'

  if (!metodoEntrega && !esReparto) return null
  if (metodoEntrega !== 'expreso' && !esReparto) return null

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-3">Comprobante de entrega</h3>
      <div className="bg-card border border-border rounded-lg p-4">
        {isLoading && (
          <p className="text-sm text-muted-foreground">Cargando comprobante...</p>
        )}
        {isError && (
          <p className="text-sm text-destructive">Error al cargar el comprobante.</p>
        )}
        {!isLoading && !isError && data?.missingComprobante && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ImageIcon size={16} />
            Sin comprobante cargado
          </div>
        )}
        {!isLoading && !isError && data?.url && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{tipoLabel}</p>
            <img
              src={data.url}
              alt={tipoLabel}
              className="max-w-full max-h-80 rounded-md border border-border object-contain"
            />
            <a
              href={data.url}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent transition-colors"
            >
              <Download size={13} />
              Descargar
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

export default function PedidoDetail({ id }: Props) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { data: session } = useSession()
  const role = session?.user?.role
  const isAdmin = role === 'admin'
  const isGerente = role === 'gerente'
  const canApproveOrRevert = isAdmin || isGerente

  const [confirmCancel, setConfirmCancel] = useState(false)
  const [showProof, setShowProof] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const { generarDocumento, isGenerating, anyGenerating } = useGenerarDocumento()

  // Edit mode state
  const [editMode, setEditMode] = useState(false)
  const [editItems, setEditItems] = useState<SelectedItem[]>([])
  const [editFecha, setEditFecha] = useState('')
  const [editObservaciones, setEditObservaciones] = useState('')
  const [showProductSheet, setShowProductSheet] = useState(false)

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
        toast.success('Pedido aprobado')
      } else if (estado === 'pendiente_aprobacion') {
        void queryClient.invalidateQueries({ queryKey: ['stock-saldos'] })
        toast.success('Pedido revertido a pendiente de aprobación')
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

  const canEdit = isAdmin || (pedido != null && !ESTADOS_BLOQUEADOS.has(pedido.estado))

  function enterEditMode() {
    if (!pedido) return
    setEditFecha(pedido.fecha ? pedido.fecha.slice(0, 10) : '')
    setEditObservaciones(pedido.observaciones ?? '')
    setEditItems(pedido.items.map(item => ({
      productoId: item.productoId,
      productoNombre: item.producto?.nombre ?? '',
      cantidad: item.cantidad,
      precioUnitario: item.precioUnitario,
    })))
    setEditMode(true)
  }

  function exitEditMode() {
    setEditMode(false)
    setShowProductSheet(false)
  }

  const { mutate: saveEdits, isPending: isSaving } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/pedidos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: editItems.map(i => {
            const precio = parseFloat(i.precioUnitario)
            return {
              productoId: i.productoId,
              cantidad: i.cantidad,
              ...(Number.isFinite(precio) && precio >= 0 ? { precioUnitario: precio } : {}),
            }
          }),
          fecha: editFecha || null,
          observaciones: editObservaciones || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        throw new Error(data.error ?? 'Error al guardar')
      }
      return res.json()
    },
    onSuccess: () => {
      exitEditMode()
      void queryClient.invalidateQueries({ queryKey: ['pedido', id] })
      void queryClient.invalidateQueries({ queryKey: ['pedidos'] })
      if (pedido) {
        void queryClient.invalidateQueries({ queryKey: ['clientes', pedido.clienteId, 'pedidos'] })
      }
      toast.success('Pedido actualizado')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  // Menú "Acciones" (sólo móvil): cierre por click afuera y tecla Esc
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuOpen) return
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [menuOpen])

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

  const itemsSubtotal = pedido.items.reduce((sum, item) => sum + parseFloat(item.subtotal), 0)
  const descuentoPct = parseFloat(pedido.descuento ?? '0')
  const descuentoMonto = itemsSubtotal * (descuentoPct / 100)
  const displayTotal = pedido.total

  // ── Acciones para la barra móvil: acción principal + menú "Acciones" ──
  type ActionItem = { key: string; label: string; icon: LucideIcon; onClick: () => void; disabled?: boolean; danger?: boolean }
  const docsAvailable = pedido.estado === 'confirmado' || pedido.estado === 'entregado'

  // Acción "main" del estado actual (independiente del modo edición)
  let stateMain: ActionItem | null = null
  if (pedido.estado === 'pendiente') {
    stateMain = { key: 'confirmar', label: 'Confirmar', icon: CheckCircle, onClick: () => updateEstado('confirmado'), disabled: isUpdating }
  } else if (pedido.estado === 'pendiente_aprobacion' && canApproveOrRevert) {
    stateMain = { key: 'aprobar', label: 'Aprobar pedido', icon: CheckCircle, onClick: () => updateEstado('confirmado'), disabled: isUpdating }
  } else if (pedido.estado === 'confirmado') {
    stateMain = { key: 'entregar', label: 'Marcar Entregado', icon: Truck, onClick: () => setShowProof(true), disabled: isUpdating }
  }

  // En edición la acción principal es "Guardar cambios"; si no, la del estado.
  const primaryAction: ActionItem | null = editMode
    ? { key: 'save', label: isSaving ? 'Guardando...' : 'Guardar cambios', icon: CheckCircle, onClick: () => saveEdits(), disabled: isSaving || editItems.length === 0 }
    : stateMain
  const PrimaryIcon = primaryAction?.icon

  // Resto de acciones aplicables → menú "Acciones"
  const secondaryActions: ActionItem[] = []
  if (editMode) {
    secondaryActions.push({ key: 'cancel-edit', label: 'Cancelar edición', icon: X, onClick: exitEditMode, disabled: isSaving })
    if (stateMain) secondaryActions.push(stateMain) // en edición, la acción del estado pasa al menú
  } else if (canEdit) {
    secondaryActions.push({ key: 'editar', label: 'Editar', icon: Pencil, onClick: enterEditMode })
  }
  if (pedido.estado === 'confirmado' && canApproveOrRevert) {
    secondaryActions.push({ key: 'revertir', label: 'Revertir', icon: RotateCcw, onClick: () => updateEstado('pendiente_aprobacion'), disabled: isUpdating })
  }
  if (pedido.estado === 'pendiente' || pedido.estado === 'pendiente_aprobacion') {
    secondaryActions.push({ key: 'cancelar-pedido', label: 'Cancelar pedido', icon: XCircle, onClick: () => setConfirmCancel(true), disabled: isUpdating, danger: true })
  }
  if (docsAvailable) {
    secondaryActions.push({ key: 'remito', label: isGenerating(id, 'remito') ? 'Generando...' : 'Remito', icon: FileText, onClick: () => void generarDocumento(id, 'remito'), disabled: anyGenerating(id) })
    secondaryActions.push({ key: 'proforma', label: isGenerating(id, 'proforma') ? 'Generando...' : 'Proforma', icon: Download, onClick: () => void generarDocumento(id, 'proforma'), disabled: anyGenerating(id) })
    secondaryActions.push({ key: 'etiqueta', label: isGenerating(id, 'etiqueta') ? 'Generando...' : 'Etiqueta', icon: Tag, onClick: () => void generarDocumento(id, 'etiqueta'), disabled: anyGenerating(id) })
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/crm/pedidos" className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
            {formatFechaAR(pedido.fecha)} — Vendedor: {pedido.vendedorNombre ?? '—'}
          </p>
        </div>

        {/* Actions (desktop: row inline) */}
        <div className="hidden sm:flex items-center gap-2">

          {/* ── Editar pedido ── */}
          {canEdit && !editMode && (
            <button
              onClick={enterEditMode}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent transition-colors"
            >
              <Pencil size={14} />
              Editar
            </button>
          )}
          {editMode && (
            <>
              <button
                onClick={() => saveEdits()}
                disabled={isSaving || editItems.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button
                onClick={exitEditMode}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent transition-colors disabled:opacity-50"
              >
                <X size={14} />
                Cancelar
              </button>
            </>
          )}

          {/* ── Estado: pendiente (legacy) ── */}
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

          {/* ── Estado: pendiente_aprobacion ── */}
          {pedido.estado === 'pendiente_aprobacion' && (
            <>
              {/* Sólo gerente/admin pueden aprobar */}
              {canApproveOrRevert && (
                <button
                  onClick={() => updateEstado('confirmado')}
                  disabled={isUpdating}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  <CheckCircle size={14} />
                  Aprobar pedido
                </button>
              )}
              {/* Cualquiera con acceso puede cancelar */}
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

          {/* ── Estado: confirmado ── */}
          {pedido.estado === 'confirmado' && (
            <>
              {/* Gerente/admin pueden revertir */}
              {canApproveOrRevert && (
                <button
                  onClick={() => updateEstado('pendiente_aprobacion')}
                  disabled={isUpdating}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent transition-colors disabled:opacity-50"
                  title="Revertir a pendiente de aprobación para permitir edición"
                >
                  <RotateCcw size={14} />
                  Revertir
                </button>
              )}
              <button
                onClick={() => setShowProof(true)}
                disabled={isUpdating}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Truck size={14} />
                Marcar Entregado
              </button>
            </>
          )}

          {/* Documentos: disponibles cuando confirmado o entregado */}
          {(pedido.estado === 'confirmado' || pedido.estado === 'entregado') && (
            <>
              <button
                onClick={() => void generarDocumento(id, 'remito')}
                disabled={anyGenerating(id)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent transition-colors disabled:opacity-50"
                title="Descargar remito PDF"
              >
                <FileText size={14} />
                {isGenerating(id, 'remito') ? 'Generando...' : 'Remito'}
              </button>
              <button
                onClick={() => void generarDocumento(id, 'proforma')}
                disabled={anyGenerating(id)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent transition-colors disabled:opacity-50"
                title="Descargar proforma PDF"
              >
                <Download size={14} />
                {isGenerating(id, 'proforma') ? 'Generando...' : 'Proforma'}
              </button>
              <button
                onClick={() => void generarDocumento(id, 'etiqueta')}
                disabled={anyGenerating(id)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent transition-colors disabled:opacity-50"
                title="Descargar etiqueta de envío PDF"
              >
                <Tag size={14} />
                {isGenerating(id, 'etiqueta') ? 'Generando...' : 'Etiqueta'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Actions (mobile: acción principal + menú "Acciones"). Fila propia debajo del header para evitar scroll horizontal. */}
      <div className="flex sm:hidden items-center justify-end gap-2 -mt-3">
          {confirmCancel ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">¿Cancelar?</span>
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
          ) : (
            <>
              {primaryAction && PrimaryIcon && (
                <button
                  onClick={primaryAction.onClick}
                  disabled={primaryAction.disabled}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  <PrimaryIcon size={14} />
                  {primaryAction.label}
                </button>
              )}
              {secondaryActions.length > 0 && (
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setMenuOpen((v) => !v)}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent transition-colors"
                  >
                    <MoreVertical size={16} />
                    Acciones
                  </button>
                  {menuOpen && (
                    <div role="menu" className="absolute right-0 mt-1 w-52 bg-card border border-border rounded-md shadow-lg z-20 py-1">
                      {secondaryActions.map((item) => {
                        const Icon = item.icon
                        return (
                          <button
                            key={item.key}
                            role="menuitem"
                            disabled={item.disabled}
                            onClick={() => { setMenuOpen(false); item.onClick() }}
                            className={cn(
                              'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors disabled:opacity-50',
                              item.danger && 'text-destructive',
                            )}
                          >
                            <Icon size={14} />
                            {item.label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

      {actionError && (
        <div className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">{actionError}</div>
      )}

      {/* Aviso de solo lectura para no-admin con pedido bloqueado */}
      {!isAdmin && ESTADOS_BLOQUEADOS.has(pedido.estado) && (
        <div className="text-xs text-muted-foreground bg-muted border border-border rounded-md px-3 py-2">
          Solo un administrador puede modificar pedidos confirmados.
        </div>
      )}

      {/* Aviso informativo para agentes cuando el pedido está pendiente de aprobación */}
      {pedido.estado === 'pendiente_aprobacion' && esRolVentas(role) && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300">
          Este pedido está pendiente de aprobación por tu gerente. Podés editarlo hasta que sea aprobado.
        </div>
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
            {editMode ? (
              <input
                type="date"
                value={editFecha}
                onChange={e => setEditFecha(e.target.value)}
                className="border border-border rounded px-2 py-0.5 text-sm bg-background text-foreground"
              />
            ) : (
              <span>{formatFechaAR(pedido.fecha)}</span>
            )}
          </div>
          <div className="flex gap-2 text-sm">
            <span className="text-muted-foreground w-24 shrink-0">Notas:</span>
            {editMode ? (
              <textarea
                value={editObservaciones}
                onChange={e => setEditObservaciones(e.target.value)}
                rows={2}
                className="flex-1 border border-border rounded px-2 py-1 text-sm bg-background text-foreground resize-none"
                placeholder="Observaciones..."
              />
            ) : (
              <span className="text-foreground">{pedido.observaciones ?? '—'}</span>
            )}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4 space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Resumen Financiero</h3>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">{formatMoney(itemsSubtotal)}</span>
          </div>
          {descuentoPct > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Descuento ({descuentoPct}%)</span>
              <span className="text-destructive font-medium">-{formatMoney(descuentoMonto)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm border-t border-border pt-2 mt-2">
            <span className="font-semibold text-foreground">Total</span>
            <span className="font-bold">{formatMoney(displayTotal)}</span>
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

      {/* Comprobante de pago */}
      {role !== 'vendedor' && (
        <ComprobantePago pedidoId={id} role={role} estado={pedido.estado} />
      )}

      {/* Items */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Items del Pedido</h3>
          {editMode && (
            <button
              onClick={() => setShowProductSheet(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 border border-border rounded text-xs hover:bg-accent transition-colors"
            >
              <Pencil size={12} />
              Cambiar productos
            </button>
          )}
        </div>
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Producto</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium border-b border-border">Cantidad</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium border-b border-border">Precio Unit.</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium border-b border-border">Subtotal</th>
                {editMode && <th className="py-2 px-3 border-b border-border" />}
              </tr>
            </thead>
            <tbody>
              {(editMode ? editItems : pedido.items).map((item, idx) => {
                const nombre = editMode ? (item as SelectedItem).productoNombre : (item as PedidoItem).producto?.nombre ?? '—'
                const sku = editMode ? null : (item as PedidoItem).producto?.sku
                const precioUnitario = editMode ? (item as SelectedItem).precioUnitario : (item as PedidoItem).precioUnitario
                const subtotal = editMode
                  ? ((parseFloat((item as SelectedItem).precioUnitario) || 0) * (item as SelectedItem).cantidad).toFixed(2)
                  : (item as PedidoItem).subtotal
                const rowKey = editMode ? `edit-${idx}` : (item as PedidoItem).id
                return (
                  <tr key={rowKey} className="border-b border-border last:border-0">
                    <td className="py-2.5 px-3 text-foreground">
                      {nombre}
                      {sku && <span className="block text-xs text-muted-foreground font-mono">{sku}</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right text-muted-foreground">
                      {editMode ? (
                        <input
                          type="number"
                          min={1}
                          value={(item as SelectedItem).cantidad}
                          onChange={e => {
                            const val = parseInt(e.target.value, 10)
                            if (isNaN(val) || val < 1) return
                            setEditItems(prev => prev.map((it, i) => i === idx ? { ...it, cantidad: val } : it))
                          }}
                          className="w-16 border border-border rounded px-2 py-0.5 text-sm bg-background text-foreground text-right"
                        />
                      ) : (item as PedidoItem).cantidad}
                    </td>
                    <td className="py-2.5 px-3 text-right text-muted-foreground">
                  {editMode ? (
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={(item as SelectedItem).precioUnitario}
                      onChange={e => {
                        const v = e.target.value
                        setEditItems(prev => prev.map((it, i) => i === idx ? { ...it, precioUnitario: v } : it))
                      }}
                      className="w-24 border border-border rounded px-2 py-0.5 text-sm bg-background text-foreground text-right"
                    />
                  ) : formatMoney(precioUnitario)}
                </td>
                    <td className="py-2.5 px-3 text-right font-medium">{formatMoney(subtotal)}</td>
                    {editMode && (
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => setEditItems(prev => prev.filter((_, i) => i !== idx))}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title="Quitar item"
                        >
                          <X size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              {(() => {
                const subtotal = editMode
                  ? editItems.reduce((s, i) => s + (parseFloat(i.precioUnitario) || 0) * i.cantidad, 0)
                  : itemsSubtotal
                const total = editMode ? subtotal - subtotal * (descuentoPct / 100) : parseFloat(displayTotal)
                const colSpan = editMode ? 4 : 3
                return (
                  <>
                    <tr>
                      <td colSpan={colSpan} className="py-2.5 px-3 text-right text-sm text-muted-foreground border-t border-border">Subtotal</td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground border-t border-border">{formatMoney(subtotal)}</td>
                    </tr>
                    {descuentoPct > 0 && (
                      <tr>
                        <td colSpan={colSpan} className="py-2.5 px-3 text-right text-sm text-muted-foreground">Descuento ({descuentoPct}%)</td>
                        <td className="py-2.5 px-3 text-right text-destructive">-{formatMoney(subtotal * (descuentoPct / 100))}</td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={colSpan} className="py-2.5 px-3 text-right text-sm font-semibold text-foreground border-t border-border">Total</td>
                      <td className="py-2.5 px-3 text-right font-bold text-foreground border-t border-border">{formatMoney(total)}</td>
                    </tr>
                  </>
                )
              })()}
            </tfoot>
          </table>
        </div>
      </div>

      <ProductSheet
        open={showProductSheet}
        onClose={() => setShowProductSheet(false)}
        clienteId={pedido.clienteId}
        existingItems={editItems}
        onConfirm={(items) => {
          setEditItems(items)
          setShowProductSheet(false)
        }}
      />

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
                      {formatFechaAR(ap.createdAt)}
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

      {/* Comprobante de entrega */}
      {pedido.estado === 'entregado' && (
        <ComprobanteEntrega pedidoId={id} metodoEntrega={pedido.metodoEntrega} esReparto={pedido.esReparto} />
      )}

      {/* Ubicación de la entrega */}
      {pedido.estado === 'entregado' && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Ubicación de la entrega</h3>
          {pedido.entregaLat != null && pedido.entregaLng != null ? (
            <div className="space-y-2">
              <EntregaUbicacionMap
                lat={pedido.entregaLat}
                lng={pedido.entregaLng}
                precisionM={pedido.entregaPrecisionM}
              />
              <div className="flex items-center justify-between text-sm">
                <a
                  href={`https://www.google.com/maps?q=${pedido.entregaLat},${pedido.entregaLng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Abrir en Google Maps
                </a>
                {pedido.entregaPrecisionM != null && (
                  <span className="text-xs text-muted-foreground">
                    Precisión: ±{Math.round(pedido.entregaPrecisionM)} m
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin ubicación registrada para esta entrega.</p>
          )}
        </div>
      )}
    </div>
  )
}
