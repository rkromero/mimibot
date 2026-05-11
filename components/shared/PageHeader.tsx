import { cn } from '@/lib/utils'

type Props = {
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
}

export default function PageHeader({ title, description, actions, className }: Props) {
  return (
    <div className={cn('flex items-start justify-between gap-4 mb-6', className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-foreground truncate">{title}</h1>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  )
}
