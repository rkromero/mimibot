'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Bell, BellOff, BellRing, Volume2, VolumeX, Smartphone, Loader2 } from 'lucide-react'
import Avatar from '@/components/shared/Avatar'
import { cn, relativeTime } from '@/lib/utils'
import { useInboxUnreadTotal } from '@/lib/inbox/use-unread-total'
import { previewMensaje } from '@/lib/push/aviso'
import { abrirConversacion } from '@/lib/inbox/conversacion-activa'
import { usePush, type EstadoPush } from '@/lib/push/use-push'
import { setSonidoActivado, sonidoActivado } from '@/lib/notificaciones/sonido'

type NoLeido = {
  conversationId: string
  nombre: string
  unreadCount: number
  lastMessageAt: string | null
  lastMessageBody: string | null
  lastMessageType: string | null
  assignedUserColor: string | null
}

/**
 * Campanita de notificaciones: contador de no leídos, lista de conversaciones
 * pendientes (click → abre la conversación) y, al pie, activación del push
 * en este dispositivo y el sonido.
 */
export default function NotificacionesBell({ className }: { className?: string }) {
  const [abierto, setAbierto] = useState(false)
  const unread = useInboxUnreadTotal(true)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [abierto])

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setAbierto((o) => !o)}
        className="relative p-1 text-muted-foreground hover:text-foreground transition-colors"
        title="Notificaciones"
        aria-label={unread > 0 ? `Notificaciones: ${unread} mensajes sin leer` : 'Notificaciones'}
        aria-expanded={abierto}
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold leading-4 text-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {abierto && <Panel onCerrar={() => setAbierto(false)} />}
    </div>
  )
}

function Panel({ onCerrar }: { onCerrar: () => void }) {
  const router = useRouter()
  const { data = [], isLoading } = useQuery<NoLeido[]>({
    queryKey: ['inbox-no-leidos'],
    queryFn: async () => {
      const res = await fetch('/api/inbox?noLeidos=true&limit=30')
      if (!res.ok) return []
      const json = (await res.json()) as { data: NoLeido[] }
      return json.data
    },
    staleTime: 5_000,
  })

  const abrir = (id: string) => {
    onCerrar()
    abrirConversacion(router, id)
  }

  return (
    <div
      role="dialog"
      aria-label="Notificaciones"
      className={cn(
        'fixed z-[280] bg-card border border-border rounded-xl shadow-xl flex flex-col overflow-hidden',
        'inset-x-2 top-14 max-h-[75vh]',
        'md:absolute md:inset-auto md:top-full md:left-0 md:mt-2 md:w-[360px] md:max-h-[70vh]',
        'animate-in fade-in slide-in-from-top-1 duration-150',
      )}
    >
      <div className="flex items-center justify-between px-4 h-11 border-b border-border shrink-0">
        <p className="text-sm font-semibold">Notificaciones</p>
        {data.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {data.length === 1 ? '1 conversación' : `${data.length} conversaciones`}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-1.5 text-center px-6">
            <BellOff size={22} className="text-muted-foreground/60" />
            <p className="text-sm font-medium">Estás al día</p>
            <p className="text-xs text-muted-foreground">No tenés mensajes sin leer.</p>
          </div>
        ) : (
          data.map((c) => (
            <button
              key={c.conversationId}
              type="button"
              onClick={() => abrir(c.conversationId)}
              className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-accent/60 transition-colors border-b border-border/60 last:border-b-0"
            >
              <Avatar name={c.nombre} color={c.assignedUserColor ?? '#6b7280'} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold truncate">{c.nombre}</span>
                  {c.lastMessageAt && (
                    <span className="text-[11px] text-muted-foreground shrink-0">{relativeTime(c.lastMessageAt)}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {previewMensaje(c.lastMessageType ?? 'text', c.lastMessageBody)}
                </p>
              </div>
              <span className="mt-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold leading-[18px] text-center shrink-0">
                {c.unreadCount}
              </span>
            </button>
          ))
        )}
      </div>

      <PieConfiguracion />
    </div>
  )
}

const TEXTO_ESTADO: Record<EstadoPush, string> = {
  cargando: 'Verificando…',
  'no-soportado': 'Este navegador no soporta notificaciones push.',
  'ios-sin-instalar': 'En iPhone, primero agregá la app a la pantalla de inicio (Compartir → Agregar a inicio) y activalas desde ahí.',
  bloqueado: 'Bloqueadas en el navegador. Permitilas desde el candado de la barra de direcciones (o Ajustes del sitio) y volvé a intentar.',
  inactivo: 'Recibí un aviso en este dispositivo cada vez que llega un mensaje, aunque la app esté cerrada.',
  activo: 'Este dispositivo recibe avisos de mensajes nuevos.',
}

function PieConfiguracion() {
  const push = usePush()
  const [sonido, setSonido] = useState(true)
  useEffect(() => {
    setSonido(sonidoActivado())
  }, [])

  const toggleSonido = () => {
    const next = !sonido
    setSonido(next)
    setSonidoActivado(next)
  }

  const puedeActivar = push.estado === 'inactivo'
  const activo = push.estado === 'activo'

  return (
    <div className="border-t border-border bg-muted/40 px-4 py-3 space-y-2.5 shrink-0">
      <div className="flex items-start gap-2.5">
        <Smartphone size={15} className={cn('mt-0.5 shrink-0', activo ? 'text-green-600' : 'text-muted-foreground')} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium">Avisos en este dispositivo</p>
            {(puedeActivar || activo) && (
              <button
                type="button"
                disabled={push.ocupado}
                onClick={() => (activo ? push.desactivar() : push.activar())}
                className={cn(
                  'text-xs font-medium px-2.5 py-1 rounded-md transition-colors disabled:opacity-60',
                  activo
                    ? 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90',
                )}
              >
                {push.ocupado ? 'Un momento…' : activo ? 'Desactivar' : 'Activar'}
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
            {push.error ?? TEXTO_ESTADO[push.estado]}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={toggleSonido}
        className="w-full flex items-center gap-2.5 text-left group"
        aria-pressed={sonido}
      >
        {sonido ? (
          <Volume2 size={15} className="text-muted-foreground group-hover:text-foreground shrink-0" />
        ) : (
          <VolumeX size={15} className="text-muted-foreground group-hover:text-foreground shrink-0" />
        )}
        <span className="flex-1 text-xs font-medium">Sonido al llegar un mensaje</span>
        <span
          className={cn(
            'relative inline-flex h-4 w-7 rounded-full transition-colors',
            sonido ? 'bg-primary' : 'bg-muted-foreground/30',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform',
              sonido ? 'translate-x-3.5' : 'translate-x-0.5',
            )}
          />
        </span>
      </button>

      {activo && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <BellRing size={11} /> Tocá una notificación para ir directo a la conversación.
        </p>
      )}
    </div>
  )
}
