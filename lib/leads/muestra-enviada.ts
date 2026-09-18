import { and, eq, isNull } from 'drizzle-orm'
import { db, type Db } from '@/db'
import { leads, pedidos, pipelineStages, activityLog } from '@/db/schema'
import { publishCrmEvent } from '@/lib/realtime/broker'
import { formatFechaInstanteAR } from '@/lib/dates'
import { muestraRequiereAviso } from './muestra-aviso'

/** Slug fijo de la etapa a la que pasa el lead al entregarse la muestra (ver migración 0058 / seed). */
export const SLUG_ETAPA_MUESTRA_ENVIADA = 'muestra-enviada'

type PedidoParaMuestra = {
  id: string
  tipo: 'venta' | 'muestra'
  leadId: string | null
  entregadoAt?: Date | null
  /** Foto de la guía de envío (expreso): con esto se puede avisar al cliente */
  remitoFotoUrl?: string | null
  /** 'retiro_fabrica' = el cliente la retiró en persona: no hay nada que avisar */
  metodoEntrega?: string | null
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
 *   Si la retiró en fábrica queda también `muestraAvisadaAt`: no hay guía ni
 *   comprobante que mandarle, así que no entra en "muestras por avisar".
 * - Agrega una nota de sistema en la actividad del lead con la fecha y el pedido.
 * - Mueve el lead a la etapa "Muestra enviada" desde cualquier etapa abierta.
 *   Si el lead está cerrado (ganado/perdido) no lo toca; si la etapa no existe
 *   (la borraron del pipeline), registra la nota igual pero no lo mueve.
 * - Avisa en tiempo real (`muestra_despachada`) al vendedor y a los admins para
 *   que le manden al cliente la guía de envío; si en Ajustes → WhatsApp está
 *   activado el envío automático, lo manda solo (ver muestra-despachada.ts).
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
    with: { contact: { columns: { name: true } } },
  })
  if (!lead || lead.muestraEntregadaAt) return NO_PROCESADO

  const etapa = await drizzleDb.query.pipelineStages.findFirst({
    where: eq(pipelineStages.slug, SLUG_ETAPA_MUESTRA_ENVIADA),
    columns: { id: true },
  })

  const fecha = pedido.entregadoAt ?? new Date()
  const mover = !!etapa && lead.isOpen && lead.stageId !== etapa.id
  const requiereAviso = muestraRequiereAviso(pedido.metodoEntrega)

  await drizzleDb
    .update(leads)
    .set({
      muestraEntregadaAt: fecha,
      ...(requiereAviso ? {} : { muestraAvisadaAt: fecha }),
      ...(mover ? { stageId: etapa.id } : {}),
      updatedAt: new Date(),
    })
    .where(eq(leads.id, lead.id))

  // Nota de sistema en la línea de tiempo del lead
  const numero = pedido.id.slice(-8).toUpperCase()
  await drizzleDb.insert(activityLog).values({
    leadId: lead.id,
    userId,
    action: 'note_added',
    metadata: {
      sistema: true,
      motivo: 'muestra_entregada',
      pedidoId: pedido.id,
      texto: requiereAviso
        ? `Muestra entregada el ${formatFechaInstanteAR(fecha)} — pedido #${numero}`
        : `Muestra retirada en fábrica el ${formatFechaInstanteAR(fecha)} — pedido #${numero}. No requiere aviso al cliente.`,
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

  // Aviso interno: "salió la muestra de X, avisale al cliente"
  await publishCrmEvent({
    type: 'muestra_despachada',
    leadId: lead.id,
    assignedTo: lead.assignedTo,
    pedidoId: pedido.id,
    contactName: lead.contact?.name ?? '',
    conFoto: !!pedido.remitoFotoUrl,
  })

  if (pedido.remitoFotoUrl) await enviarAvisoAutomatico(lead.id, userId, drizzleDb)

  return { procesado: true, etapaMovida: mover, stageId: etapa?.id ?? null }
}

/**
 * Si en Ajustes → WhatsApp está activado el aviso automático, manda la
 * plantilla con la guía apenas se entrega. Best-effort: si falla (plantilla
 * sin aprobar, sin teléfono, Meta caído) el lead queda pendiente de aviso y
 * se manda a mano desde el panel.
 */
async function enviarAvisoAutomatico(leadId: string, userId: string, drizzleDb: Db): Promise<void> {
  try {
    const config = await drizzleDb.query.whatsappConfig.findFirst({ columns: { muestraAuto: true } })
    if (!config?.muestraAuto) return
    const { enviarAvisoMuestra } = await import('./muestra-despachada')
    // Sin esperar: que la entrega de fábrica no dependa de Meta ni de R2
    void enviarAvisoMuestra(leadId, { id: userId, name: null }).catch((err: unknown) => {
      console.warn(`[muestra-enviada] Falló el aviso automático del lead ${leadId}:`, err)
    })
  } catch (err) {
    console.warn(`[muestra-enviada] No se pudo mandar el aviso automático del lead ${leadId}:`, err)
  }
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
      columns: { id: true, tipo: true, leadId: true, entregadoAt: true, remitoFotoUrl: true, metodoEntrega: true },
    })
    if (!pedido) return NO_PROCESADO
    return await registrarMuestraEntregada(pedido, userId, drizzleDb)
  } catch (err) {
    console.warn(`[muestra-enviada] No se pudo procesar la entrega del pedido ${pedidoId}:`, err)
    return NO_PROCESADO
  }
}
