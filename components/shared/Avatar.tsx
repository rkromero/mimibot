import { initials } from '@/lib/utils'
import { cn } from '@/lib/utils'

type AvatarProps = {
  name: string
  color: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-7 h-7 text-xs',
  lg: 'w-9 h-9 text-sm',
}

export default function Avatar({ name, color, size = 'md', className }: AvatarProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full font-medium text-white select-none shrink-0',
        sizes[size],
        className,
      )}
      style={{ backgroundColor: color }}
      title={name}
    >
      {initials(name)}
    </span>
  )
}
