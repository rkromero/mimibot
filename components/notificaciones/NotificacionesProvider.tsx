'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from 'next-auth'
import { abrirConversacion, estaViendoConversacion } from '@/lib/inbox/conversacion-activa'
import { useInboxUnreadTotal } from '@/lib/inbox/use-unread-total'
import { useCrmEvents } from '@/lib/realtime/use-crm-events'
import { reproducirSonidoMensaje, sonidoActivado } from '@/lib/notificaciones/sonido'
import { sincronizarSuscripcionPush } from '@/lib/push/use-push'
import { NuevoMensajeCard, type AvisoMensaje } from './NuevoMensajeCard'

const ROLES_CON_INBOX = new Set(['admin', 'gerente', 'agent', 'vendedor', 'rtv'])
const MAX_TARJETAS = 3
const TITULO_BASE = 'ALIPRO CRM'

type EventoMensaje = {
  type: string
  conversationId?: string
  direction?: string
  contactName?: string
  preview?: string
}

/**
 * Avisos de mensajes nuevos con la app abierta:
 * - tarjeta abajo a la derecha (click → abre la conversación),
 * - sonido corto (configurable desde la campanita),
 * - contador de no leídos en el título de la pestaña,
 * - y recibe del service worker el click en una notificación push para
 *   navegar a la conversación sin recargar.
 */
export default function NotificacionesProvider({ user }: { user: Session['user'] }) {
  const habilitado = ROLES_CON_INBOX.has(user.role)
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const [avisos, setAvisos] = useState<AvisoMensaje[]>([])
  const unread = useInboxUnreadTotal(habilitado)

  const abrir = useCallback((conversationId: string) => {
    setAvisos((prev) => prev.filter((a) => a.conversationId !== conversationId))
    abrirConversacion(router, conversationId)
  }, [router])

  const cerrar = useCallback((id: string) => {
    setAvisos((prev) => prev.filter((a) => a.id !== id))
  }, [])

  // Stream SSE (compartido): mensajes entrantes → tarjeta + sonido
  const onEvento = useCallback((evento: Record<string, unknown>) => {
    const ev = evento as EventoMensaje
    if (ev.type !== 'new_message' || ev.direction !== 'inbound' || !ev.conversationId || !ev.preview) return
    void queryClient.invalidateQueries({ queryKey: ['inbox-no-leidos'] })
    if (estaViendoConversacion(ev.conversationId)) return

    const conversationId = ev.conversationId
    const contactName = ev.contactName || 'Mensaje nuevo'
    const preview = ev.preview
    setAvisos((prev) => {
      const existente = prev.find((a) => a.conversationId === conversationId)
      if (existente) {
        return prev.map((a) => a.conversationId === conversationId
          ? { ...a, preview, cantidad: a.cantidad + 1, recibidoAt: Date.now() }
          : a)
      }
      const nuevo: AvisoMensaje = {
        id: `${conversationId}-${Date.now()}`,
        conversationId,
        contactName,
        preview,
        cantidad: 1,
        recibidoAt: Date.now(),
      }
      return [...prev, nuevo].slice(-MAX_TARJETAS)
    })
    if (sonidoActivado()) reproducirSonidoMensaje()
  }, [queryClient])
  useCrmEvents(habilitado, onEvento)

  // Push: con el permiso ya dado, la suscripción se mantiene sola en cada
  // arranque (si el navegador la venció, se renueva y se registra de nuevo).
  // Así "Activar" se toca una sola vez por dispositivo.
  useEffect(() => {
    if (!habilitado) return
    void sincronizarSuscripcionPush()
  }, [habilitado])

  // Click en una notificación push con la app ya abierta
  useEffect(() => {
    if (!habilitado || typeof navigator === 'undefined' || !navigator.serviceWorker) return
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; conversationId?: string; url?: string } | undefined
      if (data?.type !== 'ABRIR_CONVERSACION') return
      if (data.conversationId) abrirConversacion(router, data.conversationId)
      else router.push(data.url ?? '/inbox')
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [habilitado, router])

  // Contador en el título de la pestaña
  const tituloRef = useRef<string | null>(null)
  useEffect(() => {
    if (!habilitado) return
    tituloRef.current ??= document.title || TITULO_BASE
    const base = tituloRef.current
    document.title = unread > 0 ? `(${unread}) ${base}` : base
    return () => {
      document.title = base
    }
  }, [habilitado, unread])

  // Al cambiar de página se limpian las tarjetas viejas
  useEffect(() => {
    setAvisos([])
  }, [pathname])

  if (!habilitado || avisos.length === 0) return null

  return (
    <div className="fixed bottom-[5.5rem] md:bottom-4 right-4 z-[290] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none">
      {avisos.map((a) => (
        <NuevoMensajeCard key={a.id} aviso={a} onAbrir={abrir} onCerrar={cerrar} />
      ))}
    </div>
  )
}
