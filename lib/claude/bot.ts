import { eq, asc } from 'drizzle-orm'
import { db } from '@/db'
import {
  leads, conversations, messages, activityLog, pipelineStages, botConfig,
} from '@/db/schema'
import { anthropic, BOT_MODEL } from './client'
import { withRetry } from './retry'
import { sendTextMessage } from '@/lib/whatsapp/client'
import { publishCrmEvent } from '@/lib/realtime/broker'
import { detectStalling, scheduleFollowUp } from '@/lib/followup/engine'
import { assignLeadByRule } from '@/lib/assignment'

// Marcador que Claude incluye cuando quiere hacer handoff
const HANDOFF_MARKER = '[HANDOFF]'

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
    db.query.leads.findFirst({ where: eq(leads.id, leadId) }),
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

  // Cargar historial de conversación (solo mensajes del contacto y del bot)
  const history = await db.query.messages.findMany({
    where: eq(messages.conversationId, conversationId),
    orderBy: [asc(messages.sentAt)],
  })

  const claudeMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []

  for (const msg of history) {
    if (msg.contentType === 'internal_note') continue
    if (msg.senderType === 'contact') {
      claudeMessages.push({ role: 'user', content: msg.body ?? '' })
    } else if (msg.senderType === 'bot') {
      claudeMessages.push({ role: 'assistant', content: msg.body ?? '' })
    }
  }

  if (claudeMessages.length === 0) return

  const systemPrompt = config?.systemPrompt || DEFAULT_SYSTEM_PROMPT

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
  const shouldHandoff =
    claudeResponse.includes(HANDOFF_MARKER) ||
    checkHandoffPhrases(claudeMessages.at(-1)?.content ?? '', config?.handoffPhrases ?? [])

  // Limpiar el marcador del texto visible
  const cleanResponse = claudeResponse.replace(HANDOFF_MARKER, '').trim()

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
    await performHandoff(leadId, conversationId, contactPhone, cleanResponse)
    return
  }

  // Detectar frases de estancamiento para agendar seguimiento
  const lastUserMsg = claudeMessages.filter((m) => m.role === 'user').at(-1)?.content ?? ''
  const followUpCfg = await db.query.followUpConfig.findFirst()
  if (followUpCfg?.isEnabled !== false) {
    const customPhrases = followUpCfg?.stallingPhrases ?? []
    if (detectStalling(lastUserMsg, customPhrases)) {
      await scheduleFollowUp(leadId, 'stalling')
    }
  }
}

async function qualifyAndAssign(
  leadId: string,
  conversationId: string,
  lastMessage: string,
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

  await db.update(leads)
    .set({
      botEnabled: false,
      botQualified: true,
      ...(calificadoStage ? { stageId: calificadoStage.id } : {}),
      ...(agentId !== null ? { assignedTo: agentId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId))

  const noteBody = agentId
    ? `Lead calificado y asignado al agente ${agentId}. Listo para el equipo de ventas.`
    : 'Lead calificado. Sin agentes disponibles para asignar.'

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
    metadata: { lastBotMessage: lastMessage.slice(0, 200), assignedTo: agentId },
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
): Promise<void> {
  await qualifyAndAssign(leadId, conversationId, lastMessage)
}

function checkHandoffPhrases(userMessage: string, phrases: string[]): boolean {
  const lower = userMessage.toLowerCase()
  const defaultPhrases = ['hablar con alguien', 'hablar con una persona', 'quiero un humano', 'agente humano']
  const allPhrases = [...defaultPhrases, ...phrases]
  return allPhrases.some((p) => lower.includes(p.toLowerCase()))
}

