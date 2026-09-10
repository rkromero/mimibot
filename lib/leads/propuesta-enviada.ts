import { and, eq, isNull } from 'drizzle-orm'
import { db, type Db } from '@/db'
import { leads, pipelineStages, activityLog } from '@/db/schema'
import { publishCrmEvent } from '@/lib/realtime/broker'

/** Slug fijo de la etapa a la que pasa el lead al enviarle una propuesta (seed del pipeline). */
export const SLUG_ETAPA_PROPUESTA_ENVIADA = 'propuesta'

export type ResultadoPropuestaEnviada = {
  /** true si el lead cambió a la etapa "Propuesta enviada" en esta llamada */
  etapaMovida: boolean
  /** id de la etapa "Propuesta enviada" si existe en el pipeline */
  stageId: string | null
}

/**
 * Se ejecuta cuando se envía una propuesta al lead (WhatsApp, email o
 * descarga registrada). Mueve el lead a la etapa "Propuesta enviada" desde
 * cualquier etapa abierta: con al menos una propuesta enviada, el lead está
 * esperando respuesta a esa propuesta, aunque venga de una etapa posterior
 * (muestra, seguimiento, llamada).
 *
 * No toca leads cerrados (ganado/perdido) ni hace nada si ya está en la
 * etapa o si la etapa no existe (la borraron del pipeline).
 */
export async function moverLeadAPropuestaEnviada(
  leadId: string,
  userId: string,
  propuestaId: string,
  drizzleDb: Db = db,
): Promise<ResultadoPropuestaEnviada> {
  const lead = await drizzleDb.query.leads.findFirst({
    where: and(eq(leads.id, leadId), isNull(leads.deletedAt)),
    columns: { id: true, stageId: true, isOpen: true, assignedTo: true },
  })
  if (!lead || !lead.isOpen) return { etapaMovida: false, stageId: null }

  const etapa = await drizzleDb.query.pipelineStages.findFirst({
    where: eq(pipelineStages.slug, SLUG_ETAPA_PROPUESTA_ENVIADA),
    columns: { id: true },
  })
  if (!etapa) return { etapaMovida: false, stageId: null }
  if (lead.stageId === etapa.id) return { etapaMovida: false, stageId: etapa.id }

  await drizzleDb
    .update(leads)
    .set({ stageId: etapa.id, updatedAt: new Date() })
    .where(eq(leads.id, lead.id))

  await drizzleDb.insert(activityLog).values({
    leadId: lead.id,
    userId,
    action: 'stage_changed',
    metadata: { fromStageId: lead.stageId, toStageId: etapa.id, motivo: 'propuesta_enviada', propuestaId },
  })

  await publishCrmEvent({
    type: 'lead_updated',
    leadId: lead.id,
    assignedTo: lead.assignedTo,
    oldAssigned: lead.assignedTo,
    stageId: etapa.id,
    oldStageId: lead.stageId,
  })

  return { etapaMovida: true, stageId: etapa.id }
}

/**
 * Hook para la ruta de envío de propuestas. Best-effort: nunca hace fallar el
 * envío (la propuesta ya salió) por un problema en el cambio de etapa.
 */
export async function onPropuestaEnviada(
  leadId: string,
  userId: string,
  propuestaId: string,
  drizzleDb: Db = db,
): Promise<ResultadoPropuestaEnviada> {
  try {
    return await moverLeadAPropuestaEnviada(leadId, userId, propuestaId, drizzleDb)
  } catch (err) {
    console.warn(`[propuesta-enviada] No se pudo mover el lead ${leadId} a "Propuesta enviada":`, err)
    return { etapaMovida: false, stageId: null }
  }
}
