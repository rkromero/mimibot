import { cn } from '@/lib/utils'

type Props = {
  grado: string | null | undefined
  score?: number | null
  /** Muestra "Grado A · 11/14" en vez de solo la letra */
  conTexto?: boolean
  className?: string
}

const ESTILO: Record<string, string> = {
  A: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  B: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  C: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
}

/** Grado A/B/C que el bot calculó al calificar el lead. No se muestra si no hay grado. */
export default function GradoBadge({ grado, score, conTexto = false, className }: Props) {
  if (!grado) return null
  const g = grado.toUpperCase()
  const title = `Calificación del bot: grado ${g}${score != null ? ` (${score}/14)` : ''}`
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center justify-center rounded-full font-semibold shrink-0',
        conTexto ? 'px-2 py-0.5 text-[11px]' : 'h-4 min-w-4 px-1 text-[10px]',
        ESTILO[g] ?? ESTILO['C'],
        className,
      )}
    >
      {conTexto ? `Grado ${g}${score != null ? ` · ${score}/14` : ''}` : g}
    </span>
  )
}
