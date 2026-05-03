'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Bot, UserCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import Avatar from '@/components/shared/Avatar'
import LeadDetails from './LeadDetails'
import ActivityLogPanel from './ActivityLogPanel'
import ChatFeed from '@/components/chat/ChatFeed'
import ChatComposer from '@/components/chat/ChatComposer'
import TagBadge from '@/components/shared/TagBadge'
import type { LeadWithContact } from '@/types/db'
import type { Session } from 'next-auth'

type Props = {
  leadId: string
  onClose: () => void
  user: Session['user']
}

export default function LeadPanel({ leadId, onClose, user }: Props) {
  const queryClient = useQueryClient()

  const { data: lead, isLoading } = useQuery({
    queryKey: ['lead', leadId],
    queryFn: async () => {
      const res = await fetch(`/api/leads/${leadId}`)
      if (!res.ok) throw new Error('Error al cargar lead')
      const json = await res.json() as { data: LeadWithContact & { conversation?: { id: string } } }
      return json.data
    },
  })

  async function toggleBot() {
    if (!lead) return
    await fetch(`/api/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botEnabled: !lead.botEnabled }),
    })
    void queryClient.invalidateQueries({ queryKey: ['lead', leadId] })
  }

  return (
    <div className="fixed inset-y-0 right-0 flex z-40">
      {/* Overlay */}
      <button
        className="fixed inset-0 bg-black/10 dark:bg-black/30"
        onClick={onClose}
        aria-label="Cerrar"
      />

      {/* Panel */}
      <div className="relative flex ml-auto w-[780px] max-w-full h-full bg-background border-l border-border shadow-md animate-slide-in-right">
        {isLoading || !lead ? (
          <div className="flex items-center justify-center w-full text-sm text-muted-foreground">
            Cargando...
          </div>
        ) : (
          <div className="flex w-full h-full overflow-hidden">
            {/* Columna izquierda: detalles del lead */}
            <div className="flex flex-col w-72 shrink-0 border-r border-border overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between px-4 h-12 border-b border-border shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar
                    name={lead.contact.name}
                    color="#6b7280"
                    size="md"
                  />
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

              {/* Tags */}
              {lead.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 px-4 py-2 border-b border-border">
                  {lead.tags.map((tag) => (
                    <TagBadge key={tag.id} tag={tag} />
                  ))}
                </div>
              )}

              {/* Control del bot */}
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
                <ActivityLogPanel leadId={leadId} />
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

              {(lead as LeadWithContact & { conversation?: { id: string } }).conversation ? (
                <>
                  <ChatFeed conversationId={(lead as LeadWithContact & { conversation?: { id: string } }).conversation!.id} />
                  <ChatComposer
                    conversationId={(lead as LeadWithContact & { conversation?: { id: string } }).conversation!.id}
                    leadId={leadId}
                  />
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
