import { eq, and, lte, isNotNull, isNull, asc, desc, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  leads, conversations, messages, activityLog, contacts, followUpTemplates, followUpConfig,
  whatsappTemplates, propuestas, users, pipelineStages,
} from '@/db/schema'
import { anthropic, BOT_MODEL } from '@/lib/claude/client'
import { withRetry } from '@/lib/claude/retry'
import { sendTextMessage, sendTemplateMessage, buildBodyComponents } from '@/lib/whatsapp/client'
import { publishCrmEvent } from '@/lib/realtime/broker'
import type { TemplateParameter } from '@/types/db'
import { primerNombre, resolveTemplateVariables, applyTemplateValues } from '@/lib/whatsapp/variables'
import { variablesParaChat } from '@/lib/whatsapp/apertura'
import { estaDentroDe24h } from '@/lib/whatsapp/ventana'
import { calcularEnvioSeguimientoPropuesta, renderMensajeSeguimientoPropuesta } from './propuesta'
import {
  calcularPrimerSeguimiento,
  calcularSeguimientoFinal,
  renderMensajeIndagacion,
  MENSAJE_FINAL_DEFAULT,
  MENSAJE_RETOMAR_FALLBACK,
  OFFSET_ARGENTINA_HORAS,
  type HorarioPermitido,
} from './indagacion'
import { generarMensajeRetomar } from '@/lib/claude/bot'
import { MOTIVO_AUTO_DESISTIO, MOTIVO_AUTO_SIN_RESPUESTA, type MotivoPerdida } from '@/lib/leads/motivos-perdida'

const DEFAULT_STALLING_PHRASES = [
  'lo voy a pensar',
  'lo pienso',
  'más adelante',
  'despues te aviso',
  'después te aviso',
  'no sé',
  'no se',
  'capaz',
  'me lo pienso',
  'te aviso',
  'en otro momento',
  'no tengo tiempo',
  'estoy ocupado',
  'luego veo',
  'ya te contacto',
  'dame tiempo',
  'lo consulto',
]

export function detectStalling(message: string, customPhrases: string[]): boolean {
  const lower = message.toLowerCase()
  const all = [...DEFAULT_STALLING_PHRASES, ...customPhrases]
  return all.some((p) => lower.includes(p.toLowerCase()))
}

export async function scheduleFollowUp(
  leadId: string,
  reason: 'no_response' | 'stalling' | 'manual',
  delayMinutes?: number,
): Promise<void> {
  const config = await db.query.followUpConfig.findFirst()
  if (config && !config.isEnabled) return

  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) })
  if (!lead || !lead.isOpen) return

  const maxFollowUps = config?.maxFollowUps ?? 3
  if ((lead.followUpCount ?? 0) >= maxFollowUps) return

  const retryHours = (config?.retryHours as number[] | null) ?? [1, 24, 72]
  const attemptIndex = Math.min(lead.followUpCount ?? 0, retryHours.length - 1)

  let delayMs: number
  if (delayMinutes !== undefined) {
    delayMs = delayMinutes * 60 * 1000
  } else if (reason === 'stalling') {
    delayMs = (config?.stallingDelayMinutes ?? 60) * 60 * 1000
  } else {
    delayMs = (retryHours[attemptIndex] ?? 24) * 60 * 60 * 1000
  }

  const nextFollowUpAt = new Date(Date.now() + delayMs)

  await db.update(leads)
    .set({ nextFollowUpAt, followUpStatus: 'pending', followUpReason: reason, updatedAt: new Date() })
    .where(eq(leads.id, leadId))

  await db.insert(activityLog).values({
    leadId,
    action: 'follow_up_scheduled',
    metadata: { reason, nextFollowUpAt: nextFollowUpAt.toISOString(), delayMinutes: Math.round(delayMs / 60000) },
  })
}

export async function cancelFollowUp(leadId: string): Promise<void> {
  await db.update(leads)
    .set({ nextFollowUpAt: null, followUpStatus: 'cancelled', updatedAt: new Date() })
    .where(eq(leads.id, leadId))

  await db.insert(activityLog).values({
    leadId,
    action: 'follow_up_cancelled',
    metadata: {},
  })
}

