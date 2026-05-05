'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import LeadCard from './LeadCard'
import type { PipelineStage, LeadWithContact } from '@/types/db'
import { cn } from '@/lib/utils'

type Props = {
  stage: PipelineStage
  leads: LeadWithContact[]
  onLeadClick: (id: string) => void
}

export default function KanbanColumn({ stage, leads, onLeadClick }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })

  return (
    <div
      className={cn(
        'flex flex-col w-64 shrink-0 border-r border-border transition-colors duration-100',
        isOver && 'bg-primary/5 ring-1 ring-inset ring-primary/20',
      )}
    >
      {/* Header de columna */}
      <div className="flex items-center justify-between px-3 h-10 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: stage.color }}
          />
          <span className="text-sm font-medium text-foreground truncate">
            {stage.name}
          </span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {leads.length}
        </span>
      </div>

      {/* Cards */}
      <div
        ref={setNodeRef}
        className="flex-1 overflow-y-auto py-2 px-2 space-y-1.5 min-h-[4rem]"
      >
        <SortableContext
          items={leads.map((l) => l.id)}
          strategy={verticalListSortingStrategy}
        >
          {leads.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No hay leads en esta etapa.
            </p>
          ) : (
            leads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onClick={() => onLeadClick(lead.id)}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  )
}
