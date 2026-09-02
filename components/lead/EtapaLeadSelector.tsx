'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import MotivoPerdidaModal from '@/components/pipeline/MotivoPerdidaModal'
import { useMoverEtapaLead } from './useMoverEtapaLead'
import type { PipelineStage } from '@/types/db'

type Props = {
  leadId: string
  /** Etapa actual (viene con el lead de GET /api/leads/[id]) */
  stage: PipelineStage | null | undefined
  leadName: string | null
  mobile?: boolean
}

// Etapa del lead en el panel de la conversación (debajo de "Cotizar"):
// muestra la etapa actual y un desplegable para moverla desde ahí mismo.
// Mover a "perdido" (terminal no ganada) pide el motivo, igual que el kanban.
export default function EtapaLeadSelector({ leadId, stage, leadName, mobile = false }: Props) {
  const { stages, isSaving, moverA } = useMoverEtapaLead(leadId)
  const [pendientePerdido, setPendientePerdido] = useState<PipelineStage | null>(null)

  function handleChange(stageId: string) {
    if (!stageId || stageId === stage?.id) return
    const destino = stages.find((s) => s.id === stageId)
    // A "perdido" (terminal no ganada) solo con motivo, igual que el kanban
    if (destino?.isTerminal && !destino.isWon) {
      setPendientePerdido(destino)
      return
    }
    void moverA(stageId)
  }

  return (
    <div className={cn('px-4 py-2.5 border-b border-border', mobile && 'shrink-0')}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: stage?.color ?? '#6b7280' }}
          />
          Etapa
        </span>
        <select
          value={stage?.id ?? ''}
          onChange={(e) => handleChange(e.target.value)}
          disabled={isSaving || stages.length === 0}
          className={cn(
            'flex-1 min-w-0 max-w-[220px] px-2 py-1 text-xs rounded-md border',
            'border-border bg-background text-foreground',
            'focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50',
          )}
          aria-label="Cambiar etapa del lead"
        >
          {stage && !stages.some((s) => s.id === stage.id) && (
            <option value={stage.id}>{stage.name}</option>
          )}
          {stages.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {pendientePerdido && (
        <MotivoPerdidaModal
          leadName={leadName ?? 'Este lead'}
          onConfirm={(motivo, detalle) => {
            const destino = pendientePerdido
            setPendientePerdido(null)
            void moverA(destino.id, motivo, detalle)
          }}
          onCancel={() => setPendientePerdido(null)}
        />
      )}
    </div>
  )
}
