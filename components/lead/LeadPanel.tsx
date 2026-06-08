'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Bot, Phone, ExternalLink, Mail, MapPin, CreditCard, ShoppingBag } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import Avatar from '@/components/shared/Avatar'
import LeadDetails from './LeadDetails'
import ActivityLogPanel from './ActivityLogPanel'
import ChatFeed from '@/components/chat/ChatFeed'
import ChatComposer from '@/components/chat/ChatComposer'
import TagBadge from '@/components/shared/TagBadge'
import type { LeadWithContact } from '@/types/db'
import type { Session } from 'next-auth'

type LeadWithConversation = LeadWithContact & { conversation?: { id: string } }

type ClienteDetail = {
  id: string
  nombre: string
  apellido: string | null
  telefono: string | null
  email: string | null
  direccion: string | null
  localidad: string | null
  provincia: string | null
  cuit: string | null
  pedidosSummary: {
    count: number
    total: string
    saldoPendiente: string
    ultimoPedidoFecha: string | null
  }
}

type PedidoItem = {
  id: string
  fecha: string
  total: string
  estado: string
  estadoPago: string
}

type Props = {
  /** Present for lead conversations (and for backwards-compat callers like KanbanBoard) */
  leadId?: string | null
  /** Present for client conversations */
  clienteId?: string | null
  /** Explicit conversation ID — preferred over lead.conversation.id when provided */
  conversationId?: string | null
  tipo?: 'cliente' | 'lead'
  /** Display name from inbox list */
  nombre?: string | null
  contactPhone?: string | null
  onClose: () => void
  user: Session['user']
  mobileMode?: boolean
  /** When true, renders inline (no fixed overlay). Used by InboxView desktop. */
  embedded?: boolean
}

