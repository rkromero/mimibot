/**
 * Cadencia después de la propuesta (día 3 y aviso de vencimiento): la parte
 * que toca la base. Las reglas están en `propuesta-cadencia.ts`.
 *
 * Usa el mismo slot de seguimiento del lead (leads.next_follow_up_at /
 * follow_up_reason) que el resto de los seguimientos, y solo lo ocupa si está
 * libre o lo tiene otro paso de la propuesta: nunca pisa un "último
 * seguimiento", una muestra ni una indagación.
 */
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  activityLog, contacts, conversations, followUpConfig, leads, messages, pipelineStages, propuestas, whatsappTemplates,
} from '@/db/schema'
import { publishCrmEvent } from '@/lib/realtime/broker'
import { buildBodyComponents, sendTemplateMessage } from '@/lib/whatsapp/client'
import { primerNombre } from '@/lib/whatsapp/variables'
import { SLUG_ETAPA_PROPUESTA_ENVIADA } from '@/lib/leads/propuesta-enviada'
import { OFFSET_ARGENTINA_HORAS, type HorarioPermitido } from './indagacion'
import { botApagadoAMano } from './propuesta'
import { REASON_PROPUESTA_VISTA } from './propuesta-vista'
import {
  REASON_PROPUESTA_RECORDATORIO,
  REASON_PROPUESTA_VENCE,
  TEMPLATE_PROPUESTA_RECORDATORIO,
  TEMPLATE_PROPUESTA_VENCE,
  calcularRecordatorioPropuesta,
  decidirPasoCadencia,
  formatVigencia,
  limiteAvisoVencimiento,
  siguientePasoCadencia,
  type PasoCadencia,
} from './propuesta-cadencia'

type Lead = typeof leads.$inferSelect
type Config = typeof followUpConfig.$inferSelect | null | undefined

/** Motivos del slot que esta cadencia puede reemplazar. */
const REASONS_PROPUESTA = ['propuesta', REASON_PROPUESTA_VISTA, REASON_PROPUESTA_RECORDATORIO, REASON_PROPUESTA_VENCE]

export function esPasoCadencia(reason: string | null | undefined): reason is PasoCadencia {
  return reason === REASON_PROPUESTA_RECORDATORIO || reason === REASON_PROPUESTA_VENCE
}

function horarioDe(config: Config): HorarioPermitido {
  return { desde: config?.horarioDesde ?? 8, hasta: config?.horarioHasta ?? 22, offsetHoras: OFFSET_ARGENTINA_HORAS }
}

/** "YYYY-MM-DD" de hoy en Argentina. */
function hoyAR(): string {
  return new Date(Date.now() + OFFSET_ARGENTINA_HORAS * 3600_000).toISOString().slice(0, 10)
}

/** Última propuesta enviada del lead y cuándo salió. */
async function propuestaVigenteDelLead(leadId: string) {
  const propuesta = await db.query.propuestas.findFirst({
    where: and(eq(propuestas.leadId, leadId), eq(propuestas.estado, 'enviada'), isNull(propuestas.deletedAt)),
    orderBy: [desc(propuestas.updatedAt)],
    columns: { id: true, vigenteHasta: true, updatedAt: true },
  })
  if (!propuesta) return null
  const [envio] = await db
    .select({ at: activityLog.createdAt })
    .from(activityLog)
    .where(and(
      eq(activityLog.leadId, leadId),
      eq(activityLog.action, 'propuesta_enviada'),
      sql`${activityLog.metadata}->>'propuestaId' = ${propuesta.id}`,
    ))
    .orderBy(activityLog.createdAt)
    .limit(1)
  return { id: propuesta.id, vigenteHasta: String(propuesta.vigenteHasta), enviadaAt: envio?.at ?? propuesta.updatedAt }
}

async function enEtapaPropuesta(lead: Pick<Lead, 'stageId'>): Promise<boolean | null> {
  const etapa = await db.query.pipelineStages.findFirst({
    where: eq(pipelineStages.slug, SLUG_ETAPA_PROPUESTA_ENVIADA),
    columns: { id: true },
  })
  return etapa ? lead.stageId === etapa.id : null
}

