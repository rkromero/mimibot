'use client'

import { CalendarClock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { todayStrAR, formatFechaAR } from '@/lib/dates'
import { estadoRecordatorio, etiquetaRecordatorio } from '@/lib/leads/recordatorio'

const COLOR = {
  vencido: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  hoy: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  proximo: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
} as const

type Props = {
  /** YYYY-MM-DD */
  fecha: string
  nota?: string | null
  className?: string
}

/** Chip del recordatorio de llamada (kanban e inbox): rojo vencido, ámbar hoy, celeste próximo. */
export default function RecordatorioChip({ fecha, nota, className }: Props) {
  const hoy = todayStrAR()
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap',
        COLOR[estadoRecordatorio(fecha, hoy)],
        className,
      )}
      title={`Llamar el ${formatFechaAR(fecha)}${nota ? ` · ${nota}` : ''}`}
    >
      <CalendarClock size={11} />
      {etiquetaRecordatorio(fecha, hoy)}
    </span>
  )
}
