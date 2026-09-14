'use client'

import { useEffect, useState } from 'react'
import { MessageSquare, X } from 'lucide-react'
import Avatar from '@/components/shared/Avatar'
import { cn } from '@/lib/utils'

export type AvisoMensaje = {
  id: string
  conversationId: string
  contactName: string
  preview: string
  /** Mensajes acumulados de esta conversación mientras la tarjeta está visible */
  cantidad: number
  recibidoAt: number
}

export const DURACION_TARJETA_MS = 6000

/**
 * Tarjeta de "mensaje nuevo" (abajo a la derecha en escritorio, arriba de la
 * barra inferior en el celular). Click → abre la conversación.
 */
export function NuevoMensajeCard({
  aviso,
  onAbrir,
  onCerrar,
}: {
  aviso: AvisoMensaje
  onAbrir: (conversationId: string) => void
  onCerrar: (id: string) => void
}) {
  const [saliendo, setSaliendo] = useState(false)

  // Cada mensaje nuevo de la misma conversación reinicia el tiempo
  useEffect(() => {
    setSaliendo(false)
    const t = setTimeout(() => setSaliendo(true), DURACION_TARJETA_MS - 200)
    const t2 = setTimeout(() => onCerrar(aviso.id), DURACION_TARJETA_MS)
    return () => {
      clearTimeout(t)
      clearTimeout(t2)
    }
  }, [aviso.id, aviso.cantidad, aviso.recibidoAt, onCerrar])

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={() => onAbrir(aviso.conversationId)}
      className={cn(
        'pointer-events-auto cursor-pointer select-none',
        'flex items-start gap-3 w-full rounded-xl border border-border bg-card text-card-foreground',
        'shadow-lg shadow-black/10 dark:shadow-black/40 px-3.5 py-3',
        'transition-all duration-200 hover:border-primary/40 hover:shadow-xl',
        saliendo ? 'opacity-0 translate-y-2' : 'animate-in slide-in-from-bottom-3 fade-in duration-200',
      )}
    >
      <div className="relative shrink-0">
        <Avatar name={aviso.contactName} color="#25D366" size="md" />
        <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center ring-2 ring-card">
          <MessageSquare size={9} strokeWidth={2.5} />
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold truncate">{aviso.contactName}</p>
          <span className="text-[11px] text-muted-foreground shrink-0">
            {aviso.cantidad > 1 ? `${aviso.cantidad} mensajes` : 'Ahora'}
          </span>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2 leading-snug mt-0.5">{aviso.preview}</p>
        <p className="text-xs font-medium text-primary mt-1.5">Responder →</p>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onCerrar(aviso.id)
        }}
        className="p-1 -mr-1 -mt-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label="Cerrar aviso"
      >
        <X size={14} />
      </button>
    </div>
  )
}
