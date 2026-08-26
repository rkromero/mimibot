import { eq, asc } from 'drizzle-orm'
import { db } from '@/db'
import {
  leads, conversations, messages, activityLog, pipelineStages, botConfig,
} from '@/db/schema'
import { anthropic, BOT_MODEL } from './client'
import { withRetry } from './retry'
import { sendTextMessage } from '@/lib/whatsapp/client'
import { publishCrmEvent } from '@/lib/realtime/broker'
import { programarSeguimientoIndagacion } from '@/lib/followup/engine'
import { assignLeadByRule } from '@/lib/assignment'
import { armarContextoLead, armarHistorialClaude, separarResumen, extraerScore, HANDOFF_MARKER } from './bot-context'

const DEFAULT_SYSTEM_PROMPT = `Sos un asistente de ventas. Tu objetivo es calificar al lead de manera conversacional y amable.

Hacé estas preguntas de a una, en orden natural:
1. ¿Cuál es tu nombre?
2. ¿Qué estás buscando o en qué te podemos ayudar?
3. ¿Cuál es tu presupuesto aproximado?
4. ¿Para cuándo lo necesitás?

Cuando hayas obtenido toda la información de calificación, O cuando el usuario pida explícitamente hablar con una persona, incluí ${HANDOFF_MARKER} al final de tu mensaje de despedida.

Respondé siempre en el mismo idioma que el usuario. Sé breve y conversacional. No uses listas ni markdown. Máximo 2-3 oraciones por respuesta.`

export async function processBotTurn(params: {
  leadId: string
  conversationId: string
  inboundMessageId: string
  contactPhone: string
}): Promise<void> {
  const { leadId, conversationId, contactPhone } = params

  // Cargar lead y configuración del bot
  const [lead, config] = await Promise.all([
    db.query.leads.findFirst({
      where: eq(leads.id, leadId),
      with: { contact: { columns: { name: true } } },
    }),
    db.query.botConfig.findFirst(),
  ])

  if (!lead || !lead.botEnabled) return
  if (lead.botQualified) return

  // No activar bot para conversaciones de clientes
  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
    columns: { clienteId: true },
  })
  if (conv?.clienteId) return

  // <<CRITERIO_DE_CALIFICACION>>: definir la condición que marca al lead como calificado.
  // Actualmente se califica (handoff) cuando: el bot supera maxTurns, el bot incluye
  // [HANDOFF] en su respuesta, o el usuario escribe una frase de handoff.
  if (lead.botTurnCount >= (config?.maxTurns ?? 6)) {
    await performHandoff(leadId, conversationId, contactPhone, 'Límite de turnos alcanzado.')
    return
  }

  const { systemPrompt, claudeMessages } = await construirContextoBot(lead, config, conversationId)
  if (claudeMessages.length === 0) return

  let claudeResponse: string
  try {
    const response = await withRetry(
      () =>
        anthropic.messages.create({
          model: BOT_MODEL,
          max_tokens: 512,
          system: systemPrompt,
          messages: claudeMessages,
        }),
      2,
      800,
    )
    claudeResponse = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
  } catch (err) {
    // Claude falló — loguear y no responder. El lead queda para atención manual.
    console.error('[bot] Claude error:', err)
    return
  }

  // <<CRITERIO_DE_CALIFICACION>>: condición principal — [HANDOFF] en respuesta del bot
  // o frase de handoff detectada en el último mensaje del usuario.
  // El bloque [RESUMEN] (datos relevados) nunca va al cliente: queda como nota interna.
  const { visible: cleanResponse, resumen, handoff } = separarResumen(claudeResponse)
  const shouldHandoff =
    handoff ||
    checkHandoffPhrases(claudeMessages.at(-1)?.content ?? '', config?.handoffPhrases ?? [])

  // Guardar respuesta del bot en DB
  await db.insert(messages).values({
    conversationId,
    direction: 'outbound',
    senderType: 'bot',
    contentType: 'text',
    body: cleanResponse,
    isRead: true,
    sentAt: new Date(),
  })

  // Emitir SSE para que el chat se actualice con la respuesta del bot
  await publishCrmEvent({
    type: 'new_message',
    conversationId,
    leadId,
    assignedTo: lead.assignedTo ?? null,
    direction: 'outbound',
  })

  // Incrementar contador de turnos
  await db.update(leads)
    .set({ botTurnCount: (lead.botTurnCount ?? 0) + 1, updatedAt: new Date() })
    .where(eq(leads.id, leadId))

  // Enviar por WhatsApp
  try {
    await sendTextMessage(contactPhone, cleanResponse)
  } catch (err) {
    console.error('[bot] Error enviando mensaje por WhatsApp:', err)
  }

  if (shouldHandoff) {
    await performHandoff(leadId, conversationId, contactPhone, cleanResponse, resumen)
    return
  }

  // El bot acaba de escribir: si la persona no responde, seguimiento de indagación
  // (2 hs → retomar la pregunta; 23 hs → mensaje final; luego Perdido).
  try {
    await programarSeguimientoIndagacion(leadId)
  } catch (err) {
    console.error('[bot] no se pudo programar el seguimiento de indagación:', err)
  }
}

type LeadConContacto = typeof leads.$inferSelect & { contact?: { name: string | null } | null }

