'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn, relativeTime, formatPhone } from '@/lib/utils'
import Avatar from '@/components/shared/Avatar'
import TagBadge from '@/components/shared/TagBadge'
import type { LeadWithContact } from '@/types/db'

type Props = {
  lead: LeadWithContact
  onClick?: () => void
  isDragging?: boolean
}

function messagePreview(lead: LeadWithContact): string {
  if (!lead.lastMessage) return 'Sin mensajes'
  const { body, contentType } = lead.lastMessage
  if (contentType === 'image') return 'Imagen'
  if (contentType === 'audio') return 'Audio'
  if (contentType === 'video') return 'Video'
  if (contentType === 'document') return 'Documento'
  return body?.slice(0, 60) ?? ''
}

export default function LeadCard({ lead, onClick, isDragging }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging } =
    useSortable({ id: lead.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        'group relative flex flex-col gap-1.5 px-3 py-2.5 rounded-md border bg-card cursor-pointer',
        'border-border hover:border-zinc-300 dark:hover:border-zinc-700',
        'transition-colors duration-100',
        (isDragging || isSortableDragging) && 'opacity-40 shadow-md',
        lead.unreadCount > 0 && 'border-l-2 border-l-primary',
      )}
    >
      {/* Nombre + tiempo */}
      <div className="flex items-start justify-between gap-1">
        <span className="text-sm font-medium text-foreground leading-tight truncate">
          {lead.contact.name}
        </span>
        {lead.lastMessage?.sentAt && (
          <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
            {relativeTime(lead.lastMessage.sentAt)}
          </span>
        )}
      </div>

      {/* Teléfono */}
      {lead.contact.phone && (
        <span className="text-xs text-muted-foreground">
          {formatPhone(lead.contact.phone)}
        </span>
      )}

      {/* Último mensaje */}
      <p className="text-xs text-muted-foreground leading-snug line-clamp-2">
        {messagePreview(lead)}
      </p>

      {/* Footer: agente + tags + no leídos */}
      <div className="flex items-center justify-between gap-1 mt-0.5">
        <div className="flex items-center gap-1 flex-wrap">
          {lead.tags.slice(0, 3).map((tag) => (
            <TagBadge key={tag.id} tag={tag} />
          ))}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {lead.unreadCount > 0 && (
            <span className="text-xs font-medium text-primary-foreground bg-primary rounded-full px-1.5 py-0.5 min-w-[18px] text-center tabular-nums">
              {lead.unreadCount > 99 ? '99+' : lead.unreadCount}
            </span>
          )}
          {lead.assignedUser && (
            <Avatar
              name={lead.assignedUser.name ?? '?'}
              color={lead.assignedUser.avatarColor}
              size="sm"
            />
          )}
        </div>
      </div>
    </div>
  )
}
