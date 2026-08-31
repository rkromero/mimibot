import { Check, CheckCheck, Clock, AlertCircle } from 'lucide-react'
import { cn, relativeTime } from '@/lib/utils'
import Avatar from '@/components/shared/Avatar'
import { tildeDe } from '@/lib/whatsapp/estado-mensaje'
import type { MessageWithAttachments } from '@/types/db'

export default function MessageBubble({ message }: { message: MessageWithAttachments }) {
  const isOutbound = message.direction === 'outbound'
  const isInternal = message.contentType === 'internal_note'

  if (isInternal) {
    return (
      <div className="flex justify-center">
        <div className="max-w-xs px-3 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50">
          <p className="text-xs text-amber-800 dark:text-amber-300">{message.body}</p>
          <p className="text-xs text-amber-600/70 dark:text-amber-500/70 mt-0.5">
            {relativeTime(message.sentAt)}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex items-end gap-2',
        isOutbound ? 'flex-row-reverse' : 'flex-row',
      )}
    >
      {/* Avatar del agente/bot si es outbound */}
      {isOutbound && message.sender && (
        <Avatar
          name={message.sender.name ?? 'Bot'}
          color={message.sender.avatarColor}
          size="sm"
        />
      )}

      <div
        className={cn(
          'max-w-[70%] flex flex-col gap-0.5',
          isOutbound ? 'items-end' : 'items-start',
        )}
      >
        {/* Etiqueta bot/agente */}
        {isOutbound && message.senderType === 'bot' && (
          <span className="text-xs text-muted-foreground px-1">Bot</span>
        )}

        <div
          className={cn(
            'px-3 py-2 rounded-lg text-sm leading-relaxed',
            isOutbound
              ? 'bg-primary text-primary-foreground rounded-br-sm'
              : 'bg-zinc-100 dark:bg-zinc-800 text-foreground rounded-bl-sm',
          )}
        >
          {message.contentType === 'text' || message.contentType === 'internal_note' ? (
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
          ) : message.contentType === 'template' && message.body ? (
            <>
              {/* Plantilla aprobada de Meta: el cuerpo guardado ya tiene las variables resueltas */}
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
              <p className="text-[10px] uppercase tracking-wide opacity-70 mt-1">Plantilla</p>
            </>
          ) : message.body ? (
            <>
              {/* Media con texto: p. ej. transcripción automática de una nota de voz */}
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
              {message.contentType === 'audio' && (
                <p className="text-[10px] uppercase tracking-wide opacity-70 mt-1">Transcripción automática</p>
              )}
            </>
          ) : message.attachments.length === 0 ? (
            <p className="text-xs italic opacity-80">
              [{contentTypeLabel(message.contentType)}]
            </p>
          ) : null}

          {message.attachments.length > 0 && (
            <div className="mt-1.5 space-y-1">
              {message.attachments.map((att) => (
                <AttachmentThumb key={att.id} mimeType={att.mimeType} r2Key={att.r2Key} />
              ))}
            </div>
          )}
        </div>

        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground px-1">
          {relativeTime(message.sentAt)}
          {isOutbound && <span title={tildeDe(message).label}><Tildes message={message} /></span>}
        </span>
      </div>
    </div>
  )
}

/** Tildes de WhatsApp: reloj (pendiente), ✓ enviado, ✓✓ entregado, ✓✓ azul leído, ! fallido. */
function Tildes({ message }: { message: MessageWithAttachments }) {
  const t = tildeDe(message)
  const common = 'shrink-0'
  if (t.fallo) return <AlertCircle size={13} className={cn(common, 'text-destructive')} aria-label={t.label} />
  if (t.cantidad === 0) return <Clock size={12} className={cn(common, 'opacity-70')} aria-label={t.label} />
  if (t.cantidad === 1) return <Check size={13} className={common} aria-label={t.label} />
  return (
    <CheckCheck
      size={13}
      className={cn(common, t.leido ? 'text-sky-500 dark:text-sky-400' : '')}
      aria-label={t.label}
    />
  )
}

function contentTypeLabel(type: string): string {
  const map: Record<string, string> = {
    image: 'imagen',
    audio: 'audio',
    video: 'video',
    document: 'documento',
    template: 'plantilla',
  }
  return map[type] ?? type
}

function AttachmentThumb({ mimeType, r2Key }: { mimeType: string; r2Key: string }) {
  const src = `/api/attachments/url?key=${encodeURIComponent(r2Key)}`

  if (mimeType.startsWith('image/')) {
    return (
      <img
        src={src}
        alt="adjunto"
        className="max-w-[200px] rounded-md"
        loading="lazy"
      />
    )
  }

  if (mimeType.startsWith('audio/')) {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <audio controls preload="metadata" src={src} className="max-w-[240px]" />
    )
  }

  if (mimeType.startsWith('video/')) {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video controls preload="metadata" className="max-w-[240px] rounded-md">
        <source src={src} type={mimeType} />
      </video>
    )
  }

  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="text-xs underline opacity-80"
    >
      Ver archivo
    </a>
  )
}