export async function processFollowUps(): Promise<{ processed: number; errors: number }> {
  const config = await db.query.followUpConfig.findFirst()
  if (config && !config.isEnabled) return { processed: 0, errors: 0 }

  const now = new Date()
  const pendingLeads = await db.query.leads.findMany({
    where: and(
      eq(leads.followUpStatus, 'pending'),
      isNotNull(leads.nextFollowUpAt),
      lte(leads.nextFollowUpAt, now),
      eq(leads.isOpen, true),
    ),
  })

  let processed = 0
  let errors = 0

  for (const lead of pendingLeads) {
    try {
      await processSingleFollowUp(lead, config ?? null)
      processed++
    } catch (err) {
      console.error(`[followup] Error processing lead ${lead.id}:`, err)
      await db.update(leads)
        .set({ followUpStatus: 'failed', updatedAt: new Date() })
        .where(eq(leads.id, lead.id))
      errors++
    }
  }

  return { processed, errors }
}

async function processSingleFollowUp(
  lead: typeof leads.$inferSelect,
  config: typeof followUpConfig.$inferSelect | null,
): Promise<void> {
  if (lead.followUpReason === 'propuesta') {
    await procesarSeguimientoPropuesta(lead, config)
    return
  }
  if (lead.followUpReason === 'indagacion' || lead.followUpReason === 'indagacion_final' || lead.followUpReason === 'indagacion_cierre') {
    await procesarSeguimientoIndagacion(lead, config)
    return
  }

  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.leadId, lead.id),
  })
  if (!conversation?.waContactPhone) return

  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, lead.contactId),
  })
  if (!contact) return

  const history = await db.query.messages.findMany({
    where: eq(messages.conversationId, conversation.id),
    orderBy: [asc(messages.sentAt)],
  })

  const lastMessage = history.filter((m) => m.direction === 'inbound').at(-1)
  const hoursSinceLast = lastMessage
    ? (Date.now() - lastMessage.sentAt.getTime()) / (1000 * 60 * 60)
    : 999

  const scenario = (lead.followUpReason as 'no_response' | 'stalling' | 'manual') ?? 'no_response'
  const maxFollowUps = config?.maxFollowUps ?? 3
  const retryHours = (config?.retryHours as number[] | null) ?? [1, 24, 72]

  let waMessageId: string
  let messageBody: string

  if (hoursSinceLast >= 24) {
    // Ventana cerrada — debe usar template aprobado de Meta
    const template = await db.query.followUpTemplates.findFirst({
      where: and(
        eq(followUpTemplates.isActive, true),
        eq(followUpTemplates.scenario, scenario),
        eq(followUpTemplates.isDefault, true),
      ),
    }) ?? await db.query.followUpTemplates.findFirst({
      where: eq(followUpTemplates.isActive, true),
    })

    if (!template) {
      throw new Error(`No hay template activo para el escenario "${scenario}". Configurá uno en Ajustes > Seguimiento.`)
    }

    const params = (template.parameters as TemplateParameter[]) ?? []
    const resolvedParams = params.map((p) => ({
      type: 'text' as const,
      text: resolveParam(p, lead, contact),
    }))

    waMessageId = await sendTemplateMessage(
      conversation.waContactPhone,
      template.templateName,
      template.language,
      resolvedParams.length ? [{ type: 'body', parameters: resolvedParams }] : undefined,
    )
    messageBody = template.bodyPreview
  } else {
    // Ventana abierta — Claude genera mensaje contextual
    messageBody = await generateFollowUpMessage(lead, contact, history, scenario)
    waMessageId = await sendTextMessage(conversation.waContactPhone, messageBody)
  }

  // Guardar mensaje en DB
  await db.insert(messages).values({
    conversationId: conversation.id,
    waMessageId,
    direction: 'outbound',
    senderType: 'bot',
    contentType: hoursSinceLast >= 24 ? 'template' : 'text',
    body: messageBody,
    isRead: true,
    sentAt: new Date(),
  })

  await publishCrmEvent({
    type: 'new_message',
    conversationId: conversation.id,
    leadId: lead.id,
    assignedTo: lead.assignedTo ?? null,
    direction: 'outbound',
  })

  const newCount = (lead.followUpCount ?? 0) + 1
  const hasMore = newCount < maxFollowUps

  // Programar siguiente intento si corresponde
  let nextFollowUpAt: Date | null = null
  let nextStatus: 'pending' | 'sent' = 'sent'
  if (hasMore) {
    const nextDelayHours = retryHours[Math.min(newCount, retryHours.length - 1)] ?? 72
    nextFollowUpAt = new Date(Date.now() + nextDelayHours * 60 * 60 * 1000)
    nextStatus = 'pending'
  }

  await db.update(leads)
    .set({
      followUpCount: newCount,
      followUpStatus: nextStatus,
      nextFollowUpAt,
      lastContactedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(leads.id, lead.id))

  await db.insert(activityLog).values({
    leadId: lead.id,
    action: 'follow_up_sent',
    metadata: {
      attempt: newCount,
      usedTemplate: hoursSinceLast >= 24,
      hasMore,
      nextFollowUpAt: nextFollowUpAt?.toISOString() ?? null,
    },
  })
}

