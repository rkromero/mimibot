import { eq, asc } from 'drizzle-orm'
import { db } from '@/db'
import {
  leads, conversations, messages, activityLog, pipelineStages, botConfig,
} from '@/db/schema'
import { anthropic, BOT_MODEL } from './client'
import { withRetry } from './retry'
import { sendTextMessage } from '@/lib/whatsapp/client'
import { emitLeadEvent } from '@/lib/realtime/broker'

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

  // Auto-handoff si se alcanzó el límite de turnos
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
  emitLeadEvent({
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
  }
}

async function performHandoff(
  leadId: string,
  conversationId: string,
  _contactPhone: string,
  lastMessage: string,
): Promise<void> {
  // Encontrar la etapa "contactado" o la siguiente no-terminal después de "nuevo"
  const stages = await db.query.pipelineStages.findMany({
    orderBy: [asc(pipelineStages.position)],
  })
  const contactedStage = stages.find((s) => s.slug === 'contactado') ?? stages.find((s) => !s.isTerminal && s.position > 0)

  await db.update(leads)
    .set({
      botEnabled: false,
      botQualified: true,
      ...(contactedStage ? { stageId: contactedStage.id } : {}),
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId))

  await db.insert(messages).values({
    conversationId,
    direction: 'outbound',
    senderType: 'system',
    contentType: 'internal_note',
    body: 'Lead calificado por el bot. Listo para el equipo de ventas.',
    isRead: true,
    sentAt: new Date(),
  })

  await db.insert(activityLog).values({
    leadId,
    action: 'bot_handoff',
    metadata: { lastBotMessage: lastMessage.slice(0, 200) },
  })
}

function checkHandoffPhrases(userMessage: string, phrases: string[]): boolean {
  const lower = userMessage.toLowerCase()
  const defaultPhrases = ['hablar con alguien', 'hablar con una persona', 'quiero un humano', 'agente humano']
  const allPhrases = [...defaultPhrases, ...phrases]
  return allPhrases.some((p) => lower.includes(p.toLowerCase()))
}