function fmt(value: string | number | null | undefined): string {
  const n = Number(value ?? 0)
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

function fmtFecha(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  pendiente_aprobacion: 'P. Aprobación',
  confirmado: 'Confirmado',
  listo_para_repartir: 'Listo',
  en_reparto: 'En reparto',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}

const ESTADO_COLOR: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  pendiente_aprobacion: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  confirmado: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  listo_para_repartir: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  en_reparto: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  entregado: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cancelado: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

const PAGO_LABEL: Record<string, string> = {
  impago: 'Impago',
  parcial: 'Parcial',
  pagado: 'Pagado',
}

const PAGO_COLOR: Record<string, string> = {
  impago: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  parcial: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  pagado: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
}

export default function LeadPanel({
  leadId,
  clienteId,
  conversationId,
  tipo,
  nombre,
  contactPhone,
  onClose,
  user,
  mobileMode,
  embedded = false,
}: Props) {
  const queryClient = useQueryClient()
  const isClienteMode = tipo === 'cliente' || (!leadId && !!clienteId)

  const { data: lead, isLoading, isError } = useQuery<LeadWithConversation>({
    queryKey: ['lead', leadId],
    queryFn: async () => {
      const res = await fetch(`/api/leads/${leadId}`)
      if (!res.ok) throw new Error('Error al cargar lead')
      const json = await res.json() as { data: LeadWithConversation }
      return json.data
    },
    enabled: !isClienteMode && !!leadId,
    retry: false,
  })

  const { data: cliente } = useQuery<ClienteDetail>({
    queryKey: ['cliente-detail', clienteId],
    queryFn: async () => {
      const res = await fetch(`/api/clientes/${clienteId}`)
      if (!res.ok) throw new Error('Error al cargar cliente')
      const json = await res.json() as { data: ClienteDetail }
      return json.data
    },
    enabled: isClienteMode && !!clienteId,
    retry: false,
  })

  const { data: pedidosData } = useQuery<{ data: PedidoItem[] }>({
    queryKey: ['cliente-pedidos', clienteId],
    queryFn: async () => {
      const res = await fetch(`/api/pedidos?clienteId=${clienteId}&limit=5&sortBy=fecha&sortDir=desc`)
      if (!res.ok) throw new Error('Error al cargar pedidos')
      return res.json() as Promise<{ data: PedidoItem[] }>
    },
    enabled: isClienteMode && !!clienteId,
    retry: false,
  })

  const effectiveConvId = conversationId ?? lead?.conversation?.id ?? null

  async function toggleBot() {
    if (!lead || !leadId) return
    await fetch(`/api/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botEnabled: !lead.botEnabled }),
    })
    void queryClient.invalidateQueries({ queryKey: ['lead', leadId] })
  }

  // ── Mobile mode ──────────────────────────────────────────────────────────────
  if (mobileMode) {
    if (!isClienteMode && isLoading) {
      return (
        <div className="flex items-center justify-center w-full h-full text-sm text-muted-foreground">
          Cargando...
        </div>
      )
    }
    if (!isClienteMode && (isError || !lead)) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 w-full h-full text-sm text-muted-foreground">
          <p>No se pudo cargar el lead.</p>
          <button
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ['inbox'] })
              onClose()
            }}
            className="px-3 py-1.5 rounded-md border border-border text-xs hover:bg-accent transition-colors"
          >
            Cerrar
          </button>
        </div>
      )
    }
    return (
      <div className="flex flex-col w-full h-full min-h-0">
        {effectiveConvId ? (
          <>
            <ChatFeed conversationId={effectiveConvId} />
            <ChatComposer conversationId={effectiveConvId} leadId={leadId ?? undefined} />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              {isClienteMode
                ? 'Este cliente no tiene conversación de WhatsApp.'
                : 'Este lead no tiene conversación de WhatsApp.'}
            </p>
          </div>
        )}
      </div>
    )
  }

  // ── Desktop mode ─────────────────────────────────────────────────────────────

  // Cliente mode: panel with full client data
  if (isClienteMode) {
    const displayName = cliente
      ? [cliente.nombre, cliente.apellido].filter(Boolean).join(' ')
      : (nombre ?? 'Cliente')

    const saldo = Number(cliente?.pedidosSummary?.saldoPendiente ?? 0)
    const ultimosPedidos = pedidosData?.data?.slice(0, 5) ?? []

    const clienteInner = (
      <div className="flex w-full h-full overflow-hidden">
        {/* Columna izquierda: datos del cliente */}
        <div className="flex flex-col w-72 shrink-0 border-r border-border overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-4 h-12 border-b border-border shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Avatar name={displayName} color="#6b7280" size="md" />
              <span className="text-sm font-semibold text-foreground truncate">{displayName}</span>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors duration-100 shrink-0"
            >
              <X size={15} />
            </button>
          </div>

          {/* Badge cliente */}
          <div className="px-4 pt-3 pb-1">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[11px] font-medium">
              Cliente
            </span>
          </div>

          {/* Datos de contacto */}
          <div className="px-4 py-3 border-b border-border">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Contacto</p>
            <div className="flex flex-col gap-1.5">
              <Row icon={<Phone size={12} />} value={cliente?.telefono ?? contactPhone} />
              <Row icon={<Mail size={12} />} value={cliente?.email} />
              <Row
                icon={<MapPin size={12} />}
                value={[cliente?.direccion, cliente?.localidad, cliente?.provincia].filter(Boolean).join(', ') || null}
              />
              <Row icon={<CreditCard size={12} />} label="CUIT" value={cliente?.cuit} />
            </div>
          </div>

          {/* Saldo */}
          <div className="px-4 py-3 border-b border-border">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Saldo pendiente</p>
            <span
              className={cn(
                'text-base font-semibold',
                saldo > 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground',
              )}
            >
              {fmt(saldo)}
            </span>
          </div>

          {/* Últimos pedidos */}
          <div className="px-4 py-3 flex-1">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Últimos pedidos
            </p>
            {ultimosPedidos.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin pedidos</p>
            ) : (
              <div className="flex flex-col gap-2">
                {ultimosPedidos.map((p) => (
                  <Link
                    key={p.id}
                    href={`/crm/pedidos/${p.id}`}
                    className="flex flex-col gap-1 p-2 rounded-md border border-border hover:bg-accent transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{fmtFecha(p.fecha)}</span>
                      <span className="text-xs font-medium text-foreground">{fmt(p.total)}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', ESTADO_COLOR[p.estado] ?? 'bg-zinc-100 text-zinc-600')}>
                        {ESTADO_LABEL[p.estado] ?? p.estado}
                      </span>
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', PAGO_COLOR[p.estadoPago] ?? 'bg-zinc-100 text-zinc-600')}>
                        {PAGO_LABEL[p.estadoPago] ?? p.estadoPago}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Footer: link ficha completa */}
          {clienteId && (
            <div className="px-4 py-3 border-t border-border shrink-0">
              <Link
                href={`/crm/clientes/${clienteId}`}
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <ExternalLink size={12} />
                Ver ficha completa
              </Link>
            </div>
          )}
        </div>

        {/* Columna derecha: chat */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center gap-2 px-4 h-12 border-b border-border shrink-0">
            <ShoppingBag size={14} className="text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Conversación</span>
          </div>
          {effectiveConvId ? (
            <>
              <ChatFeed conversationId={effectiveConvId} />
              <ChatComposer conversationId={effectiveConvId} />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-muted-foreground">Sin conversación disponible.</p>
            </div>
          )}
        </div>
      </div>
    )

    if (embedded) {
      return (
        <div className="flex w-full h-full min-h-0 bg-background border-l border-border">
          {clienteInner}
        </div>
      )
    }
    return (
      <div className="fixed inset-y-0 right-0 flex z-40">
        <button className="fixed inset-0 bg-black/10 dark:bg-black/30" onClick={onClose} aria-label="Cerrar" />
        <div className="relative flex ml-auto w-[780px] max-w-full h-full bg-background border-l border-border shadow-md">
          {clienteInner}
        </div>
      </div>
    )
  }

  // Lead mode: original behavior
  const leadInner = isLoading ? (
    <div className="flex items-center justify-center w-full text-sm text-muted-foreground">
      Cargando...
    </div>
  ) : isError || !lead ? (
    <div className="flex flex-col items-center justify-center gap-3 w-full text-sm text-muted-foreground">
      <p>No se pudo cargar el lead (puede haber sido borrado).</p>
      <button
        onClick={() => {
          void queryClient.invalidateQueries({ queryKey: ['inbox'] })
          onClose()
        }}
        className="px-3 py-1.5 rounded-md border border-border text-xs hover:bg-accent transition-colors"
      >
        Cerrar
      </button>
    </div>
  ) : (
    <div className="flex w-full h-full overflow-hidden">
      {/* Columna izquierda: detalles del lead */}
      <div className="flex flex-col w-72 shrink-0 border-r border-border overflow-y-auto">
        <div className="flex items-center justify-between px-4 h-12 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar name={lead.contact.name} color="#6b7280" size="md" />
            <span className="text-sm font-semibold text-foreground truncate">
              {lead.contact.name}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors duration-100 shrink-0"
          >
            <X size={15} />
          </button>
        </div>

        {lead.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 px-4 py-2 border-b border-border">
            {lead.tags.map((tag) => (
              <TagBadge key={tag.id} tag={tag} />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Bot size={13} />
            <span>Bot IA</span>
          </div>
          <button
            onClick={toggleBot}
            className={cn(
              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-150',
              lead.botEnabled ? 'bg-primary' : 'bg-zinc-200 dark:bg-zinc-700',
            )}
          >
            <span
              className={cn(
                'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-150',
                lead.botEnabled ? 'translate-x-4' : 'translate-x-1',
              )}
            />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <LeadDetails lead={lead} />
          <ActivityLogPanel leadId={leadId!} />
        </div>
      </div>

      {/* Columna derecha: chat */}
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center gap-2 px-4 h-12 border-b border-border shrink-0">
          <span className="text-sm font-medium text-foreground">Conversación</span>
          {lead.botEnabled && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Bot size={11} />
              Bot activo
            </span>
          )}
        </div>

        {effectiveConvId ? (
          <>
            <ChatFeed conversationId={effectiveConvId} />
            <ChatComposer conversationId={effectiveConvId} leadId={leadId ?? undefined} />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Este lead no tiene conversación de WhatsApp.
            </p>
          </div>
        )}
      </div>
    </div>
  )

  if (embedded) {
    return (
      <div className="flex w-full h-full min-h-0 bg-background border-l border-border">
        {leadInner}
      </div>
    )
  }
  return (
    <div className="fixed inset-y-0 right-0 flex z-40">
      <button
        className="fixed inset-0 bg-black/10 dark:bg-black/30"
        onClick={onClose}
        aria-label="Cerrar"
      />
      <div className="relative flex ml-auto w-[780px] max-w-full h-full bg-background border-l border-border shadow-md">
        {leadInner}
      </div>
    </div>
  )
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label?: string
  value: string | null | undefined
}) {
  return (
    <div className="flex items-start gap-1.5 text-xs text-foreground">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0 break-words">
        {label && <span className="text-muted-foreground mr-1">{label}:</span>}
        {value ?? <span className="text-muted-foreground">—</span>}
      </span>
    </div>
  )
}