async function generateFollowUpMessage(
  lead: typeof leads.$inferSelect,
  contact: typeof contacts.$inferSelect,
  history: Array<typeof messages.$inferSelect>,
  scenario: string,
): Promise<string> {
  const recent = history
    .filter((m) => m.senderType !== 'system' && m.contentType !== 'internal_note')
    .slice(-8)
    .map((m) => `${m.senderType === 'contact' ? 'Cliente' : 'Nosotros'}: ${m.body ?? ''}`)
    .join('\n')

  const scenarioHint =
    scenario === 'stalling'
      ? 'El cliente dijo que lo iba a pensar o que avisaría después.'
      : 'El cliente no respondió desde hace tiempo.'

  const prompt = `Sos un vendedor amigable. ${scenarioHint}

Historial reciente:
${recent}

Escribí UN mensaje corto (máximo 2 oraciones) para retomar la conversación de forma natural y devolver el interés. No uses saludos formales, no uses markdown, no menciones que es un seguimiento automático. Respondé solo con el mensaje.`

  const response = await withRetry(
    () =>
      anthropic.messages.create({
        model: BOT_MODEL,
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    2,
    800,
  )

  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
}

function resolveParam(
  param: TemplateParameter,
  lead: typeof leads.$inferSelect,
  contact: typeof contacts.$inferSelect,
): string {
  switch (param.source) {
    case 'contact.name': return contact.name
    case 'contact.firstName': return primerNombre(contact.name)
    case 'lead.productInterest': return lead.productInterest ?? ''
    case 'lead.notes': return lead.notes ?? ''
    case 'custom': return param.value ?? ''
    default: return ''
  }
}

// ─── Seguimiento después de enviar una propuesta ─────────────────────────────

/**
 * Programa el seguimiento de una propuesta recién enviada: a N horas del
 * último mensaje del cliente (dentro de la ventana de 24 hs → texto libre) o,
 * si eso ya no es posible, 22 hs después de la propuesta (va por plantilla).
 * Ocupa el único slot de seguimiento del lead (pisa uno pendiente de otro tipo).
 */
export async function programarSeguimientoPropuesta(leadId: string): Promise<void> {
  const config = await db.query.followUpConfig.findFirst()
  if (config && (!config.isEnabled || !config.propuestaEnabled)) return

  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId), columns: { id: true, isOpen: true } })
  if (!lead || !lead.isOpen) return

  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.leadId, leadId),
    columns: { id: true, waContactPhone: true },
  })
  if (!conversation?.waContactPhone) return

  const ultimo = await db.query.messages.findFirst({
    where: and(eq(messages.conversationId, conversation.id), eq(messages.direction, 'inbound')),
    orderBy: [desc(messages.sentAt)],
    columns: { sentAt: true },
  })

  const plan = calcularEnvioSeguimientoPropuesta({
    ahora: new Date(),
    ultimoMensajeClienteAt: ultimo?.sentAt ?? null,
    horasDesdeUltimoMensaje: config?.propuestaHoras ?? 23,
  })

  await db.update(leads)
    .set({ nextFollowUpAt: plan.enviarAt, followUpStatus: 'pending', followUpReason: 'propuesta', updatedAt: new Date() })
    .where(eq(leads.id, leadId))

  await db.insert(activityLog).values({
    leadId,
    action: 'follow_up_scheduled',
    metadata: { reason: 'propuesta', nextFollowUpAt: plan.enviarAt.toISOString(), dentroVentana: plan.dentroVentana },
  })
}