/**
 * System prompt (config + lo que ya sabemos del lead) e historial en turnos
 * para Claude. Lo usan el turno normal del bot y el mensaje para retomar.
 */
export async function construirContextoBot(
  lead: LeadConContacto,
  config: typeof botConfig.$inferSelect | null | undefined,
  conversationId: string,
): Promise<{ systemPrompt: string; claudeMessages: Array<{ role: 'user' | 'assistant'; content: string }> }> {
  const history = await db.query.messages.findMany({
    where: eq(messages.conversationId, conversationId),
    orderBy: [asc(messages.sentAt)],
  })

  // Contacto → user; bot y equipo (apertura con plantilla, textos del vendedor) → assistant.
  // Si la conversación arrancó con mensajes del equipo, van al contexto del system prompt.
  const { turnos: claudeMessages, previosDelEquipo } = armarHistorialClaude(history)

  // Lo que ya sabemos del lead (formulario del landing, notas) para que el bot
  // no vuelva a saludar ni a preguntar lo que ya está cargado.
  const customFields = (lead.customFields ?? {}) as Record<string, unknown>
  const empresa = typeof customFields['empresa'] === 'string' ? customFields['empresa'] : null
  const contextoLead = armarContextoLead(
    {
      contactName: lead.contact?.name ?? null,
      empresa,
      productoInteres: lead.productInterest,
      localidad: lead.localidad,
      direccion: lead.direccion,
      notas: lead.notes,
    },
    previosDelEquipo,
  )

  const basePrompt = config?.systemPrompt || DEFAULT_SYSTEM_PROMPT
  const systemPrompt = contextoLead ? `${basePrompt}\n\n${contextoLead}` : basePrompt
  return { systemPrompt, claudeMessages }
}

/**
 * Mensaje corto para retomar la indagación cuando la persona dejó de responder:
 * vuelve sobre la pregunta que quedó pendiente, sin saludar ni presentarse.
 * Devuelve null si Claude falla (el caller usa un texto fijo).
 */
export async function generarMensajeRetomar(leadId: string, conversationId: string): Promise<string | null> {
  const [lead, config] = await Promise.all([
    db.query.leads.findFirst({ where: eq(leads.id, leadId), with: { contact: { columns: { name: true } } } }),
    db.query.botConfig.findFirst(),
  ])
  if (!lead) return null

  const { systemPrompt, claudeMessages } = await construirContextoBot(lead, config, conversationId)
  if (claudeMessages.length === 0) return null

  const instruccion =
    '[Instrucción del sistema, no es un mensaje de la persona] Pasaron unas horas y la persona no respondió tu último mensaje. ' +
    'Escribí UN solo mensaje breve (máximo 2 oraciones) para retomar: volvé sobre la pregunta que quedó pendiente, ' +
    'de forma amable y fácil de contestar. No saludes de nuevo, no te presentes, no repitas información ya dada, ' +
    'no digas que es un seguimiento automático, sin markdown ni listas. Respondé solo con el mensaje.'

  try {
    const response = await withRetry(
      () =>
        anthropic.messages.create({
          model: BOT_MODEL,
          max_tokens: 200,
          system: systemPrompt,
          messages: [...claudeMessages, { role: 'user', content: instruccion }],
        }),
      2,
      800,
    )
    const crudo = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
    const texto = separarResumen(crudo).visible
    return texto || null
  } catch (err) {
    console.error('[bot] Claude error generando mensaje para retomar:', err)
    return null
  }
}

async function qualifyAndAssign(
  leadId: string,
  conversationId: string,
  lastMessage: string,
  resumen: string | null = null,
): Promise<void> {
  const stages = await db.query.pipelineStages.findMany({
    orderBy: [asc(pipelineStages.position)],
  })

  const nuevoStage = stages.find((s) => s.slug === 'nuevo')
  const calificadoStage =
    stages.find((s) => s.slug === 'calificado') ??
    stages.find((s) => !s.isTerminal && s.position > (nuevoStage?.position ?? -1))

  const agentId = await assignLeadByRule()
  if (agentId === null) {
    console.warn('[bot] qualifyAndAssign: sin agentes elegibles, lead sin asignar', { leadId })
  }

  const { score, grado } = extraerScore(resumen)

  await db.update(leads)
    .set({
      botEnabled: false,
      botQualified: true,
      ...(calificadoStage ? { stageId: calificadoStage.id } : {}),
      ...(agentId !== null ? { assignedTo: agentId } : {}),
      ...(score !== null ? { botScore: score } : {}),
      ...(grado ? { botGrado: grado } : {}),
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
}

async function performHandoff(
  leadId: string,
  conversationId: string,
  _contactPhone: string,
  lastMessage: string,
  resumen: string | null = null,
): Promise<void> {
  await qualifyAndAssign(leadId, conversationId, lastMessage, resumen)
}

function checkHandoffPhrases(userMessage: string, phrases: string[]): boolean {
  const lower = userMessage.toLowerCase()
  const defaultPhrases = ['hablar con alguien', 'hablar con una persona', 'quiero un humano', 'agente humano']
  const allPhrases = [...defaultPhrases, ...phrases]
  return allPhrases.some((p) => lower.includes(p.toLowerCase()))
}

