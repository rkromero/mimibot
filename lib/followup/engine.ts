import { eq, and, lte, isNotNull } from 'drizzle-orm'
import { db } from '@/db'
import { leads, conversations, messages, activityLog, contacts, followUpTemplates, followUpConfig } from '@/db/schema'
import { asc } from 'drizzle-orm'
import { anthropic, BOT_MODEL } from '@/lib/claude/client'
import { withRetry } from '@/lib/claude/retry'
import { sendTextMessage, sendTemplateMessage } from '@/lib/whatsapp/client'
import { emitLeadEvent } from '@/lib/realtime/broker'
import type { TemplateParameter } from '@/types/db'

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

  emitLeadEvent({
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
    case 'lead.productInterest': return lead.productInterest ?? ''
    case 'lead.notes': return lead.notes ?? ''
    case 'custom': return param.value ?? ''
    default: return ''
  }
}