/** El cliente escribió: el seguimiento de la propuesta ya no hace falta. */
export async function cancelarSeguimientoPropuestaPorRespuesta(leadId: string): Promise<boolean> {
  const rows = await db.update(leads)
    .set({ nextFollowUpAt: null, followUpStatus: 'cancelled', updatedAt: new Date() })
    .where(and(eq(leads.id, leadId), eq(leads.followUpStatus, 'pending'), eq(leads.followUpReason, 'propuesta')))
    .returning({ id: leads.id })
  if (rows.length === 0) return false

  await db.insert(activityLog).values({
    leadId,
    action: 'follow_up_cancelled',
    metadata: { reason: 'propuesta', motivo: 'el cliente respondió' },
  })
  return true
}

async function nombreVendedorParaSeguimiento(lead: typeof leads.$inferSelect): Promise<string | null> {
  const propuesta = await db.query.propuestas.findFirst({
    where: and(eq(propuestas.leadId, lead.id), isNull(propuestas.deletedAt)),
    orderBy: [desc(propuestas.updatedAt)],
    columns: { creadoPor: true },
  })
  const userId = propuesta?.creadoPor ?? lead.assignedTo
  if (!userId) return null
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { name: true } })
  return user?.name ?? null
}

async function procesarSeguimientoPropuesta(
  lead: typeof leads.$inferSelect,
  config: typeof followUpConfig.$inferSelect | null,
): Promise<void> {
  const marcar = async (status: 'sent' | 'failed', metadata: Record<string, unknown>) => {
    await db.update(leads)
      .set({ followUpStatus: status, nextFollowUpAt: null, lastContactedAt: status === 'sent' ? new Date() : undefined, updatedAt: new Date() })
      .where(eq(leads.id, lead.id))
    await db.insert(activityLog).values({
      leadId: lead.id,
      // No hay valor 'failed' en el enum de actividad: se registra como cancelado con el motivo
      action: status === 'sent' ? 'follow_up_sent' : 'follow_up_cancelled',
      metadata: { reason: 'propuesta', ...metadata },
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
  const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, lead.contactId), columns: { name: true } })
  const vendedorNombre = await nombreVendedorParaSeguimiento(lead)
  const clienteNombre = contact?.name ?? null

  const dentroVentana = await estaDentroDe24h(conversation.id)
  let body: string
  let contentType: 'text' | 'template'
  let waMessageId: string | null = null

  if (dentroVentana) {
    body = renderMensajeSeguimientoPropuesta(config?.propuestaMensaje, { clienteNombre, vendedorNombre })
    contentType = 'text'
    waMessageId = await sendTextMessage(conversation.waContactPhone, body)
  } else {
    const templateName = config?.propuestaTemplateName ?? null
    const templateLang = config?.propuestaTemplateLang ?? 'es'
    const tmpl = templateName
      ? await db.query.whatsappTemplates.findFirst({
          where: and(
            eq(whatsappTemplates.name, templateName),
            eq(whatsappTemplates.language, templateLang),
            eq(whatsappTemplates.status, 'APPROVED'),
          ),
          columns: { bodyText: true, variables: true },
        })
      : null

    if (!tmpl || !templateName) {
      // Sin plantilla de respaldo: nota interna para que el vendedor lo mande a mano
      await db.insert(messages).values({
        conversationId: conversation.id,
        direction: 'outbound',
        senderType: 'system',
        contentType: 'internal_note',
        body: 'Seguimiento de propuesta pendiente: la ventana de 24 hs está cerrada y no hay plantilla de respaldo configurada (Ajustes → Seguimiento). Mandalo a mano desde el panel de plantillas del chat.',
        isRead: true,
        sentAt: new Date(),
      })
      await marcar('failed', { motivo: 'ventana_cerrada_sin_plantilla' })
      await publishCrmEvent({ type: 'new_message', conversationId: conversation.id, leadId: lead.id, assignedTo: lead.assignedTo ?? null, direction: 'outbound' })
      return
    }

    const vars = variablesParaChat(tmpl.bodyText, tmpl.variables)
    const valores = resolveTemplateVariables(vars, {
      clienteNombre: clienteNombre ?? undefined,
      vendedorNombre: vendedorNombre ?? undefined,
      productoInteres: lead.productInterest ?? undefined,
    })
    body = applyTemplateValues(tmpl.bodyText, valores).trim()
    contentType = 'template'
    waMessageId = await sendTemplateMessage(conversation.waContactPhone, templateName, templateLang, buildBodyComponents(valores))
  }

  await db.insert(messages).values({
    conversationId: conversation.id,
    waMessageId,
    direction: 'outbound',
    senderType: 'system',
    contentType,
    body,
    isRead: true,
    sentAt: new Date(),
  })
  await db.execute(
    sql`UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = ${conversation.id}`,
  )
  await marcar('sent', { usedTemplate: !dentroVentana })
  await publishCrmEvent({ type: 'new_message', conversationId: conversation.id, leadId: lead.id, assignedTo: lead.assignedTo ?? null, direction: 'outbound' })
}

