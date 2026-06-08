'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Bot, Phone, ExternalLink } from 'lucide-react'
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

  // Cliente mode: minimal panel (no lead data needed)
  if (isClienteMode) {
    const displayName = nombre ?? 'Cliente'
    return (
      <div className="fixed inset-y-0 right-0 flex z-40">
        <button className="fixed inset-0 bg-black/10 dark:bg-black/30" onClick={onClose} aria-label="Cerrar" />
        <div className="relative flex ml-auto w-[780px] max-w-full h-full bg-background border-l border-border shadow-md">
          <div className="flex w-full h-full overflow-hidden">
            {/* Columna izquierda: datos del cliente */}
            <div className="flex flex-col w-72 shrink-0 border-r border-border overflow-y-auto">
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

              <div className="flex flex-col gap-3 px-4 py-4">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[11px] font-medium">
                    Cliente
                  </span>
                </div>
                {contactPhone && (
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <Phone size={13} className="text-muted-foreground shrink-0" />
                    <span>{contactPhone}</span>
                  </div>
                )}
                {clienteId && (
                  <Link
                    href={`/crm/clientes/${clienteId}`}
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <ExternalLink size={12} />
                    Ver ficha completa
                  </Link>
                )}
              </div>
            </div>

            {/* Columna derecha: chat */}
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex items-center gap-2 px-4 h-12 border-b border-border shrink-0">
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
        </div>
      </div>
    )
  }

  // Lead mode: original behavior
  return (
    <div className="fixed inset-y-0 right-0 flex z-40">
      <button
        className="fixed inset-0 bg-black/10 dark:bg-black/30"
        onClick={onClose}
        aria-label="Cerrar"
      />
      <div className="relative flex ml-auto w-[780px] max-w-full h-full bg-background border-l border-border shadow-md">
        {isLoading ? (
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
      )}
      </div>
    </div>
  )
}
