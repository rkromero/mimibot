'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Bot, MessageSquare } from 'lucide-react'
import { cn, relativeTime } from '@/lib/utils'
import Avatar from '@/components/shared/Avatar'
import LeadPanel from '@/components/lead/LeadPanel'
import QuickReplies from '@/components/chat/QuickReplies'
import type { Session } from 'next-auth'

type Filter = 'mine' | 'unassigned' | 'all'

type InboxItem = {
  conversationId: string
  leadId: string
  contactName: string
  contactPhone: string | null
  unreadCount: number
  lastMessageAt: string | null
  lastMessageBody: string | null
  lastMessageType: string | null
  assignedUserName: string | null
  assignedUserColor: string | null
  assignedUserId: string | null
  botEnabled: boolean
}

type Props = { user: Session['user'] }

export default function InboxView({ user }: Props) {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<Filter>('mine')
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'conversation'>('list')
  const [qrOpen, setQrOpen] = useState(false)

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['inbox', filter],
    queryFn: async () => {
      const res = await fetch(`/api/inbox?filter=${filter}`)
      if (!res.ok) throw new Error('Error al cargar inbox')
      const json = await res.json() as { data: InboxItem[] }
      return json.data
    },
    refetchOnWindowFocus: false,
    staleTime: 15_000,
  })

  // SSE para actualizar inbox en tiempo real
  useEffect(() => {
    const es = new EventSource('/api/realtime/stream')
    es.onmessage = () => {
      void queryClient.invalidateQueries({ queryKey: ['inbox'] })
    }
    return () => es.close()
  }, [queryClient])

  const totalUnread = items.reduce((sum, i) => sum + (i.unreadCount ?? 0), 0)

  function handleCloseLead() {
    setSelectedLeadId(null)
    setMobileView('list')
  }

  return (
    <div className="flex h-full">
      {/* Mobile conversation fullscreen — only visible on mobile when a conversation is open */}
      {mobileView === 'conversation' && selectedLeadId && (
        <div className="flex flex-col h-full md:hidden">
          {/* Mobile header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
            <button
              onClick={handleCloseLead}
              className="p-2 -ml-2 text-muted-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Volver"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground truncate">
                {items.find(i => i.leadId === selectedLeadId)?.contactName ?? '...'}
              </p>
            </div>
            <BotToggle
              leadId={selectedLeadId}
              botEnabled={items.find(i => i.leadId === selectedLeadId)?.botEnabled ?? false}
            />
            <button
              onClick={() => setQrOpen(true)}
              className="p-2 text-muted-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Respuestas rápidas"
            >
              <MessageSquare size={18} />
            </button>
          </div>
          {/* LeadPanel in conversation-only mode */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {/* mobileMode is a forward-compat prop for when LeadPanel gains mobile support */}
            <LeadPanel leadId={selectedLeadId} onClose={handleCloseLead} user={user} {...({ mobileMode: true } as object)} />
          </div>
        </div>
      )}

      {/* Lista de conversaciones */}
      <div
        className={cn(
          'flex flex-col border-r border-border',
          'w-full md:w-80 md:shrink-0',
          mobileView === 'conversation' ? 'hidden md:flex' : 'flex',
        )}
      >
        {/* Header + filtros */}
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-md font-semibold">Inbox</h1>
            {totalUnread > 0 && (
              <span className="text-xs font-medium text-primary-foreground bg-primary rounded-full px-1.5 py-0.5 min-w-[18px] text-center tabular-nums">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </div>
          <div className="flex gap-1">
            {([
              { key: 'mine' as Filter, label: 'Mis leads' },
              { key: 'unassigned' as Filter, label: 'Sin asignar' },
              { key: 'all' as Filter, label: 'Todos' },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-md transition-colors duration-100',
                  filter === key
                    ? 'bg-accent text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Conversaciones */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Cargando...
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-1">
              <p className="text-sm text-muted-foreground">No hay conversaciones.</p>
            </div>
          ) : (
            items.map((item) => (
              <button
                key={item.conversationId}
                onClick={() => {
                  setSelectedLeadId(item.leadId)
                  setMobileView('conversation')
                }}
                className={cn(
                  'w-full flex items-start gap-3 px-4 py-3 text-left border-b border-border',
                  'hover:bg-accent/50 transition-colors duration-100',
                  'min-h-[72px]',
                  selectedLeadId === item.leadId && 'bg-accent',
                  item.unreadCount > 0 && 'border-l-2 border-l-primary',
                )}
              >
                <Avatar
                  name={item.contactName}
                  color={item.assignedUserColor ?? '#6b7280'}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className={cn(
                      'text-sm truncate',
                      item.unreadCount > 0 ? 'font-semibold text-foreground' : 'font-medium text-foreground',
                    )}>
                      {item.contactName}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.unreadCount > 0 && (
                        <span className="text-xs font-medium text-primary-foreground bg-primary rounded-full px-1.5 min-w-[18px] text-center tabular-nums">
                          {item.unreadCount}
                        </span>
                      )}
                      {item.lastMessageAt && (
                        <span className="text-xs text-muted-foreground">
                          {relativeTime(item.lastMessageAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {previewMessage(item)}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Ficha del lead seleccionado — desktop only when a lead is selected */}
      <div className="hidden md:flex flex-1 min-w-0">
        {selectedLeadId ? (
          <LeadPanel
            leadId={selectedLeadId}
            onClose={() => setSelectedLeadId(null)}
            user={user}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Seleccioná una conversación.
          </div>
        )}
      </div>

      {/* Quick replies sheet */}
      <QuickReplies
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        onSelect={(text) => {
          void navigator.clipboard?.writeText(text)
          setQrOpen(false)
        }}
        leadNombre={items.find(i => i.leadId === selectedLeadId)?.contactName}
      />
    </div>
  )
}

function BotToggle({ leadId, botEnabled }: { leadId: string; botEnabled: boolean }) {
  const queryClient = useQueryClient()
  const [localEnabled, setLocalEnabled] = useState(botEnabled)

  async function toggle() {
    const newVal = !localEnabled
    setLocalEnabled(newVal) // optimistic update
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botEnabled: newVal }),
      })
      void queryClient.invalidateQueries({ queryKey: ['inbox'] })
    } catch {
      setLocalEnabled(!newVal) // revert on error
    }
  }

  return (
    <button
      onClick={toggle}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors min-h-[44px]',
        localEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
      )}
    >
      <Bot size={14} />
      {localEnabled ? 'Bot ON' : 'Bot OFF'}
    </button>
  )
}

function previewMessage(item: InboxItem): string {
  if (!item.lastMessageBody && !item.lastMessageType) return 'Sin mensajes'
  const type = item.lastMessageType
  if (type === 'image') return 'Imagen'
  if (type === 'audio') return 'Audio'
  if (type === 'video') return 'Video'
  if (type === 'document') return 'Documento'
  return item.lastMessageBody?.slice(0, 60) ?? ''
}