// ─── Seguimiento de indagación (leads en Nuevo que dejan de responder al bot) ─

type FollowUpCfg = typeof followUpConfig.$inferSelect | null | undefined

function horarioDe(config: FollowUpCfg): HorarioPermitido {
  return { desde: config?.horarioDesde ?? 8, hasta: config?.horarioHasta ?? 22, offsetHoras: OFFSET_ARGENTINA_HORAS }
}

/** ¿El lead sigue en indagación: abierto, en Nuevo y con el bot calificando? */
async function leadEnIndagacion(leadId: string): Promise<(typeof leads.$inferSelect) | null> {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) })
  if (!lead || !lead.isOpen || !lead.botEnabled || lead.botQualified) return null
  const stage = await db.query.pipelineStages.findFirst({ where: eq(pipelineStages.id, lead.stageId), columns: { slug: true } })
  if (stage?.slug !== 'nuevo') return null
  return lead
}

/**
 * El bot acaba de escribir: programar el primer seguimiento a N horas si la
 * persona no responde. Cada mensaje del bot reinicia el reloj.
 */
export async function programarSeguimientoIndagacion(leadId: string): Promise<void> {
  const config = await db.query.followUpConfig.findFirst()
  if (config && (!config.isEnabled || !config.indagacionEnabled)) return
  const lead = await leadEnIndagacion(leadId)
  if (!lead) return

  const at = calcularPrimerSeguimiento(new Date(), config?.indagacionHoras ?? 2, horarioDe(config))
  await db.update(leads)
    .set({ nextFollowUpAt: at, followUpStatus: 'pending', followUpReason: 'indagacion', updatedAt: new Date() })
    .where(eq(leads.id, leadId))
  await db.insert(activityLog).values({
    leadId,
    action: 'follow_up_scheduled',
    metadata: { reason: 'indagacion', nextFollowUpAt: at.toISOString() },
  })
}

/**
 * Llegó un mensaje de la persona. Si estaba esperando respuesta al mensaje
 * final y la respuesta es "más adelante / lo pienso", pasa a Perdido. En
 * cualquier otro caso, cancela el seguimiento pendiente y la charla sigue.
 * Devuelve true si el lead se cerró como perdido.
 */
