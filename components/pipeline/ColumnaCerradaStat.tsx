'use client'

import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { labelMotivoPerdida } from '@/lib/leads/motivos-perdida'

type PipelineStats = {
  ganadoMes: number
  perdidoMes: number
  perdidosPorMotivo?: Array<{ motivo: string | null; count: number }>
}

type Props = {
  tipo: 'ganado' | 'perdido'
}

/**
 * Muestra el conteo de leads cerrados del mes en curso para la columna terminal.
 * Se usa en las columnas "Cerrado Ganado" y "Cerrado Perdido".
 *
 * El queryKey ['pipeline-stats'] es compartido entre ambas columnas → una sola
 * petición para las dos. Se invalida desde KanbanBoard tras un drop exitoso.
 */
export default function ColumnaCerradaStat({ tipo }: Props) {
  const { data, isLoading } = useQuery<PipelineStats>({
    queryKey: ['pipeline-stats'],
    queryFn: async () => {
      const res = await fetch('/api/pipeline/stats')
      if (!res.ok) throw new Error('Error al cargar estadísticas')
      return res.json() as Promise<PipelineStats>
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const count = tipo === 'ganado' ? (data?.ganadoMes ?? 0) : (data?.perdidoMes ?? 0)
  const label = tipo === 'ganado' ? 'ganados este mes' : 'perdidos este mes'

  return (
    <div className="flex flex-col items-center justify-center gap-2 w-full">
      {isLoading ? (
        <div className="h-16 w-16 rounded-full bg-muted animate-pulse" />
      ) : (
        <>
          <span
            className={cn(
              'text-6xl font-bold tabular-nums leading-none',
              tipo === 'ganado'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-400/70 dark:text-rose-500/60',
            )}
          >
            {count}
          </span>
          <span className="text-xs text-muted-foreground">{label}</span>
          {tipo === 'perdido' && (data?.perdidosPorMotivo?.length ?? 0) > 0 && (
            <ul className="mt-1 w-full max-w-[13rem] space-y-0.5 text-[11px] text-muted-foreground">
              {data!.perdidosPorMotivo!.map((m) => (
                <li key={m.motivo ?? 'sin'} className="flex justify-between gap-2">
                  <span className="truncate">{labelMotivoPerdida(m.motivo)}</span>
                  <span className="tabular-nums shrink-0">{m.count}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
