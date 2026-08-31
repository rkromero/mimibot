'use client'

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

/**
 * Total de mensajes sin leer del inbox del usuario, para las burbujas del
 * menú (Sidebar y BottomNav). Vive actualizado sin F5:
 * - SSE: al llegar un mensaje nuevo se invalida y refetchea.
 * - ChatFeed invalida al marcar una conversación como leída.
 * - refetchInterval de red de seguridad por si el stream se corta.
 */
export function useInboxUnreadTotal(enabled: boolean): number {
  const queryClient = useQueryClient()

  const { data } = useQuery<number>({
    queryKey: ['inbox-unread'],
    queryFn: async () => {
      const res = await fetch('/api/inbox?filter=mine&soloNoLeidos=true')
      if (!res.ok) return 0
      const json = await res.json() as { total?: number }
      return json.total ?? 0
    },
    enabled,
    staleTime: 10_000,
    refetchInterval: 60_000,
  })

  useEffect(() => {
    if (!enabled) return
    const es = new EventSource('/api/realtime/stream')
    es.onmessage = () => {
      void queryClient.invalidateQueries({ queryKey: ['inbox-unread'] })
    }
    es.onerror = () => {}
    return () => es.close()
  }, [enabled, queryClient])

  return data ?? 0
}