export async function manejarRespuestaClienteIndagacion(leadId: string, texto: string): Promise<boolean> {
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, leadId),
    columns: { id: true, followUpStatus: true, followUpReason: true, isOpen: true },
  })
  if (!lead || !lead.isOpen) return false
  const reason = lead.followUpReason
  if (reason !== 'indagacion' && reason !== 'indagacion_final' && reason !== 'indagacion_cierre') return false

  const esperandoRespuestaAlFinal =
    (reason === 'indagacion_final' && lead.followUpStatus === 'sent') || reason === 'indagacion_cierre'
  if (esperandoRespuestaAlFinal && texto.trim()) {
    const config = await db.query.followUpConfig.findFirst()
    if (detectStalling(texto, config?.stallingPhrases ?? [])) {
      await marcarLeadPerdido(leadId, 'Respondió al mensaje final que lo deja para más adelante', MOTIVO_AUTO_DESISTIO)
      return true
    }
  }

  if (lead.followUpStatus === 'pending') {
    await db.update(leads)
      .set({ nextFollowUpAt: null, followUpStatus: 'cancelled', updatedAt: new Date() })
      .where(eq(leads.id, leadId))
    await db.insert(activityLog).values({
      leadId,
      action: 'follow_up_cancelled',
      metadata: { reason, motivo: 'la persona respondió' },
    })
  }
  return false
}

/** Cierra el lead en "Cerrado Perdido" con nota y actividad. */
export async function marcarLeadPerdido(leadId: string, motivo: string, codigo: MotivoPerdida = MOTIVO_AUTO_SIN_RESPUESTA): Promise<void> {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId), columns: { id: true, stageId: true, assignedTo: true } })
  if (!lead) return
  const perdido = await db.query.pipelineStages.findFirst({ where: eq(pipelineStages.slug, 'cerrado-lost'), columns: { id: true } })
    ?? await db.query.pipelineStages.findFirst({ where: and(eq(pipelineStages.isTerminal, true), eq(pipelineStages.isWon, false)), columns: { id: true } })

  await db.update(leads)
    .set({
      ...(perdido ? { stageId: perdido.id } : {}),
      isOpen: false,
      botEnabled: false,
      nextFollowUpAt: null,
      followUpStatus: 'sent',
      perdidoAt: new Date(),
      motivoPerdida: codigo,
      motivoPerdidaDetalle: motivo,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId))

  await db.insert(activityLog).values({
    leadId,
    action: 'stage_changed',
    metadata: { fromStageId: lead.stageId, toStageId: perdido?.id ?? null, auto: true, motivoPerdida: codigo, detalle: motivo },
  })

  const conversation = await db.query.conversations.findFirst({ where: eq(conversations.leadId, leadId), columns: { id: true } })
  if (conversation) {
    await db.insert(messages).values({
      conversationId: conversation.id,
      direction: 'outbound',
      senderType: 'system',
      contentType: 'internal_note',
      body: `Lead cerrado como perdido automáticamente: ${motivo}. Si vuelve a escribir, se crea un lead nuevo con esta misma conversación.`,
      isRead: true,
      sentAt: new Date(),
    })
  }

  await publishCrmEvent({
    type: 'lead_updated',
    leadId,
    assignedTo: lead.assignedTo ?? null,
    oldAssigned: lead.assignedTo ?? null,
    stageId: perdido?.id ?? '',
    oldStageId: lead.stageId,
  })
}

