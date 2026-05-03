import type { Tag } from '@/types/db'
import { cn } from '@/lib/utils'

type Props = {
  tag: Tag
  className?: string
}

export default function TagBadge({ tag, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium',
        className,
      )}
      style={{
        backgroundColor: `${tag.color}20`,
        color: tag.color,
        border: `1px solid ${tag.color}40`,
      }}
    >
      {tag.name}
    </span>
  )
}
