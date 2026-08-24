import { and, eq, isNull } from 'drizzle-orm'
import { db, type Db } from '@/db'
import { leads, pedidos, pipelineStages, activityLog } from '@/db/schema'
import { publishCrmEvent } from '@/lib/realtime/broker'
import { formatFechaInstanteAR } from '@/lib/dates'

/** Slug fijo de la etapa a la que pasa el lead al entregarse la muestra (ver migración 0058 / seed). */
export const SLUG_ETAPA_MUESTRA_ENVIADA = 'muestra-enviada'

type PedidoParaMuestra = {
  id: string
  tipo: 'venta' | 'muestra'
  leadId: string | null
  entregadoAt?: Date | null
}

export type ResultadoMuestraEntregada = {
  /** true si se registró la entrega de la muestra en el lead en esta llamada */
  procesado: boolean
  /** true si además el lead cambió a la etapa "Muestra enviada" */
  etapaMovida: boolean
  /** id de la etapa "Muestra enviada" si existe en el pipeline */
  stageId: string | null
}

const NO_PROCESADO: ResultadoMuestraEntregada = { procesado: false, etapaMovida: false, stageId: null }

/**
 * Se ejecuta cuando un pedido pasa a `entregado`. Si es una muestra CDA
 * cargada desde el lead (tipo = 'muestra' + leadId):
 *
 * - Guarda `muestraEntregadaAt` en el lead (se ve en la card del kanban).
 * - Agrega una nota de sistema en la actividad del lead con la fecha y el pedido.
 * - Mueve el lead a la etapa "Muestra enviada" desde cualquier etapa abierta.
 *   Si el lead está cerrado (ganado/perdido) no lo toca; si la etapa no existe
 *   (la borraron del pipeline), registra la nota igual pero no lo mueve.
 *
 * Idempotente: si el lead ya tiene `muestraEntregadaAt`, no hace nada (un
 * pedido puede "entregarse" dos veces, p. ej. reparto + confirmación de MP).
 */
export async function registrarMuestraEntregada(
  pedido: PedidoParaMuestra,
  userId: string,
  drizzleDb: Db = db,
): Promise<ResultadoMuestraEntregada> {
  if (pedido.tipo !== 'muestra' || !pedido.leadId) return NO_PROCESADO

  const lead = await drizzleDb.query.leads.findFirst({
    where: and(eq(leads.id, pedido.leadId), isNull(leads.deletedAt)),
    columns: { id: true, stageId: true, isOpen: true, assignedTo: true, muestraEntregadaAt: true },
  })
  if (!lead || lead.muestraEntregadaAt) return NO_PROCESADO

  const etapa = await drizzleDb.query.pipelineStages.findFirst({
    where: eq(pipelineStages.slug, SLUG_ETAPA_MUESTRA_ENVIADA),
    columns: { id: true },
  })

  const fecha = pedido.entregadoAt ?? new Date()
  const mover = !!etapa && lead.isOpen && lead.stageId !== etapa.id

  await drizzleDb
    .update(leads)
    .set({
      muestraEntregadaAt: fecha,
      ...(mover ? { stageId: etapa.id } : {}),
      updatedAt: new Date(),
    })
    .where(eq(leads.id, lead.id))

  // Nota de sistema en la línea de tiempo del lead
  await drizzleDb.insert(activityLog).values({
    leadId: lead.id,
    userId,
    action: 'note_added',
    metadata: {
      sistema: true,
      motivo: 'muestra_entregada',
      pedidoId: pedido.id,
      texto: `Muestra entregada el ${formatFechaInstanteAR(fecha)} — pedido #${pedido.id.slice(-8).toUpperCase()}`,
    },
  })

  if (mover) {
    await drizzleDb.insert(activityLog).values({
      leadId: lead.id,
      userId,
      action: 'stage_changed',
      metadata: { fromStageId: lead.stageId, toStageId: etapa.id, motivo: 'muestra_entregada' },
    })

    await publishCrmEvent({
      type: 'lead_updated',
      leadId: lead.id,
      assignedTo: lead.assignedTo,
      oldAssigned: lead.assignedTo,
      stageId: etapa.id,
      oldStageId: lead.stageId,
    })
  }

  return { procesado: true, etapaMovida: mover, stageId: etapa?.id ?? null }
}

/**
 * Hook para las rutas que marcan un pedido como `entregado` (reparto/fábrica,
 * Mercado Pago, cambio manual del admin). Best-effort: nunca hace fallar la
 * entrega por un problema en el paso del lead.
 */
export async function onPedidoEntregado(
  pedidoId: string,
  userId: string,
  drizzleDb: Db = db,
): Promise<ResultadoMuestraEntregada> {
  try {
    const pedido = await drizzleDb.query.pedidos.findFirst({
      where: eq(pedidos.id, pedidoId),
      columns: { id: true, tipo: true, leadId: true, entregadoAt: true },
    })
    if (!pedido) return NO_PROCESADO
    return await registrarMuestraEntregada(pedido, userId, drizzleDb)
  } catch (err) {
    console.warn(`[muestra-enviada] No se pudo procesar la entrega del pedido ${pedidoId}:`, err)
    return NO_PROCESADO
  }
}
