'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
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
  tipo: 'cliente' | 'lead'
  leadId: string | null
  clienteId: string | null
  nombre: string
  contactPhone: string | null
  unreadCount: number
  lastMessageAt: string | null
  lastMessageBody: string | null
  lastMessageType: string | null
  assignedUserName: string | null
  assignedUserColor: string | null
  assignedUserId: string | null
  botEnabled: boolean | null
}

type Props = { user: Session['user'] }

export default function InboxView({ user }: Props) {
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const initConvId = searchParams.get('conversation')
  const initLeadId = searchParams.get('lead') // backwards compat

  const isRestrictedRole = user.role === 'agent' || user.role === 'vendedor'

  const [selectedConvId, setSelectedConvId] = useState<string | null>(initConvId)
  const [filter, setFilter] = useState<Filter>('mine')
  const [mobileView, setMobileView] = useState<'list' | 'conversation'>(
    initConvId ?? initLeadId ? 'conversation' : 'list',
  )
  const [qrOpen, setQrOpen] = useState(false)

  const fetchFilter = async (f: Filter): Promise<InboxItem[]> => {
    const res = await fetch(`/api/inbox?filter=${f}`)
    if (!res.ok) throw new Error('Error al cargar inbox')
    const json = await res.json() as { data: InboxItem[] }
    return json.data
  }

  const { data: mineData = [], isLoading: loadingMine } = useQuery({
    queryKey: ['inbox', 'mine'],
    queryFn: () => fetchFilter('mine'),
    refetchOnWindowFocus: false,
    staleTime: 15_000,
  })
  const { data: unassignedData = [], isLoading: loadingUnassigned } = useQuery({
    queryKey: ['inbox', 'unassigned'],
    queryFn: () => fetchFilter('unassigned'),
    refetchOnWindowFocus: false,
    staleTime: 15_000,
    enabled: !isRestrictedRole,
  })
  const { data: allData = [], isLoading: loadingAll } = useQuery({
    queryKey: ['inbox', 'all'],
    queryFn: () => fetchFilter('all'),
    refetchOnWindowFocus: false,
    staleTime: 15_000,
    enabled: !isRestrictedRole,
  })

  const dataMap: Record<Filter, InboxItem[]> = { mine: mineData, unassigned: unassignedData, all: allData }
  const items = dataMap[filter]
  const isLoading = loadingMine || loadingUnassigned || loadingAll
  const counts: Record<Filter, number> = { mine: mineData.length, unassigned: unassignedData.length, all: allData.length }

  // Backwards compat: ?lead= → find the conversation in the list once loaded
  useEffect(() => {
    if (initLeadId && !initConvId && !selectedConvId) {
      const all = [...mineData, ...unassignedData, ...allData]
      const match = all.find((i) => i.leadId === initLeadId)
      if (match) setSelectedConvId(match.conversationId)
    }
  }, [mineData, unassignedData, allData, initLeadId, initConvId, selectedConvId])

  // SSE para actualizar inbox en tiempo real
  useEffect(() => {
    const es = new EventSource('/api/realtime/stream')
    es.onmessage = () => {
      void queryClient.invalidateQueries({ queryKey: ['inbox'] })
    }
    return () => es.close()
  }, [queryClient])

  const allLoadedItems = [...mineData, ...unassignedData, ...allData]
  const selectedItem = selectedConvId
    ? (allLoadedItems.find((i) => i.conversationId === selectedConvId) ?? null)
    : null

  const totalUnread = items.reduce((sum, i) => sum + (i.unreadCount ?? 0), 0)
  const formatCount = (n: number) => (n > 99 ? '99+' : String(n))

  function handleCloseConversation() {
    setSelectedConvId(null)
    setMobileView('list')
  }

  return (
    <div className="flex h-full">
      {/* Mobile conversation fullscreen */}
      {mobileView === 'conversation' && selectedConvId && (
        <div className="flex flex-col w-full h-full md:hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
            <button
              onClick={handleCloseConversation}
              className="p-2 -ml-2 text-muted-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Volver"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground truncate">
                {selectedItem?.nombre ?? '...'}
              </p>
            </div>
            {selectedItem?.tipo === 'lead' && selectedItem.leadId && (
              <BotToggle
                leadId={selectedItem.leadId}
                botEnabled={selectedItem.botEnabled ?? false}
              />
            )}
            <button
              onClick={() => setQrOpen(true)}
              className="p-2 text-muted-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Respuestas rápidas"
            >
              <MessageSquare size={18} />
            </button>
          </div>
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="flex-1 min-h-0 overflow-hidden">
              <LeadPanel
                conversationId={selectedConvId}
                tipo={selectedItem?.tipo ?? 'lead'}
                leadId={selectedItem?.leadId}
                clienteId={selectedItem?.clienteId}
                nombre={selectedItem?.nombre}
                contactPhone={selectedItem?.contactPhone}
                onClose={handleCloseConversation}
                user={user}
                mobileMode
              />
            </div>
            <div className="shrink-0" style={{ height: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))' }} aria-hidden="true" />
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
              { key: 'mine' as Filter, label: 'Mis conversaciones' },
              { key: 'unassigned' as Filter, label: 'Sin asignar' },
              { key: 'all' as Filter, label: 'Todos' },
            ] as const).filter(({ key }) => isRestrictedRole ? key === 'mine' : true).map(({ key, label }) => {
              const isActive = filter === key
              return (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={cn(
                    'flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-colors duration-100',
                    isActive
                      ? 'bg-accent text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                  )}
                >
                  {label}
                  <span
                    className={cn(
                      'ml-0.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-medium tabular-nums',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {formatCount(counts[key])}
                  </span>
                </button>
              )
            })}
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
                  setSelectedConvId(item.conversationId)
                  setMobileView('conversation')
                }}
                className={cn(
                  'w-full flex items-start gap-3 px-4 py-3 text-left border-b border-border',
                  'hover:bg-accent/50 transition-colors duration-100',
                  'min-h-[72px]',
                  selectedConvId === item.conversationId && 'bg-accent',
                  item.unreadCount > 0 && 'border-l-2 border-l-primary',
                )}
              >
                <Avatar
                  name={item.nombre}
                  color={item.assignedUserColor ?? '#6b7280'}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className={cn(
                        'text-sm truncate',
                        item.unreadCount > 0 ? 'font-semibold text-foreground' : 'font-medium text-foreground',
                      )}>
                        {item.nombre}
                      </span>
                      <span className={cn(
                        'shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                        item.tipo === 'cliente'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                      )}>
                        {item.tipo === 'cliente' ? 'Cliente' : 'Lead'}
                      </span>
                    </div>
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

      {/* Panel de conversación — desktop */}
      <div className="hidden md:flex flex-1 min-w-0">
        {selectedConvId ? (
          <LeadPanel
            conversationId={selectedConvId}
            tipo={selectedItem?.tipo ?? 'lead'}
            leadId={selectedItem?.leadId}
            clienteId={selectedItem?.clienteId}
            nombre={selectedItem?.nombre}
            contactPhone={selectedItem?.contactPhone}
            onClose={() => setSelectedConvId(null)}
            user={user}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Seleccioná una conversación.
          </div>
        )}
      </div>

      <QuickReplies
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        onSelect={(text) => {
          void navigator.clipboard?.writeText(text)
          setQrOpen(false)
        }}
        leadNombre={selectedItem?.nombre}
      />
    </div>
  )
}

function BotToggle({ leadId, botEnabled }: { leadId: string; botEnabled: boolean }) {
  const queryClient = useQueryClient()
  const [localEnabled, setLocalEnabled] = useState(botEnabled)

  async function toggle() {
    const newVal = !localEnabled
    setLocalEnabled(newVal)
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botEnabled: newVal }),
      })
      void queryClient.invalidateQueries({ queryKey: ['inbox'] })
    } catch {
      setLocalEnabled(!newVal)
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
