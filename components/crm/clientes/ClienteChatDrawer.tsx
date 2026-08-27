'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, MessageCircle } from 'lucide-react'
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

/** true en md+ (≥768px), false en mobile, null hasta que se sabe (primer render). */
function useEsDesktop(): boolean | null {
  const [esDesktop, setEsDesktop] = useState<boolean | null>(null)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const actualizar = () => setEsDesktop(mq.matches)
    actualizar()
    mq.addEventListener('change', actualizar)
    return () => mq.removeEventListener('change', actualizar)
  }, [])
  return esDesktop
}

/**
 * Chat de WhatsApp del cliente sin salir de su ficha.
 *
 * En desktop se abre como panel deslizante a la derecha (LeadPanel en modo
 * cliente, con fondo oscurecido: click afuera, la X o Esc lo cierran). En
 * mobile ocupa toda la pantalla con un encabezado para volver. Al cerrarlo
 * la ficha sigue donde estaba.
 */
export default function ClienteChatDrawer({ clienteId, conversationId, nombre, telefono, user, onClose }: Props) {
  const esDesktop = useEsDesktop()

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

  if (esDesktop === null) return null

  if (esDesktop) {
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

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <button
          onClick={onClose}
          className="p-2 -ml-2 text-muted-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Volver a la ficha"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{nombre}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <MessageCircle size={11} className="text-green-600" />
            WhatsApp
          </p>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <LeadPanel
          tipo="cliente"
          clienteId={clienteId}
          conversationId={conversationId}
          nombre={nombre}
          contactPhone={telefono}
          onClose={onClose}
          user={user}
          mobileMode
        />
      </div>
    </div>
  )
}
