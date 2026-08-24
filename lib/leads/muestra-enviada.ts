import { eq } from 'drizzle-orm'
import { db, type Db } from '@/db'
import { leads, pipelineStages, activityLog } from '@/db/schema'
import { publishCrmEvent } from '@/lib/realtime/broker'

/** Slug fijo de la etapa a la que pasa el lead al cargar la muestra (ver migración 0058 / seed). */
export const SLUG_ETAPA_MUESTRA_ENVIADA = 'muestra-enviada'

type LeadMinimo = {
  id: string
  stageId: string
  isOpen: boolean
  assignedTo: string | null
}

export type ResultadoMoverEtapa = {
  /** true si el lead cambió de etapa en esta llamada */
  movido: boolean
  /** id de la etapa "Muestra enviada" si existe en el pipeline */
  stageId: string | null
}

/**
 * Mueve el lead a la etapa "Muestra enviada" al cargar un pedido de muestra.
 *
 * - Si la etapa no existe (la borraron del pipeline), no hace nada.
 * - Si el lead ya está en esa etapa o está cerrado (ganado/perdido), no lo toca.
 * - Si lo mueve, registra `stage_changed` en el activity log (con motivo) y
 *   publica el evento realtime para que el kanban se actualice.
 */
export async function moverLeadAMuestraEnviada(
  lead: LeadMinimo,
  userId: string,
  drizzleDb: Db = db,
): Promise<ResultadoMoverEtapa> {
  const etapa = await drizzleDb.query.pipelineStages.findFirst({
    where: eq(pipelineStages.slug, SLUG_ETAPA_MUESTRA_ENVIADA),
    columns: { id: true },
  })
  if (!etapa) return { movido: false, stageId: null }
  if (!lead.isOpen || lead.stageId === etapa.id) return { movido: false, stageId: etapa.id }

  await drizzleDb
    .update(leads)
    .set({ stageId: etapa.id, updatedAt: new Date() })
    .where(eq(leads.id, lead.id))

  await drizzleDb.insert(activityLog).values({
    leadId: lead.id,
    userId,
    action: 'stage_changed',
    metadata: { fromStageId: lead.stageId, toStageId: etapa.id, motivo: 'muestra_creada' },
  })

  await publishCrmEvent({
    type: 'lead_updated',
    leadId: lead.id,
    assignedTo: lead.assignedTo,
    oldAssigned: lead.assignedTo,
    stageId: etapa.id,
    oldStageId: lead.stageId,
  })

  return { movido: true, stageId: etapa.id }
}