async function procesarSeguimientoIndagacion(
  lead: typeof leads.$inferSelect,
  config: FollowUpCfg,
): Promise<void> {
  const reason = lead.followUpReason as 'indagacion' | 'indagacion_final' | 'indagacion_cierre'

  // Cierre: pasó el plazo del mensaje final sin respuesta
  if (reason === 'indagacion_cierre') {
    await marcarLeadPerdido(lead.id, 'Sin respuesta al mensaje final de seguimiento', MOTIVO_AUTO_SIN_RESPUESTA)
    return
  }

  const cancelar = async (motivo: string) => {
    await db.update(leads)
      .set({ nextFollowUpAt: null, followUpStatus: 'cancelled', updatedAt: new Date() })
      .where(eq(leads.id, lead.id))
    await db.insert(activityLog).values({ leadId: lead.id, action: 'follow_up_cancelled', metadata: { reason, motivo } })
  }

  // Si ya no está en indagación (lo tomó un humano, cambió de etapa, se cerró), no molestar
  const vigente = await leadEnIndagacion(lead.id)
  if (!vigente) {
    await cancelar('el lead ya no está en indagación')
    return
  }

  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.leadId, lead.id),
    columns: { id: true, waContactPhone: true },
  })
  if (!conversation?.waContactPhone) {
    await cancelar('sin conversación de WhatsApp')
    return
  }

  const ultimoInbound = await db.query.messages.findFirst({
    where: and(eq(messages.conversationId, conversation.id), eq(messages.direction, 'inbound')),
    orderBy: [desc(messages.sentAt)],
    columns: { sentAt: true },
  })
  const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, lead.contactId), columns: { name: true } })
  const datos = { clienteNombre: contact?.name ?? null, productoInteres: lead.productInterest }

  if (!(await estaDentroDe24h(conversation.id))) {
    // Sin ventana no se puede mandar texto libre. Se deja nota y se sigue el flujo.
    await db.insert(messages).values({
      conversationId: conversation.id,
      direction: 'outbound',
      senderType: 'system',
      contentType: 'internal_note',
      body: `Seguimiento de indagación (${reason === 'indagacion' ? 'retomar' : 'mensaje final'}) no enviado: la ventana de 24 hs está cerrada. Podés mandarle una plantilla desde el chat.`,
      isRead: true,
      sentAt: new Date(),
    })
    if (reason === 'indagacion_final') {
      await programarCierre(lead.id, config)
    } else {
      await cancelar('ventana de 24 hs cerrada')
    }
    return
  }

  let body: string
  if (reason === 'indagacion') {
    body = (await generarMensajeRetomar(lead.id, conversation.id))
      ?? renderMensajeIndagacion(config?.indagacionMensajeRetomar, datos, MENSAJE_RETOMAR_FALLBACK)
  } else {
    body = renderMensajeIndagacion(config?.indagacionMensajeFinal, datos, MENSAJE_FINAL_DEFAULT)
  }

  const waMessageId = await sendTextMessage(conversation.waContactPhone, body)
  await db.insert(messages).values({
    conversationId: conversation.id,
    waMessageId,
    direction: 'outbound',
    senderType: 'bot',
    contentType: 'text',
    body,
    isRead: true,
    sentAt: new Date(),
  })
  await db.execute(
    sql`UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = ${conversation.id}`,
  )
  await publishCrmEvent({ type: 'new_message', conversationId: conversation.id, leadId: lead.id, assignedTo: lead.assignedTo ?? null, direction: 'outbound' })

  if (reason === 'indagacion') {
    // Programar el mensaje final dentro de la ventana de 24 hs
    const ahora = new Date()
    const at = calcularSeguimientoFinal({
      ultimoMensajeClienteAt: ultimoInbound?.sentAt ?? ahora,
      horas: config?.indagacionFinalHoras ?? 23,
      ahora,
      noAntesDe: new Date(ahora.getTime() + 60 * 60 * 1000),
      horario: horarioDe(config),
    })
    await db.update(leads)
      .set({ nextFollowUpAt: at, followUpStatus: 'pending', followUpReason: 'indagacion_final', lastContactedAt: ahora, updatedAt: ahora })
      .where(eq(leads.id, lead.id))
    await db.insert(activityLog).values({
      leadId: lead.id,
      action: 'follow_up_sent',
      metadata: { reason: 'indagacion', next: 'indagacion_final', nextFollowUpAt: at.toISOString() },
    })
  } else {
    await db.update(leads)
      .set({ followUpStatus: 'sent', lastContactedAt: new Date(), updatedAt: new Date() })
      .where(eq(leads.id, lead.id))
    await db.insert(activityLog).values({ leadId: lead.id, action: 'follow_up_sent', metadata: { reason: 'indagacion_final' } })
    await programarCierre(lead.id, config)
  }
}

/** Después del mensaje final: si no responde en K horas, pasa a Perdido. */
async function programarCierre(leadId: string, config: FollowUpCfg): Promise<void> {
  const at = new Date(Date.now() + (config?.indagacionCierreHoras ?? 24) * 60 * 60 * 1000)
  await db.update(leads)
    .set({ nextFollowUpAt: at, followUpStatus: 'pending', followUpReason: 'indagacion_cierre', updatedAt: new Date() })
    .where(eq(leads.id, leadId))
  await db.insert(activityLog).values({
    leadId,
    action: 'follow_up_scheduled',
    metadata: { reason: 'indagacion_cierre', nextFollowUpAt: at.toISOString() },
  })
}
