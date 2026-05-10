'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
} from '@dnd-kit/core'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import KanbanColumn from './KanbanColumn'
import LeadCard from './LeadCard'
import LeadList from './LeadList'
import PipelineFilters from './PipelineFilters'
import CreateLeadModal from './CreateLeadModal'
import BulkImportModal from './BulkImportModal'
import LeadPanel from '@/components/lead/LeadPanel'
import type { PipelineStage } from '@/types/db'
import type { Session } from 'next-auth'
import type { LeadFilters } from '@/lib/validations/lead'
import { Plus, LayoutGrid, List, Upload } from 'lucide-react'

type Props = {
  stages: PipelineStage[]
  user: Session['user']
}

export default function KanbanBoard({ stages, user }: Props) {
  const queryClient = useQueryClient()
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null)
  const [overStageId, setOverStageId] = useState<string | null>(null)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [view, setView] = useState<'board' | 'list'>('board')
  const [filters, setFilters] = useState<LeadFilters>({})
  const canImport = user.role === 'admin' || user.role === 'gerente'

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointer = pointerWithin(args)
    return pointer.length > 0 ? pointer : rectIntersection(args)
  }, [])

  const leadsQuery = useQuery({
    queryKey: ['leads', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters.agentId) params.set('agentId', filters.agentId)
      if (filters.tagId) params.set('tagId', filters.tagId)
      if (filters.source) params.set('source', filters.source)
      if (filters.search) params.set('search', filters.search)
      const res = await fetch(`/api/leads?${params}`)
      if (!res.ok) throw new Error('Error al cargar leads')
      const json = await res.json() as { data: import('@/types/db').LeadWithContact[] }
      return json.data
    },
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  })

  const moveMutation = useMutation({
    mutationFn: async ({ leadId, stageId }: { leadId: string; stageId: string }) => {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId }),
      })
      if (!res.ok) throw new Error('Error al mover lead')
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
  })

  // SSE para actualizaciones en tiempo real
  useEffect(() => {
    const es = new EventSource('/api/realtime/stream')
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data as string) as { type: string }
        if (event.type === 'new_message' || event.type === 'lead_updated') {
          void queryClient.invalidateQueries({ queryKey: ['leads'] })
        }
      } catch {}
    }
    es.onerror = () => {
      // EventSource reconecta automáticamente
    }
    return () => es.close()
  }, [queryClient])

  // Heartbeat de presencia online
  useEffect(() => {
    const ping = () => void fetch('/api/users/me/heartbeat', { method: 'PUT' })
    ping()
    const interval = setInterval(ping, 30_000)
    return () => clearInterval(interval)
  }, [])

  function handleDragStart(event: DragStartEvent) {
    setActiveLeadId(event.active.id as string)
  }

  function handleDragOver(event: DragOverEvent) {
    const { over } = event
    if (!over) { setOverStageId(null); return }
    const data = over.data.current as { stageId?: string } | undefined
    setOverStageId(data?.stageId ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveLeadId(null)
    setOverStageId(null)
    const { active, over } = event
    if (!over) return

    const leadId = active.id as string
    const data = over.data.current as { stageId?: string } | undefined
    const targetStageId = data?.stageId ?? null

    if (!targetStageId) return

    const lead = leadsQuery.data?.find((l) => l.id === leadId)
    if (!lead || lead.stageId === targetStageId) return

    // Optimistic update
    queryClient.setQueryData(['leads', filters], (old: typeof leadsQuery.data) =>
      old?.map((l) =>
        l.id === leadId
          ? { ...l, stageId: targetStageId, stage: stages.find((s) => s.id === targetStageId) ?? l.stage }
          : l,
      ),
    )

    moveMutation.mutate({ leadId, stageId: targetStageId })
  }

  const leadsByStage = stages.reduce<Record<string, import('@/types/db').LeadWithContact[]>>(
    (acc, stage) => {
      acc[stage.id] = leadsQuery.data?.filter((l) => l.stageId === stage.id) ?? []
      return acc
    },
    {},
  )

  const activeLead = activeLeadId
    ? leadsQuery.data?.find((l) => l.id === activeLeadId) ?? null
    : null

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between pr-4 border-b border-border">
        <PipelineFilters
          user={user}
          filters={filters}
          onChange={setFilters}
        />
        <div className="flex items-center gap-1.5 shrink-0">
          {/* View toggle */}
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setView('board')}
              title="Tablero"
              className={`p-1.5 transition-colors ${view === 'board' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setView('list')}
              title="Listado"
              className={`p-1.5 transition-colors ${view === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <List size={14} />
            </button>
          </div>
          {/* Import button (admin/gerente) */}
          {canImport && (
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border text-muted-foreground hover:bg-muted transition-colors duration-100"
              title="Importar CSV"
            >
              <Upload size={13} />
              Importar
            </button>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors duration-100"
          >
            <Plus size={13} />
            Nuevo lead
          </button>
        </div>
      </div>

      {view === 'list' ? (
        <LeadList
          leads={leadsQuery.data ?? []}
          stages={stages}
          loading={leadsQuery.isLoading}
          onLeadClick={setSelectedLeadId}
        />
      ) : (
        <div className="flex flex-1 overflow-x-auto overflow-y-hidden gap-0 border-t border-border">
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            {stages.map((stage) => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                leads={leadsByStage[stage.id] ?? []}
                onLeadClick={setSelectedLeadId}
                isTargetColumn={overStageId === stage.id}
              />
            ))}
            <DragOverlay dropAnimation={{ duration: 120, easing: 'ease' }}>
              {activeLead && (
                <LeadCard lead={activeLead} isDragging />
              )}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {selectedLeadId && (
        <LeadPanel
          leadId={selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
          user={user}
        />
      )}

      {showCreate && (
        <CreateLeadModal
          stages={stages}
          onClose={() => setShowCreate(false)}
        />
      )}

      {showImport && (
        <BulkImportModal
          stages={stages}
          userRole={user.role}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}
