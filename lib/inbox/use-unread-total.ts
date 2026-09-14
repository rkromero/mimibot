'use client'

import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCrmEvents } from '@/lib/realtime/use-crm-events'

/**
 * Total de mensajes sin leer del inbox del usuario, para las burbujas del
 * menú (Sidebar y BottomNav) y la campanita. Vive actualizado sin F5:
 * - SSE (stream compartido): al llegar un mensaje nuevo se invalida y refetchea.
 * - ChatFeed invalida al marcar una conversación como leída.
 * - refetchInterval de red de seguridad por si el stream se corta.
 */
export function useInboxUnreadTotal(enabled: boolean): number {
  const queryClient = useQueryClient()

  const { data } = useQuery<number>({
    queryKey: ['inbox-unread'],
    queryFn: async () => {
      const res = await fetch('/api/inbox?soloNoLeidos=true')
      if (!res.ok) return 0
      const json = await res.json() as { total?: number }
      return json.total ?? 0
    },
    enabled,
    staleTime: 10_000,
    refetchInterval: 60_000,
  })

  const onEvento = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['inbox-unread'] })
  }, [queryClient])
  useCrmEvents(enabled, onEvento)

  return data ?? 0
}
