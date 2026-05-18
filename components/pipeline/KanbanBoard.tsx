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
import { useQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import KanbanColumn, { type ColumnPage } from './KanbanColumn'
import LeadCard from './LeadCard'
import LeadList from './LeadList'
import PipelineFilters from './PipelineFilters'
import CreateLeadModal from './CreateLeadModal'
import BulkImportModal from './BulkImportModal'
import LeadPanel from '@/components/lead/LeadPanel'
import type { PipelineStage, LeadWithContact } from '@/types/db'
import type { Session } from 'next-auth'
import type { LeadFilters } from '@/lib/validations/lead'
import { Plus, LayoutGrid, List, Upload } from 'lucide-react'
import ChipFilter from '@/components/shared/ChipFilter'

type Props = {
  stages: PipelineStage[]
  user: Session['user']
}

export default function KanbanBoard({ stages, user }: Props) {
  const queryClient = useQueryClient()
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null)
  const [activeLead, setActiveLead] = useState<LeadWithContact | null>(null)
  const [overStageId, setOverStageId] = useState<string | null>(null)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [view, setView] = useState<'board' | 'list'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'list' : 'board',
  )
  const [filters, setFilters] = useState<LeadFilters>({})
  const [mobileStageId, setMobileStageId] = useState<string>('all')
  const canImport = user.role === 'admin' || user.role === 'gerente'
  const filtersKey = JSON.stringify(filters)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointer = pointerWithin(args)
    return pointer.length > 0 ? pointer : rectIntersection(args)
  }, [])

  // List view: flat query (only enabled when list view is active)
  const leadsListQuery = useQuery({
    queryKey: ['leads-list', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters.agentId) params.set('agentId', filters.agentId)
      if (filters.tagId) params.set('tagId', filters.tagId)
      if (filters.source) params.set('source', filters.source)
      if (filters.search) params.set('search', filters.search)
      const res = await fetch(`/api/leads?${params.toString()}`)
      if (!res.ok) throw new Error('Error al cargar leads')
      const json = await res.json() as { data: LeadWithContact[] }
      return json.data
    },
    enabled: view === 'list',
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
      void queryClient.invalidateQueries({ queryKey: ['leads-col'] })
      void queryClient.invalidateQueries({ queryKey: ['leads-list'] })
    },
    onError: () => {
      // Revert optimistic update on failure
      void queryClient.invalidateQueries({ queryKey: ['leads-col'] })
    },
  })

  // SSE for real-time updates
  useEffect(() => {
    const es = new EventSource('/api/realtime/stream')
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data as string) as { type: string }
        if (event.type === 'new_message' || event.type === 'lead_updated') {
          void queryClient.invalidateQueries({ queryKey: ['leads-col'] })
          void queryClient.invalidateQueries({ queryKey: ['leads-list'] })
        }
      } catch {}
    }
    es.onerror = () => {}
    return () => es.close()
  }, [queryClient])

  // Presence heartbeat
  useEffect(() => {
    const ping = () => void fetch('/api/users/me/heartbeat', { method: 'PUT' })
    ping()
    const interval = setInterval(ping, 30_000)
    return () => clearInterval(interval)
  }, [])

  // Find a lead across all column caches
  function findLeadInCache(leadId: string): { lead: LeadWithContact; stageId: string } | null {
    for (const stage of stages) {
      const colData = queryClient.getQueryData<InfiniteData<ColumnPage>>(['leads-col', stage.id, filtersKey])
      const lead = colData?.pages.flatMap((p) => p.data).find((l) => l.id === leadId)
      if (lead) return { lead, stageId: stage.id }
    }
    return null
  }

  function handleDragStart(event: DragStartEvent) {
    const leadId = event.active.id as string
    setActiveLeadId(leadId)
    const found = findLeadInCache(leadId)
    if (found) setActiveLead(found.lead)
  }

  function handleDragOver(event: DragOverEvent) {
    const { over } = event
    if (!over) { setOverStageId(null); return }
    const data = over.data.current as { stageId?: string } | undefined
    setOverStageId(data?.stageId ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveLeadId(null)
    setActiveLead(null)
    setOverStageId(null)
    const { active, over } = event
    if (!over) return

    const leadId = active.id as string
    const data = over.data.current as { stageId?: string } | undefined
    const targetStageId = data?.stageId ?? null
    if (!targetStageId) return

    const found = findLeadInCache(leadId)
    if (!found || found.stageId === targetStageId) return

    const movedLead = {
      ...found.lead,
      stageId: targetStageId,
      stage: stages.find((s) => s.id === targetStageId) ?? found.lead.stage,
    }

    // Optimistic: remove from source column first page
    queryClient.setQueryData<InfiniteData<ColumnPage>>(
      ['leads-col', found.stageId, filtersKey],
      (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((p, i) =>
            i === 0
              ? { ...p, data: p.data.filter((l) => l.id !== leadId), total: Math.max(0, p.total - 1) }
              : { ...p, data: p.data.filter((l) => l.id !== leadId) },
          ),
        }
      },
    )

    // Optimistic: prepend to target column first page
    queryClient.setQueryData<InfiniteData<ColumnPage>>(
      ['leads-col', targetStageId, filtersKey],
      (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((p, i) =>
            i === 0
              ? { ...p, data: [movedLead, ...p.data], total: p.total + 1 }
              : p,
          ),
        }
      },
    )

    moveMutation.mutate({ leadId, stageId: targetStageId })
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between pr-4 border-b border-border">
        <PipelineFilters user={user} filters={filters} onChange={setFilters} />
        <div className="flex items-center gap-1.5 shrink-0">
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
        <>
          <div className="md:hidden px-4 py-2 border-b border-border">
            <ChipFilter
              options={[
                { key: 'all', label: 'Todos', count: leadsListQuery.data?.length ?? 0 },
                ...stages.map((s) => ({
                  key: s.id,
                  label: s.name,
                  count: leadsListQuery.data?.filter((l) => l.stageId === s.id).length ?? 0,
                })),
              ]}
              value={mobileStageId}
              onChange={setMobileStageId}
            />
          </div>
          <LeadList
            leads={(leadsListQuery.data ?? []).filter(
              (l) => mobileStageId === 'all' || l.stageId === mobileStageId,
            )}
            stages={stages}
            loading={leadsListQuery.isLoading}
            onLeadClick={setSelectedLeadId}
          />
        </>
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
                filters={filters}
                onLeadClick={setSelectedLeadId}
                isTargetColumn={overStageId === stage.id}
              />
            ))}
            <DragOverlay dropAnimation={{ duration: 120, easing: 'ease' }}>
              {activeLead && <LeadCard lead={activeLead} isDragging />}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {selectedLeadId && (
        <LeadPanel leadId={selectedLeadId} onClose={() => setSelectedLeadId(null)} user={user} />
      )}

      {showCreate && (
        <CreateLeadModal stages={stages} onClose={() => setShowCreate(false)} />
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
