'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/shared/ToastProvider'
import type { PipelineStage } from '@/types/db'
import type { MotivoPerdida } from '@/lib/leads/motivos-perdida'

/** Etapas del pipeline ordenadas por posición (cacheadas 1 min, compartidas entre componentes). */
export function useStages() {
  return useQuery<PipelineStage[]>({
    queryKey: ['stages'],
    queryFn: async () => {
      const res = await fetch('/api/stages')
      if (!res.ok) return []
      const json = await res.json() as { data: PipelineStage[] }
      return json.data
    },
    staleTime: 60_000,
  })
}

/**
 * Mueve un lead de etapa desde el panel de la conversación (PATCH /api/leads/[id])
 * e invalida las queries que muestran la etapa: lead, inbox, kanban y listado.
 * Lo comparten el selector de etapa y el botón "Agendar llamada".
 */
export function useMoverEtapaLead(leadId: string) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { data: stages = [] } = useStages()
  const [isSaving, setIsSaving] = useState(false)

  /** Devuelve true si el lead quedó en la nueva etapa. */
  async function moverA(stageId: string, motivo?: MotivoPerdida, detalle?: string | null): Promise<boolean> {
    setIsSaving(true)
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageId,
          ...(motivo ? { motivoPerdida: motivo, motivoPerdidaDetalle: detalle ?? null } : {}),
        }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        toast.error(data.error ?? 'No se pudo cambiar la etapa')
        return false
      }
      const destino = stages.find((s) => s.id === stageId)
      toast.success(`Lead movido a "${destino?.name ?? 'la nueva etapa'}"`)
      void queryClient.invalidateQueries({ queryKey: ['lead', leadId] })
      void queryClient.invalidateQueries({ queryKey: ['inbox'] })
      void queryClient.invalidateQueries({ queryKey: ['leads-col'] })
      void queryClient.invalidateQueries({ queryKey: ['leads-list'] })
      if (destino?.isTerminal) void queryClient.invalidateQueries({ queryKey: ['pipeline-stats'] })
      return true
    } catch {
      toast.error('Error de conexión')
      return false
    } finally {
      setIsSaving(false)
    }
  }

  return { stages, isSaving, moverA }
}
