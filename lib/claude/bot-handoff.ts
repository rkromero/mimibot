/**
 * Cierres del turno del bot: calificar y asignar (handoff), pausar por
 * propuesta enviada, derivar por pedido de reunión y cerrar sin calificar
 * (lista de espera). Separado de bot.ts para mantener cada archivo chico.
 */
import { eq, asc } from 'drizzle-orm'
import { db } from '@/db'
import { leads, messages, activityLog, pipelineStages } from '@/db/schema'
import { sendTextMessage } from '@/lib/whatsapp/client'
import { publishCrmEvent } from '@/lib/realtime/broker'
import { assignLeadByRule } from '@/lib/assignment'
import { agregarTagALead, TAG_PIDE_REUNION } from '@/lib/leads/tags'
import { extraerEmpresa, extraerScore } from './bot-context'
import { alertarEquipoBot, dejarNotaInternaBot } from './bot-alertas'
import { crearPropuestaAutomatica, type ConfigPropuestaAutomatica } from './bot-propuesta'
import type { LeadConContacto } from './bot'

/** Respuesta fija cuando la persona pide que la llamen / una visita / una reunión. */
export const RESPUESTA_PIDE_REUNION =
  '¡Dale! Le paso tu pedido a alguien del equipo para que te contacte y coordinen. Te escriben a la brevedad.'

export async function qualifyAndAssign(
  leadId: string,
  conversationId: string,
  lastMessage: string,
  resumen: string | null = null,
): Promise<string | null> {
  const stages = await db.query.pipelineStages.findMany({
    orderBy: [asc(pipelineStages.position)],
  })

  const nuevoStage = stages.find((s) => s.slug === 'nuevo')
  const calificadoStage =
    stages.find((s) => s.slug === 'calificado') ??
    stages.find((s) => !s.isTerminal && s.position > (nuevoStage?.position ?? -1))

  // Si el lead ya tiene vendedor (asignado al crearse desde la landing o a
  // mano), se respeta; la regla solo se usa para los que llegan sin dueño.
  const actual = await db.query.leads.findFirst({ where: eq(leads.id, leadId), columns: { assignedTo: true, empresa: true } })
  const agentId = actual?.assignedTo ?? await assignLeadByRule()
  if (agentId === null) {
    console.warn('[bot] qualifyAndAssign: sin agentes elegibles, lead sin asignar', { leadId })
  }

  const { score, grado } = extraerScore(resumen)
  // Empresa / marca que el bot averiguó en la charla: se guarda solo si el
  // lead no la tenía (lo cargado a mano o por la landing manda).
  const empresaBot = actual?.empresa?.trim() ? null : extraerEmpresa(resumen)

  await db.update(leads)
    .set({
      botEnabled: false,
      botQualified: true,
      ...(calificadoStage ? { stageId: calificadoStage.id } : {}),
      ...(agentId !== null ? { assignedTo: agentId } : {}),
      ...(score !== null ? { botScore: score } : {}),
      ...(grado ? { botGrado: grado } : {}),
      ...(empresaBot ? { empresa: empresaBot } : {}),
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId))

  const encabezado = agentId
    ? `Lead calificado y asignado al agente ${agentId}. Listo para el equipo de ventas.`
    : 'Lead calificado. Sin agentes disponibles para asignar.'
  const noteBody = resumen ? `${encabezado}\n\nResumen del bot:\n${resumen}` : encabezado

  await db.insert(messages).values({
    conversationId,
    direction: 'outbound',
    senderType: 'system',
    contentType: 'internal_note',
    body: noteBody,
    isRead: true,
    sentAt: new Date(),
  })

  await db.insert(activityLog).values({
    leadId,
    action: 'bot_handoff',
    metadata: { lastBotMessage: lastMessage.slice(0, 200), assignedTo: agentId, botScore: score, botGrado: grado },
  })

  await publishCrmEvent({
    type: 'lead_updated',
    leadId,
    assignedTo: agentId,
    oldAssigned: null,
    stageId: calificadoStage?.id ?? '',
    oldStageId: '',
  })

  return agentId
}

/**
 * Cierre normal del bot: califica y asigna; después, con el [RESUMEN], crea
 * la propuesta en borrador para el vendedor (bot-propuesta.ts).
 */
export async function performHandoff(
  lead: LeadConContacto,
  conversationId: string,
  lastMessage: string,
  resumen: string | null = null,
  config: ConfigPropuestaAutomatica = null,
): Promise<void> {
  const agentId = await qualifyAndAssign(lead.id, conversationId, lastMessage, resumen)
  await crearPropuestaAutomatica({
    leadId: lead.id,
    conversationId,
    assignedTo: agentId ?? lead.assignedTo ?? null,
    nombreContacto: lead.contact?.name ?? null,
    resumen,
    config,
  })
}

