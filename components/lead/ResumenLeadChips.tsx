'use client'

import { useQuery } from '@tanstack/react-query'
import { FlaskConical, FileText, Hourglass, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatFechaHoraAR, todayStrAR } from '@/lib/dates'
import { esperaAvisoMuestra } from '@/lib/leads/muestra-aviso'
import { estadoRecordatorio } from '@/lib/leads/recordatorio'
import { REASON_ULTIMO_SEGUIMIENTO } from '@/lib/followup/ultimo-seguimiento'
import RecordatorioChip from '@/components/shared/RecordatorioChip'
import type { PipelineStage } from '@/types/db'

/** Lo que el chat del celular resume en una línea (viene con GET /api/leads/[id]). */
export type LeadParaResumen = {
  stage?: PipelineStage | null
  muestraEntregadaAt: Date | string | null
  muestraAvisadaAt: Date | string | null
  muestraPedido?: { estado: string } | null
  recordatorioAt: string | null
  recordatorioNota: string | null
  followUpReason: string | null
  followUpStatus: string | null
  nextFollowUpAt: Date | string | null
}

type Props = {
  leadId: string
  lead: LeadParaResumen
  /** Abre la hoja de acciones */
  onAbrir: () => void
}

const ESTADO_MUESTRA: Record<string, string> = {
  pendiente: 'Pendiente',
  pendiente_aprobacion: 'P. aprobación',
  confirmado: 'Confirmada',
  listo_para_repartir: 'Lista',
  en_reparto: 'En reparto',
  entregado: 'Entregada',
  cancelado: 'Cancelada',
}

const ESTADO_MUESTRA_COLOR: Record<string, string> = {
  entregado: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  en_reparto: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  cancelado: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

/** ¿Hay algo que atender? Marca el punto del botón "Acciones". */
export function leadTienePendientes(lead: LeadParaResumen, hoy = todayStrAR()): boolean {
  if (esperaAvisoMuestra(lead)) return true
  if (lead.recordatorioAt && estadoRecordatorio(lead.recordatorioAt, hoy) !== 'proximo') return true
  return esperandoUltimoSeguimiento(lead)
}

function esperandoUltimoSeguimiento(lead: LeadParaResumen): boolean {
  return lead.followUpReason === REASON_ULTIMO_SEGUIMIENTO && lead.followUpStatus === 'pending' && !!lead.nextFollowUpAt
}

/**
 * Línea de chips arriba del chat en el celular: etapa, muestra, propuestas,
 * recordatorio y cierre pendiente, en una sola fila que se desliza. Reemplaza
 * los bloques apilados que dejaban el chat sin lugar; cualquier chip y el
 * botón "Acciones" abren la hoja con todo lo que antes estaba arriba.
 */
export default function ResumenLeadChips({ leadId, lead, onAbrir }: Props) {
  // Misma key que PropuestasList: comparte caché y se refresca junto
  const { data: propuestas } = useQuery<Array<{ estado: string }>>({
    queryKey: ['lead-propuestas', leadId],
    queryFn: async () => {
      const res = await fetch(`/api/leads/${leadId}/propuestas`)
      if (!res.ok) throw new Error('Error al cargar propuestas')
      const json = await res.json() as { data: Array<{ estado: string }> }
      return json.data
    },
  })

  const chip = 'inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0'
  const muestraEstado = lead.muestraPedido?.estado ?? (lead.muestraEntregadaAt ? 'entregado' : null)
  const propuestasCount = propuestas?.length ?? 0
  const propuestasEnviadas = propuestas?.filter((p) => p.estado === 'enviada' || p.estado === 'aceptada').length ?? 0
  const pendientes = leadTienePendientes(lead)

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card shrink-0">
      <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
        {lead.stage && (
          <button
            type="button"
            onClick={onAbrir}
            className={cn(chip, 'text-white')}
            style={{ backgroundColor: lead.stage.color }}
            title="Cambiar de etapa"
          >
            {lead.stage.name}
          </button>
        )}

        {muestraEstado && muestraEstado !== 'cancelado' && (
          <button
            type="button"
            onClick={onAbrir}
            className={cn(chip, ESTADO_MUESTRA_COLOR[muestraEstado] ?? 'bg-muted text-muted-foreground')}
            title="Muestra CDA"
          >
            <FlaskConical size={11} />
            Muestra {ESTADO_MUESTRA[muestraEstado] ?? muestraEstado}
          </button>
        )}
        {esperaAvisoMuestra(lead) && (
          <button
            type="button"
            onClick={onAbrir}
            className={cn(chip, 'bg-purple-600 text-white uppercase text-[10px] font-bold')}
            title="Falta avisarle al cliente que salió la muestra"
          >
            Sin avisar
          </button>
        )}

        {propuestasCount > 0 && (
          <button
            type="button"
            onClick={onAbrir}
            className={cn(chip, 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300')}
            title="Ver propuestas"
          >
            <FileText size={11} />
            {propuestasCount === 1 ? '1 propuesta' : `${propuestasCount} propuestas`}
            {propuestasEnviadas > 0 && propuestasEnviadas < propuestasCount && ` · ${propuestasEnviadas} env.`}
          </button>
        )}

        {lead.recordatorioAt && (
          <button type="button" onClick={onAbrir} className="shrink-0" title="Recordatorio de llamada">
            <RecordatorioChip fecha={lead.recordatorioAt} nota={lead.recordatorioNota} className="px-2 py-1 rounded-full" />
          </button>
        )}

        {esperandoUltimoSeguimiento(lead) && (
          <button
            type="button"
            onClick={onAbrir}
            className={cn(chip, 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300')}
            title="Último seguimiento enviado: si no responde pasa a Perdido"
          >
            <Hourglass size={11} />
            Cierra {formatFechaHoraAR(lead.nextFollowUpAt!, true)}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onAbrir}
        className="relative shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-xs font-medium text-foreground hover:bg-accent min-h-[36px]"
        aria-label="Acciones del lead"
      >
        <SlidersHorizontal size={13} />
        Acciones
        {pendientes && (
          <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-purple-600 ring-2 ring-card" aria-hidden="true" />
        )}
      </button>
    </div>
  )
}
