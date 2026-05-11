'use client'

import { cn } from '@/lib/utils'

type Option<T extends string> = {
  key: T
  label: string
  count?: number
}

type Props<T extends string> = {
  options: Option<T>[]
  value: T
  onChange: (key: T) => void
  className?: string
}

export default function ChipFilter<T extends string>({
  options,
  value,
  onChange,
  className,
}: Props<T>) {
  return (
    <div className={cn('flex gap-2 overflow-x-auto scrollbar-hide px-1 py-1', className)}>
      {options.map((option) => {
        const isActive = option.key === value
        return (
          <button
            key={option.key}
            onClick={() => onChange(option.key)}
            className={cn(
              'shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-colors min-h-[44px]',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span className="text-xs opacity-75">({option.count})</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
