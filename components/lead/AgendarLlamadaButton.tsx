'use client'

import { PhoneCall } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMoverEtapaLead } from './useMoverEtapaLead'
import type { PipelineStage } from '@/types/db'

/** Slug fijo de la etapa "Llamada" a la que pasa el lead con "Agendar llamada" (ver migración 0071 / seed). */
export const SLUG_ETAPA_AGENDAR_LLAMADA = 'agendar-llamada'

type Props = {
  leadId: string
  /** Etapa actual del lead: si ya está en "Llamada" el botón queda deshabilitado */
  stage: PipelineStage | null | undefined
  mobile?: boolean
}

// Botón verde "Agendar llamada", a la derecha de "Cotizar" en el panel del lead:
// mueve el lead a la etapa "Llamada" del pipeline con un clic, sin abrir el
// desplegable de etapa. Si la etapa no existe (la borraron), no se muestra.
export default function AgendarLlamadaButton({ leadId, stage, mobile }: Props) {
  const { stages, isSaving, moverA } = useMoverEtapaLead(leadId)
  const destino = stages.find((s) => s.slug === SLUG_ETAPA_AGENDAR_LLAMADA)
  if (!destino) return null

  const yaEsta = stage?.id === destino.id

  return (
    <button
      type="button"
      onClick={() => void moverA(destino.id)}
      disabled={isSaving || yaEsta}
      title={yaEsta ? `El lead ya está en "${destino.name}"` : `Mover el lead a "${destino.name}"`}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border',
        'border-green-600 bg-green-600 text-white hover:bg-green-700 hover:border-green-700 transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-600',
        mobile && 'min-h-[44px] flex-1 justify-center text-sm',
      )}
    >
      <PhoneCall size={13} />
      Agendar llamada
    </button>
  )
}