/**
 * Programa el próximo toque de la cadencia después de `ultimoPaso` (null = el
 * primero, día 3). No hace nada si el slot lo tiene otro seguimiento, si el
 * lead no está en "Propuesta enviada" o si no queda ningún toque por mandar.
 */
export async function programarCadenciaPropuesta(leadId: string, ultimoPaso: PasoCadencia | null): Promise<void> {
  const config = await db.query.followUpConfig.findFirst()
  if (config && (!config.isEnabled || !config.propuestaEnabled)) return

  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) })
  if (!lead || !lead.isOpen || botApagadoAMano(lead)) return
  if (lead.followUpStatus === 'pending' && !REASONS_PROPUESTA.includes(lead.followUpReason ?? '')) return
  if ((await enEtapaPropuesta(lead)) === false) return

  const propuesta = await propuestaVigenteDelLead(leadId)
  if (!propuesta || propuesta.vigenteHasta < hoyAR()) return

  const siguiente = siguientePasoCadencia({
    ahora: new Date(),
    propuestaEnviadaAt: propuesta.enviadaAt,
    vigenteHasta: propuesta.vigenteHasta,
    ultimoPaso,
    horario: horarioDe(config),
  })
  if (!siguiente) return

  // Solo si el slot sigue libre o en manos de la propuesta (evita pisar algo programado en el medio)
  const rows = await db.update(leads)
    .set({ nextFollowUpAt: siguiente.at, followUpStatus: 'pending', followUpReason: siguiente.paso, updatedAt: new Date() })
    .where(and(
      eq(leads.id, leadId),
      sql`(${leads.followUpStatus} IS DISTINCT FROM 'pending' OR ${leads.followUpReason} IN (${sql.join(REASONS_PROPUESTA.map((r) => sql`${r}`), sql`, `)}))`,
    ))
    .returning({ id: leads.id })
  if (rows.length === 0) return

  await db.insert(activityLog).values({
    leadId,
    action: 'follow_up_scheduled',
    metadata: { reason: siguiente.paso, nextFollowUpAt: siguiente.at.toISOString(), propuestaId: propuesta.id },
  })
}

