'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import LeadCard from './LeadCard'
import ColumnaCerradaStat from './ColumnaCerradaStat'
import type { PipelineStage, LeadWithContact } from '@/types/db'
import type { LeadFilters } from '@/lib/validations/lead'
import { cn } from '@/lib/utils'

export type ColumnPage = {
  data: LeadWithContact[]
  hasMore: boolean
  total: number
  nextCursor: string | null
}

type Props = {
  stage: PipelineStage
  filters: LeadFilters
  onLeadClick: (id: string) => void
  isTargetColumn?: boolean
}

export default function KanbanColumn({ stage, filters, onLeadClick, isTargetColumn }: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
    data: { type: 'column', stageId: stage.id },
  })

  const filtersKey = JSON.stringify(filters)

  const query = useInfiniteQuery<ColumnPage>({
    queryKey: ['leads-col', stage.id, filtersKey],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams()
      params.set('stageId', stage.id)
      params.set('limit', '20')
      if (filters.agentId) params.set('agentId', filters.agentId)
      if (filters.source) params.set('source', filters.source)
      if (filters.search) params.set('search', filters.search)
      if (typeof pageParam === 'string') params.set('cursor', pageParam)
      const res = await fetch(`/api/leads?${params.toString()}`)
      if (!res.ok) throw new Error('Error al cargar leads')
      return res.json() as Promise<ColumnPage>
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  const leads = query.data?.pages.flatMap((p) => p.data) ?? []
  const total = query.data?.pages[0]?.total ?? 0

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col w-64 shrink-0 border-r border-border transition-colors duration-100',
        (isOver || isTargetColumn) && 'bg-primary/5 ring-1 ring-inset ring-primary/20',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-10 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
          <span className="text-sm font-medium text-foreground truncate">{stage.name}</span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {query.isLoading ? '...' : total}
        </span>
      </div>

      {/* Cards — columnas terminales muestran el contador del mes; el resto, los leads */}
      <div
        className={cn(
          'flex-1 min-h-[4rem]',
          stage.isTerminal
            ? 'flex items-center justify-center py-4'
            : 'overflow-y-auto py-2 px-2 space-y-1.5',
        )}
      >
        {stage.isTerminal ? (
          <ColumnaCerradaStat tipo={stage.isWon ? 'ganado' : 'perdido'} />
        ) : query.isLoading ? (
          <div className="space-y-1.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
            {leads.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No hay leads en esta etapa.</p>
            ) : (
              leads.map((lead) => (
                <LeadCard key={lead.id} lead={lead} onClick={() => onLeadClick(lead.id)} />
              ))
            )}
          </SortableContext>
        )}
      </div>

      {/* Footer: load more */}
      {query.hasNextPage && (
        <div className="px-3 py-2 border-t border-border shrink-0">
          <button
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {query.isFetchingNextPage
              ? 'Cargando...'
              : `Mostrando ${leads.length} de ${total} · Ver más`}
          </button>
        </div>
      )}
    </div>
  )
}