/**
 * El cliente escribió después de recibir la propuesta: el bot no contesta.
 * Se apaga para este lead, deja nota interna y avisa al asignado por push.
 */
export async function pausarBotPorPropuestaEnviada(
  lead: LeadConContacto,
  conversationId: string,
  inboundMessageId: string,
): Promise<void> {
  const assignedTo = lead.assignedTo ?? null
  await db.update(leads)
    .set({ botEnabled: false, updatedAt: new Date() })
    .where(eq(leads.id, lead.id))
  await db.insert(activityLog).values({
    leadId: lead.id,
    action: 'bot_disabled',
    metadata: { motivo: 'el cliente escribió después de la propuesta enviada; el bot no responde' },
  })

  const entrante = await db.query.messages.findFirst({
    where: eq(messages.id, inboundMessageId),
    columns: { body: true },
  })
  const preview = (entrante?.body ?? '').replace(/\s+/g, ' ').trim().slice(0, 160)

  await dejarNotaInternaBot({
    leadId: lead.id,
    conversationId,
    assignedTo,
    texto:
      'El cliente escribió después de recibir la propuesta. El bot no respondió (se apagó para este lead): ' +
      'contestá vos.' + (preview ? `\n\nÚltimo mensaje: "${preview}"` : ''),
  })
  await alertarEquipoBot({
    conversationId,
    assignedTo,
    titulo: `${lead.contact?.name ?? 'Un lead'} respondió a la propuesta`,
    cuerpo: preview || 'Escribió después de la propuesta. El bot no respondió: contestá vos.',
  })
}

/**
 * La persona pide que la llamen, una visita o una reunión: respuesta corta,
 * handoff inmediato con etiqueta "pide-reunion" y push al asignado.
 */
export async function derivarPorPedidoDeReunion(
  lead: LeadConContacto,
  conversationId: string,
  contactPhone: string,
  mensajeDelUsuario: string,
): Promise<void> {
  await db.insert(messages).values({
    conversationId,
    direction: 'outbound',
    senderType: 'bot',
    contentType: 'text',
    body: RESPUESTA_PIDE_REUNION,
    isRead: true,
    sentAt: new Date(),
  })
  await publishCrmEvent({
    type: 'new_message',
    conversationId,
    leadId: lead.id,
    assignedTo: lead.assignedTo ?? null,
    direction: 'outbound',
  })
  await db.update(leads)
    .set({ botTurnCount: (lead.botTurnCount ?? 0) + 1, updatedAt: new Date() })
    .where(eq(leads.id, lead.id))
  try {
    await sendTextMessage(contactPhone, RESPUESTA_PIDE_REUNION)
  } catch (err) {
    console.error('[bot] Error enviando mensaje por WhatsApp:', err)
  }

  const pedido = mensajeDelUsuario.replace(/\s+/g, ' ').trim().slice(0, 200)
  const resumen = `Pide llamada / visita / reunión. Mensaje: "${pedido}"`
  const agentId = await qualifyAndAssign(lead.id, conversationId, RESPUESTA_PIDE_REUNION, resumen)
  try {
    await agregarTagALead(lead.id, TAG_PIDE_REUNION, { motivo: 'bot: pide llamada / visita / reunión' })
  } catch (err) {
    console.error('[bot] no se pudo etiquetar pide-reunion:', err)
  }
  await alertarEquipoBot({
    conversationId,
    assignedTo: agentId ?? lead.assignedTo ?? null,
    titulo: `${lead.contact?.name ?? 'Un lead'} pide que lo contacten`,
    cuerpo: pedido || 'Pide llamada, visita o reunión. Contactalo ahora.',
  })
}

/**
 * Cierre por producto que no hacemos: el bot se apaga para el lead, que queda
 * en su etapa (no pasa a Calificado) con la etiqueta de lista de espera.
 */
export async function cerrarSinCalificar(
  lead: LeadConContacto,
  conversationId: string,
  productos: string[],
  resumen: string | null,
): Promise<void> {
  await db.update(leads)
    .set({ botEnabled: false, updatedAt: new Date() })
    .where(eq(leads.id, lead.id))
  await db.insert(activityLog).values({
    leadId: lead.id,
    action: 'bot_disabled',
    metadata: { motivo: 'lista de espera', productos },
  })
  const lista = productos.join(', ')
  await dejarNotaInternaBot({
    leadId: lead.id,
    conversationId,
    assignedTo: lead.assignedTo ?? null,
    texto:
      `Pide ${lista}: no lo hacemos. Queda en lista de espera (etiqueta) y NO pasa a Calificado.` +
      (resumen ? `\n\nResumen del bot:\n${resumen}` : ''),
  })
}