/** Manda el toque que venció (o lo pospone / omite) y deja programado el siguiente. */
export async function procesarPasoCadencia(lead: Lead, config: Config): Promise<void> {
  const paso = lead.followUpReason as PasoCadencia
  const marcar = async (status: 'sent' | 'failed' | 'cancelled', metadata: Record<string, unknown>) => {
    await db.update(leads)
      .set({ followUpStatus: status, nextFollowUpAt: null, lastContactedAt: status === 'sent' ? new Date() : undefined, updatedAt: new Date() })
      .where(eq(leads.id, lead.id))
    await db.insert(activityLog).values({
      leadId: lead.id,
      action: status === 'sent' ? 'follow_up_sent' : 'follow_up_cancelled',
      metadata: { reason: paso, ...metadata },
    })
  }

  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.leadId, lead.id),
    columns: { id: true, waContactPhone: true },
  })
  if (!conversation?.waContactPhone) {
    await marcar('failed', { motivo: 'sin_conversacion' })
    return
  }

  const horario = horarioDe(config)
  const propuesta = await propuestaVigenteDelLead(lead.id)
  const [ultimo] = await db
    .select({ at: sql<Date | null>`max(${messages.sentAt})` })
    .from(messages)
    .where(and(
      eq(messages.conversationId, conversation.id),
      sql`(${messages.direction} = 'inbound' OR (${messages.senderType} = 'agent' AND ${messages.contentType} NOT IN ('template', 'internal_note')))`,
    ))
  const limite = propuesta
    ? (paso === REASON_PROPUESTA_RECORDATORIO
        ? new Date(calcularRecordatorioPropuesta(propuesta.enviadaAt, horario).getTime() + 2 * 86400_000)
        : limiteAvisoVencimiento(propuesta.vigenteHasta, horario))
    : new Date()

  const accion = decidirPasoCadencia({
    ahora: new Date(),
    ultimoMensajeHumanoAt: ultimo?.at ? new Date(ultimo.at) : null,
    limite,
    enEtapaPropuesta: await enEtapaPropuesta(lead),
    botApagadoAMano: botApagadoAMano(lead),
    propuestaVigente: !!propuesta && propuesta.vigenteHasta >= hoyAR(),
    horario,
  })

  if (accion.tipo === 'posponer') {
    await db.update(leads)
      .set({ nextFollowUpAt: accion.hasta, followUpStatus: 'pending', updatedAt: new Date() })
      .where(eq(leads.id, lead.id))
    await db.insert(activityLog).values({
      leadId: lead.id,
      action: 'follow_up_scheduled',
      metadata: { reason: paso, nextFollowUpAt: accion.hasta.toISOString(), motivo: 'charla activa: se pospone' },
    })
    return
  }
  if (accion.tipo === 'omitir') {
    await marcar('cancelled', { motivo: accion.motivo })
    // Si solo se salteó el día 3 por charla activa, igual queda el aviso de vencimiento
    if (paso === REASON_PROPUESTA_RECORDATORIO && accion.motivo === 'la charla siguió activa') {
      await programarCadenciaPropuesta(lead.id, paso)
    }
    return
  }

  const templateName = paso === REASON_PROPUESTA_RECORDATORIO ? TEMPLATE_PROPUESTA_RECORDATORIO : TEMPLATE_PROPUESTA_VENCE
  const tmpl = await db.query.whatsappTemplates.findFirst({
    where: and(
      eq(whatsappTemplates.name, templateName),
      inArray(whatsappTemplates.language, ['es', 'es_AR']),
      eq(whatsappTemplates.status, 'APPROVED'),
    ),
    columns: { bodyText: true, language: true },
  })

  if (!tmpl) {
    const aviso = paso === REASON_PROPUESTA_RECORDATORIO
      ? 'Pasaron 3 días de la propuesta sin novedades. No salió el recordatorio automático porque la plantilla "propuesta_recordatorio" no está aprobada en WhatsApp: escribile a mano.'
      : `La propuesta vence el ${formatVigencia(propuesta!.vigenteHasta)}. No salió el aviso automático porque la plantilla "propuesta_vence" no está aprobada en WhatsApp: avisale a mano.`
    await db.insert(messages).values({
      conversationId: conversation.id,
      direction: 'outbound',
      senderType: 'system',
      contentType: 'internal_note',
      body: aviso,
      isRead: true,
      sentAt: new Date(),
    })
    await marcar('failed', { motivo: 'sin_plantilla', template: templateName })
    await publishCrmEvent({ type: 'new_message', conversationId: conversation.id, leadId: lead.id, assignedTo: lead.assignedTo ?? null, direction: 'outbound' })
    if (paso === REASON_PROPUESTA_RECORDATORIO) await programarCadenciaPropuesta(lead.id, paso)
    return
  }

  const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, lead.contactId), columns: { name: true } })
  const nombre = primerNombre(contact?.name) || 'cómo estás'
  const valores = paso === REASON_PROPUESTA_RECORDATORIO ? [nombre] : [nombre, formatVigencia(propuesta!.vigenteHasta)]
  const body = valores.reduce((t, v, i) => t.replaceAll(`{{${i + 1}}}`, v), tmpl.bodyText).trim()
  const waMessageId = await sendTemplateMessage(conversation.waContactPhone, templateName, tmpl.language, buildBodyComponents(valores))

  // A nombre del bot: si contesta, el bot post-propuesta sigue la charla
  await db.insert(messages).values({
    conversationId: conversation.id,
    waMessageId,
    direction: 'outbound',
    senderType: 'bot',
    contentType: 'template',
    body,
    isRead: true,
    sentAt: new Date(),
  })
  await db.execute(sql`UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = ${conversation.id}`)
  await marcar('sent', { template: templateName })
  await publishCrmEvent({ type: 'new_message', conversationId: conversation.id, leadId: lead.id, assignedTo: lead.assignedTo ?? null, direction: 'outbound' })

  if (paso === REASON_PROPUESTA_RECORDATORIO) await programarCadenciaPropuesta(lead.id, paso)
}
