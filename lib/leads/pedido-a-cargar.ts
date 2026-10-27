/**
 * Etapa "Pedido a cargar": cola de los leads que ya decidieron el primer
 * pedido (el bot tomó las cantidades, o el vendedor las anotó) y a los que
 * falta cargarles el pedido y mandarles la proforma. Salida manual por ahora:
 * el vendedor carga el pedido y lo pasa a Ganado.
 */
import { and, eq, isNull } from 'drizzle-orm'
import { db, type Db } from '@/db'
import { activityLog, leads, pipelineStages } from '@/db/schema'
import { publishCrmEvent } from '@/lib/realtime/broker'

/** Slug fijo de la etapa (migración 0086 / seed). */
export const SLUG_ETAPA_PEDIDO_A_CARGAR = 'pedido-a-cargar'

export type ResultadoPedidoACargar = {
  /** true si el lead cambió a la etapa en esta llamada */
  etapaMovida: boolean
  stageId: string | null
}

/**
 * Mueve el lead a "Pedido a cargar" desde cualquier etapa abierta. No toca
 * leads cerrados ni hace nada si ya está ahí o si la etapa no existe (la
 * borraron del pipeline).
 */
export async function moverLeadAPedidoACargar(
  leadId: string,
  opts: { userId?: string | null; motivo: string },
  drizzleDb: Db = db,
): Promise<ResultadoPedidoACargar> {
  const lead = await drizzleDb.query.leads.findFirst({
    where: and(eq(leads.id, leadId), isNull(leads.deletedAt)),
    columns: { id: true, stageId: true, isOpen: true, assignedTo: true },
  })
  if (!lead || !lead.isOpen) return { etapaMovida: false, stageId: null }

  const etapa = await drizzleDb.query.pipelineStages.findFirst({
    where: eq(pipelineStages.slug, SLUG_ETAPA_PEDIDO_A_CARGAR),
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
    userId: opts.userId ?? null,
    action: 'stage_changed',
    metadata: { fromStageId: lead.stageId, toStageId: etapa.id, motivo: opts.motivo },
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
