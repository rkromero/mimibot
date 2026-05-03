import { cn, relativeTime } from '@/lib/utils'
import Avatar from '@/components/shared/Avatar'
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
          ) : (
            <p className="text-xs italic opacity-80">
              [{contentTypeLabel(message.contentType)}]
            </p>
          )}

          {message.attachments.length > 0 && (
            <div className="mt-1.5 space-y-1">
              {message.attachments.map((att) => (
                <AttachmentThumb key={att.id} mimeType={att.mimeType} r2Key={att.r2Key} />
              ))}
            </div>
          )}
        </div>

        <span className="text-xs text-muted-foreground px-1">
          {relativeTime(message.sentAt)}
        </span>
      </div>
    </div>
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
  if (mimeType.startsWith('image/')) {
    return (
      <img
        src={`/api/attachments/url?key=${encodeURIComponent(r2Key)}`}
        alt="adjunto"
        className="max-w-[200px] rounded-md"
        loading="lazy"
      />
    )
  }
  return (
    <a
      href={`/api/attachments/url?key=${encodeURIComponent(r2Key)}`}
      target="_blank"
      rel="noreferrer"
      className="text-xs underline opacity-80"
    >
      Ver archivo
    </a>
  )
}
