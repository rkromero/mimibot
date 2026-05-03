'use client'

import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import MessageBubble from './MessageBubble'
import type { MessageWithAttachments } from '@/types/db'

export default function ChatFeed({ conversationId }: { conversationId: string }) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const { data: messages, isLoading } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      const res = await fetch(`/api/conversations/${conversationId}/messages`)
      if (!res.ok) throw new Error('Error al cargar mensajes')
      const json = await res.json() as { data: MessageWithAttachments[] }
      return json.data
    },
    staleTime: 10_000,
  })

  // Marcar como leído al abrir
  useEffect(() => {
    void fetch(`/api/conversations/${conversationId}/read`, { method: 'POST' })
  }, [conversationId])

  // SSE: invalidar cuando llega un mensaje nuevo a esta conversación
  useEffect(() => {
    const es = new EventSource('/api/realtime/stream')
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data as string) as { type: string; conversationId?: string }
        if (event.type === 'new_message' && event.conversationId === conversationId) {
          void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
        }
      } catch {}
    }
    return () => es.close()
  }, [conversationId, queryClient])

  // Scroll al fondo cuando llegan mensajes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages?.length])

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Cargando mensajes...
      </div>
    )
  }

  if (!messages?.length) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        No hay mensajes aún.
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
