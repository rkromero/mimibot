'use client'

import { useEffect } from 'react'
import type { Session } from 'next-auth'
import LeadPanel from '@/components/lead/LeadPanel'

type Props = {
  clienteId: string
  conversationId: string
  nombre: string
  telefono: string | null
  user: Session['user']
  onClose: () => void
}

/**
 * Chat de WhatsApp del cliente sin salir de su ficha.
 *
 * Desktop: panel deslizante a la derecha (LeadPanel en modo cliente, con
 * fondo oscurecido: click afuera, la X o Esc lo cierran; el panel de
 * respuestas rápidas va adentro, con el botón ⚡ de la cabecera). En el
 * celular LeadPanel detecta el viewport y pasa solo a pantalla completa con
 * cabecera para volver y ⚡. Al cerrarlo la ficha sigue donde estaba.
 */
export default function ClienteChatDrawer({ clienteId, conversationId, nombre, telefono, user, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Que no se desplace la ficha de fondo mientras el chat está abierto
  useEffect(() => {
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previo
    }
  }, [])

  return (
    <LeadPanel
      tipo="cliente"
      clienteId={clienteId}
      conversationId={conversationId}
      nombre={nombre}
      contactPhone={telefono}
      onClose={onClose}
      user={user}
    />
  )
}
